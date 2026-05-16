import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";

const checkoutStatuses = [
  "created",
  "waiting_for_payment",
  "seen",
  "confirming",
  "confirmed",
  "payout_pending",
  "paid_out",
  "expired",
  "failed",
];

const payoutStatuses = ["pending", "processing", "sent", "failed"];

function assertAllowed(value: string, allowed: string[], label: string) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

export const createDeveloper = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    apiKeyHash: v.string(),
    now: v.number(),
  },
  returns: v.object({ developerId: v.string() }),
  handler: async (ctx, args) => {
    const developerId = await ctx.db.insert("developers", {
      name: args.name,
      email: args.email,
      apiKeyHash: args.apiKeyHash,
      createdAt: args.now,
      status: "active",
    });

    return { developerId };
  },
});

export const getDeveloperByApiKeyHash = query({
  args: { apiKeyHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const developer = await ctx.db
      .query("developers")
      .withIndex("by_api_key_hash", (q) => q.eq("apiKeyHash", args.apiKeyHash))
      .first();

    if (!developer) {
      return null;
    }

    return {
      id: developer._id,
      name: developer.name,
      email: developer.email,
      status: developer.status,
    };
  },
});

export const createStore = mutation({
  args: {
    developerId: v.string(),
    name: v.string(),
    withdrawAddress: v.string(),
    webhookUrl: v.optional(v.string()),
    webhookSecret: v.string(),
    now: v.number(),
  },
  returns: v.object({ storeId: v.string() }),
  handler: async (ctx, args) => {
    const storeId = await ctx.db.insert("stores", {
      developerId: args.developerId,
      name: args.name,
      withdrawAddress: args.withdrawAddress,
      webhookUrl: args.webhookUrl,
      webhookSecret: args.webhookSecret,
      createdAt: args.now,
      status: "active",
    });

    return { storeId };
  },
});

export const getStoreForDeveloper = query({
  args: { storeId: v.string(), developerId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.string(),
      developerId: v.string(),
      name: v.string(),
      withdrawAddress: v.string(),
      webhookUrl: v.optional(v.string()),
      webhookSecret: v.string(),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const store = await ctx.db.get(args.storeId as never);
    if (!store || store.developerId !== args.developerId) {
      return null;
    }

    return {
      id: store._id,
      developerId: store.developerId,
      name: store.name,
      withdrawAddress: store.withdrawAddress,
      webhookUrl: store.webhookUrl,
      webhookSecret: store.webhookSecret,
      status: store.status,
    };
  },
});

export const createCheckout = mutation({
  args: {
    storeId: v.string(),
    developerId: v.string(),
    amountAtomic: v.string(),
    metadata: v.optional(v.any()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    subaddress: v.string(),
    subaddressIndexMajor: v.number(),
    subaddressIndexMinor: v.number(),
    expiresAt: v.number(),
    now: v.number(),
  },
  returns: v.object({ checkoutId: v.string() }),
  handler: async (ctx, args) => {
    const checkoutId = await ctx.db.insert("checkouts", {
      storeId: args.storeId,
      developerId: args.developerId,
      amountAtomic: args.amountAtomic,
      receivedAtomic: "0",
      currency: "XMR",
      metadata: args.metadata,
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
      subaddress: args.subaddress,
      subaddressIndexMajor: args.subaddressIndexMajor,
      subaddressIndexMinor: args.subaddressIndexMinor,
      status: "waiting_for_payment",
      confirmations: 0,
      expiresAt: args.expiresAt,
      createdAt: args.now,
      updatedAt: args.now,
    });

    return { checkoutId };
  },
});

export const getCheckoutForDeveloper = query({
  args: { checkoutId: v.string(), developerId: v.string() },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const checkout = await ctx.db.get(args.checkoutId as never);
    if (!checkout || checkout.developerId !== args.developerId) {
      return null;
    }
    return { id: checkout._id, ...checkout };
  },
});

export const listOpenCheckouts = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const rows = await ctx.db.query("checkouts").collect();
    return rows
      .filter((checkout) =>
        [
          "waiting_for_payment",
          "seen",
          "confirming",
          "confirmed",
          "payout_pending",
        ].includes(checkout.status),
      )
      .map((checkout) => ({ id: checkout._id, ...checkout }));
  },
});

export const recordPaymentObservation = mutation({
  args: {
    checkoutId: v.string(),
    txHash: v.string(),
    amountAtomic: v.string(),
    confirmations: v.number(),
    height: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = (
      await ctx.db
        .query("paymentEvents")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", args.checkoutId))
        .collect()
    ).find((event) => event.txHash === args.txHash);

    if (existing) {
      await ctx.db.patch(existing._id, {
        amountAtomic: args.amountAtomic,
        confirmations: args.confirmations,
        height: args.height,
        confirmedAt:
          args.confirmations >= 10
            ? (existing.confirmedAt ?? args.now)
            : undefined,
      });
      return { created: false };
    }

    await ctx.db.insert("paymentEvents", {
      checkoutId: args.checkoutId,
      txHash: args.txHash,
      amountAtomic: args.amountAtomic,
      confirmations: args.confirmations,
      height: args.height,
      seenAt: args.now,
      confirmedAt: args.confirmations >= 10 ? args.now : undefined,
    });

    return { created: true };
  },
});

export const updateCheckoutPaymentState = mutation({
  args: {
    checkoutId: v.string(),
    status: v.string(),
    receivedAtomic: v.string(),
    confirmations: v.number(),
    txHash: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAllowed(args.status, checkoutStatuses, "checkout status");
    await ctx.db.patch(args.checkoutId as never, {
      status: args.status,
      receivedAtomic: args.receivedAtomic,
      confirmations: args.confirmations,
      txHash: args.txHash,
      updatedAt: args.now,
    });
    return null;
  },
});

export const createPayoutIfMissing = mutation({
  args: {
    checkoutId: v.string(),
    developerId: v.string(),
    storeId: v.string(),
    amountAtomic: v.string(),
    withdrawAddress: v.string(),
    now: v.number(),
  },
  returns: v.object({ payoutId: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payouts")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", args.checkoutId))
      .first();

    if (existing) {
      return { payoutId: existing._id, created: false };
    }

    const payoutId = await ctx.db.insert("payouts", {
      checkoutId: args.checkoutId,
      developerId: args.developerId,
      storeId: args.storeId,
      amountAtomic: args.amountAtomic,
      withdrawAddress: args.withdrawAddress,
      status: "pending",
      createdAt: args.now,
    });

    await ctx.db.patch(args.checkoutId as never, {
      status: "payout_pending",
      updatedAt: args.now,
    });

    return { payoutId, created: true };
  },
});

export const recalculatePayoutAmount = mutation({
  args: {
    amountAtomic: v.string(),
    now: v.number(),
    payoutId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId as never);
    if (!payout || payout.txHash) {
      return null;
    }

    await ctx.db.patch(args.payoutId as never, {
      amountAtomic: args.amountAtomic,
      failedReason: undefined,
      nextRetryAt: undefined,
      status: "pending",
    });

    return null;
  },
});

export const listPendingPayouts = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("payouts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const retryableFailed = (
      await ctx.db
        .query("payouts")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .collect()
    ).filter(
      (payout) =>
        (!payout.nextRetryAt || payout.nextRetryAt <= Date.now()) &&
        /not enough|not enough money|not enough unlocked/i.test(
          payout.failedReason ?? "",
        ),
    );

    return [...pending, ...retryableFailed].map((payout) => ({
      id: payout._id,
      ...payout,
    }));
  },
});

export const updatePayoutStatus = mutation({
  args: {
    payoutId: v.string(),
    status: v.string(),
    txHash: v.optional(v.string()),
    failedReason: v.optional(v.string()),
    nextRetryAt: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAllowed(args.status, payoutStatuses, "payout status");

    await ctx.db.patch(args.payoutId as never, {
      status: args.status,
      txHash: args.txHash,
      failedReason: args.failedReason,
      nextRetryAt: args.nextRetryAt,
      sentAt: args.status === "sent" ? args.now : undefined,
    });

    if (args.status === "sent") {
      const payout = await ctx.db.get(args.payoutId as never);
      if (payout) {
        await ctx.db.patch(payout.checkoutId as never, {
          status: "paid_out",
          updatedAt: args.now,
        });
      }
    }

    return null;
  },
});

export const getCheckoutWithStore = query({
  args: { checkoutId: v.string() },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const checkout = await ctx.db.get(args.checkoutId as never);
    if (!checkout) {
      return null;
    }

    const store = await ctx.db.get(checkout.storeId as never);
    if (!store) {
      return null;
    }

    return {
      checkout: { id: checkout._id, ...checkout },
      store: { id: store._id, ...store },
    };
  },
});

export const recordWebhookAttempt = mutation({
  args: {
    storeId: v.string(),
    checkoutId: v.optional(v.string()),
    event: v.string(),
    url: v.string(),
    status: v.string(),
    statusCode: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    error: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookAttempts", {
      storeId: args.storeId,
      checkoutId: args.checkoutId,
      event: args.event,
      url: args.url,
      status: args.status,
      statusCode: args.statusCode,
      responseBody: args.responseBody,
      error: args.error,
      createdAt: args.now,
    });

    return null;
  },
});
