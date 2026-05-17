import {
  type GenericMutationCtx,
  type GenericQueryCtx,
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { authComponent } from "./betterAuth/auth";

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

const payoutStatuses = [
  "pending",
  "processing",
  "sent",
  "failed",
  "manual_review",
];

function assertAllowed(value: string, allowed: string[], label: string) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

async function getCurrentDeveloper(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new Error("Unauthorized");
  }

  const developer = await ctx.db
    .query("developers")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", user._id))
    .first();

  if (!developer) {
    throw new Error("Developer not claimed");
  }

  return developer;
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

export const getOrClaimDeveloperForCurrentUser = mutation({
  args: {},
  returns: v.object({
    id: v.string(),
    name: v.string(),
    email: v.string(),
    status: v.string(),
    authUserId: v.string(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
  }),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const email = user.email?.trim().toLowerCase();
    if (!email) {
      throw new Error("Authenticated user has no email");
    }

    const now = Date.now();
    const existingByAuthUser = await ctx.db
      .query("developers")
      .withIndex("by_auth_user", (q) => q.eq("authUserId", user._id))
      .first();

    if (existingByAuthUser) {
      return {
        id: existingByAuthUser._id,
        name: existingByAuthUser.name,
        email: existingByAuthUser.email,
        status: existingByAuthUser.status,
        authUserId: user._id,
        claimedAt: existingByAuthUser.claimedAt,
        createdAt: existingByAuthUser.createdAt,
      };
    }

    const matchingDeveloper = (await ctx.db.query("developers").collect()).find(
      (developer) => developer.email.trim().toLowerCase() === email,
    );

    if (matchingDeveloper) {
      if (
        matchingDeveloper.authUserId &&
        matchingDeveloper.authUserId !== user._id
      ) {
        throw new Error("Developer email is already claimed");
      }

      await ctx.db.patch(matchingDeveloper._id, {
        authUserId: user._id,
        claimedAt: matchingDeveloper.claimedAt ?? now,
      });

      return {
        id: matchingDeveloper._id,
        name: matchingDeveloper.name,
        email: matchingDeveloper.email,
        status: matchingDeveloper.status,
        authUserId: user._id,
        claimedAt: matchingDeveloper.claimedAt ?? now,
        createdAt: matchingDeveloper.createdAt,
      };
    }

    const developerId = await ctx.db.insert("developers", {
      name: user.name || email,
      email,
      apiKeyHash: "",
      authUserId: user._id,
      claimedAt: now,
      createdAt: now,
      status: "active",
    });

    return {
      id: developerId,
      name: user.name || email,
      email,
      status: "active",
      authUserId: user._id,
      claimedAt: now,
      createdAt: now,
    };
  },
});

export const getDashboardForCurrentUser = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const developer = await getCurrentDeveloper(ctx);
    const stores = await ctx.db
      .query("stores")
      .withIndex("by_developer", (q) => q.eq("developerId", developer._id))
      .collect();
    const checkouts = await ctx.db
      .query("checkouts")
      .withIndex("by_developer", (q) => q.eq("developerId", developer._id))
      .collect();
    const payouts = (await ctx.db.query("payouts").collect()).filter(
      (payout) => payout.developerId === developer._id,
    );
    const storeIds = new Set(stores.map((store) => store._id));
    const webhookAttempts = (
      await ctx.db.query("webhookAttempts").collect()
    ).filter((attempt) => storeIds.has(attempt.storeId as never));

    const confirmedVolumeAtomic = checkouts
      .filter((checkout) =>
        ["confirmed", "payout_pending", "paid_out"].includes(checkout.status),
      )
      .reduce((sum, checkout) => sum + BigInt(checkout.receivedAtomic), 0n);
    const pendingPayoutAtomic = payouts
      .filter((payout) =>
        ["pending", "processing", "failed", "manual_review"].includes(
          payout.status,
        ),
      )
      .reduce((sum, payout) => sum + BigInt(payout.amountAtomic), 0n);
    const deliveredWebhooks = webhookAttempts.filter(
      (attempt) => attempt.status === "sent",
    ).length;

    return {
      developer: {
        id: developer._id,
        claimedAt: developer.claimedAt,
        createdAt: developer.createdAt,
        email: developer.email,
        name: developer.name,
        status: developer.status,
      },
      checkouts: checkouts
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 25)
        .map((checkout) => ({ id: checkout._id, ...checkout })),
      payouts: payouts
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 25)
        .map((payout) => ({ id: payout._id, ...payout })),
      stats: {
        checkoutCount: checkouts.length,
        confirmedVolumeAtomic: confirmedVolumeAtomic.toString(),
        confirmingCount: checkouts.filter((checkout) =>
          ["seen", "confirming"].includes(checkout.status),
        ).length,
        pendingPayoutAtomic: pendingPayoutAtomic.toString(),
        pendingPayoutCount: payouts.filter((payout) =>
          ["pending", "processing", "failed", "manual_review"].includes(
            payout.status,
          ),
        ).length,
        webhookSuccessRate:
          webhookAttempts.length === 0
            ? null
            : Math.round((deliveredWebhooks / webhookAttempts.length) * 1000) /
              10,
      },
      stores: stores.map((store) => ({
        id: store._id,
        createdAt: store.createdAt,
        name: store.name,
        status: store.status,
        webhookUrl: store.webhookUrl,
        withdrawAddress: store.withdrawAddress,
      })),
      webhookAttempts: webhookAttempts
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 25)
        .map((attempt) => ({
          id: attempt._id,
          attemptNumber: attempt.attemptNumber,
          checkoutId: attempt.checkoutId,
          createdAt: attempt.createdAt,
          deliveredAt: attempt.deliveredAt,
          event: attempt.event,
          lastError: attempt.lastError,
          nextRetryAt: attempt.nextRetryAt,
          status: attempt.status,
          statusCode: attempt.statusCode,
          storeId: attempt.storeId,
          url: attempt.url,
        })),
    };
  },
});

export const rotateDeveloperApiKey = mutation({
  args: {
    apiKeyHash: v.string(),
    developerId: v.string(),
  },
  returns: v.object({ developerId: v.string() }),
  handler: async (ctx, args) => {
    const developer = await ctx.db.get(args.developerId as never);
    if (!developer) {
      throw new Error("Developer not found");
    }

    await ctx.db.patch(args.developerId as never, {
      apiKeyHash: args.apiKeyHash,
    });

    return { developerId: args.developerId };
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

export const createStoreForCurrentUser = mutation({
  args: {
    name: v.string(),
    withdrawAddress: v.string(),
    webhookUrl: v.optional(v.string()),
    webhookSecret: v.string(),
    now: v.number(),
  },
  returns: v.object({ storeId: v.string() }),
  handler: async (ctx, args) => {
    const developer = await getCurrentDeveloper(ctx);
    const storeId = await ctx.db.insert("stores", {
      developerId: developer._id,
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
    amountUsdCents: v.optional(v.string()),
    metadata: v.optional(v.any()),
    pricingCurrency: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    subaddress: v.string(),
    subaddressIndexMajor: v.number(),
    subaddressIndexMinor: v.number(),
    requiredConfirmations: v.number(),
    xmrUsdPriceFetchedAt: v.optional(v.number()),
    xmrUsdPriceMicro: v.optional(v.string()),
    xmrUsdPriceSource: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    requestFingerprint: v.optional(v.string()),
    expiresAt: v.number(),
    now: v.number(),
  },
  returns: v.object({
    checkoutId: v.string(),
    created: v.boolean(),
    existing: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = (
        await ctx.db
          .query("checkouts")
          .withIndex("by_developer", (q) =>
            q.eq("developerId", args.developerId),
          )
          .collect()
      ).find((checkout) => checkout.idempotencyKey === args.idempotencyKey);

      if (existing) {
        if (existing.requestFingerprint !== args.requestFingerprint) {
          throw new Error(
            "Idempotency key was already used with different checkout parameters",
          );
        }
        return {
          checkoutId: existing._id,
          created: false,
          existing: { id: existing._id, ...existing },
        };
      }
    }

    const checkoutId = await ctx.db.insert("checkouts", {
      storeId: args.storeId,
      developerId: args.developerId,
      amountAtomic: args.amountAtomic,
      amountUsdCents: args.amountUsdCents,
      pricingCurrency: args.pricingCurrency,
      xmrUsdPriceFetchedAt: args.xmrUsdPriceFetchedAt,
      xmrUsdPriceMicro: args.xmrUsdPriceMicro,
      xmrUsdPriceSource: args.xmrUsdPriceSource,
      receivedAtomic: "0",
      currency: "XMR",
      metadata: args.metadata,
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
      subaddress: args.subaddress,
      subaddressIndexMajor: args.subaddressIndexMajor,
      subaddressIndexMinor: args.subaddressIndexMinor,
      idempotencyKey: args.idempotencyKey,
      requestFingerprint: args.requestFingerprint,
      status: "waiting_for_payment",
      confirmations: 0,
      requiredConfirmations: args.requiredConfirmations,
      expiresAt: args.expiresAt,
      createdAt: args.now,
      updatedAt: args.now,
    });

    return { checkoutId, created: true };
  },
});

export const getLatestPriceQuote = query({
  args: {
    quoteCurrency: v.string(),
    symbol: v.string(),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const quote = await ctx.db
      .query("priceQuotes")
      .withIndex("by_symbol_quote", (q) => q.eq("symbol", args.symbol))
      .first();

    return quote && quote.quoteCurrency === args.quoteCurrency
      ? { id: quote._id, ...quote }
      : null;
  },
});

export const upsertPriceQuote = mutation({
  args: {
    fetchedAt: v.number(),
    lastUpdatedAt: v.optional(v.number()),
    priceUsdMicro: v.string(),
    source: v.string(),
    symbol: v.string(),
  },
  returns: v.object({ quoteId: v.string() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("priceQuotes")
      .withIndex("by_symbol_quote", (q) => q.eq("symbol", args.symbol))
      .first();

    if (existing && existing.quoteCurrency === "USD") {
      await ctx.db.patch(existing._id, {
        fetchedAt: args.fetchedAt,
        lastUpdatedAt: args.lastUpdatedAt,
        priceUsdMicro: args.priceUsdMicro,
        source: args.source,
      });
      return { quoteId: existing._id };
    }

    const quoteId = await ctx.db.insert("priceQuotes", {
      fetchedAt: args.fetchedAt,
      lastUpdatedAt: args.lastUpdatedAt,
      priceUsdMicro: args.priceUsdMicro,
      quoteCurrency: "USD",
      source: args.source,
      symbol: args.symbol,
    });
    return { quoteId };
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

export const getCheckoutByIdempotency = query({
  args: {
    developerId: v.string(),
    idempotencyKey: v.string(),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const checkout = (
      await ctx.db
        .query("checkouts")
        .withIndex("by_developer", (q) => q.eq("developerId", args.developerId))
        .collect()
    ).find((row) => row.idempotencyKey === args.idempotencyKey);
    return checkout ? { id: checkout._id, ...checkout } : null;
  },
});

export const getWebhookAttemptForCheckoutEvent = query({
  args: {
    checkoutId: v.string(),
    event: v.string(),
  },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const attempt = (
      await ctx.db
        .query("webhookAttempts")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", args.checkoutId))
        .collect()
    ).find((row) => row.event === args.event);

    return attempt ? { id: attempt._id, ...attempt } : null;
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
    requiredConfirmations: v.number(),
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
          args.confirmations >= args.requiredConfirmations
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
      confirmedAt:
        args.confirmations >= args.requiredConfirmations ? args.now : undefined,
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
    grossAmountAtomic: v.string(),
    platformFeeAtomic: v.string(),
    networkReserveAtomic: v.string(),
    netPayoutAtomic: v.string(),
    platformFeeBps: v.number(),
    maxTotalFeeBps: v.number(),
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
      grossAmountAtomic: args.grossAmountAtomic,
      platformFeeAtomic: args.platformFeeAtomic,
      networkReserveAtomic: args.networkReserveAtomic,
      netPayoutAtomic: args.netPayoutAtomic,
      platformFeeBps: args.platformFeeBps,
      maxTotalFeeBps: args.maxTotalFeeBps,
      withdrawAddress: args.withdrawAddress,
      status: "pending",
      failureCount: 0,
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
    grossAmountAtomic: v.string(),
    platformFeeAtomic: v.string(),
    networkReserveAtomic: v.string(),
    netPayoutAtomic: v.string(),
    platformFeeBps: v.number(),
    maxTotalFeeBps: v.number(),
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
      grossAmountAtomic: args.grossAmountAtomic,
      platformFeeAtomic: args.platformFeeAtomic,
      networkReserveAtomic: args.networkReserveAtomic,
      netPayoutAtomic: args.netPayoutAtomic,
      platformFeeBps: args.platformFeeBps,
      maxTotalFeeBps: args.maxTotalFeeBps,
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

export const listPayoutCollectionCandidatesForDeveloper = query({
  args: { developerId: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const checkouts = await ctx.db
      .query("checkouts")
      .withIndex("by_developer", (q) => q.eq("developerId", args.developerId))
      .collect();
    const candidates = [];

    for (const checkout of checkouts) {
      if (
        !["waiting_for_payment", "seen", "confirming", "confirmed"].includes(
          checkout.status,
        )
      ) {
        continue;
      }

      const existingPayout = await ctx.db
        .query("payouts")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", checkout._id))
        .first();
      if (existingPayout) {
        continue;
      }

      const store = await ctx.db.get(checkout.storeId as never);
      if (!store || store.developerId !== args.developerId) {
        continue;
      }

      candidates.push({
        checkout: { id: checkout._id, ...checkout },
        store: { id: store._id, ...store },
      });
    }

    return candidates;
  },
});

export const listPayoutCollectionCandidates = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const checkouts = await ctx.db.query("checkouts").collect();
    const candidates = [];

    for (const checkout of checkouts) {
      if (checkout.status === "paid_out") {
        continue;
      }

      const store = await ctx.db.get(checkout.storeId as never);
      if (!store) {
        continue;
      }

      const existingPayout = await ctx.db
        .query("payouts")
        .withIndex("by_checkout", (q) => q.eq("checkoutId", checkout._id))
        .first();

      candidates.push({
        checkout: { id: checkout._id, ...checkout },
        existingPayout: existingPayout
          ? { id: existingPayout._id, ...existingPayout }
          : null,
        store: { id: store._id, ...store },
      });
    }

    return candidates;
  },
});

export const getPayoutWithCheckout = query({
  args: { payoutId: v.string() },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId as never);
    if (!payout) {
      return null;
    }
    const checkout = await ctx.db.get(payout.checkoutId as never);
    const store = checkout ? await ctx.db.get(checkout.storeId as never) : null;
    return {
      checkout: checkout ? { id: checkout._id, ...checkout } : null,
      payout: { id: payout._id, ...payout },
      store: store ? { id: store._id, ...store } : null,
    };
  },
});

export const updatePayoutStatus = mutation({
  args: {
    payoutId: v.string(),
    status: v.string(),
    txHash: v.optional(v.string()),
    failedReason: v.optional(v.string()),
    nextRetryAt: v.optional(v.number()),
    failureCount: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAllowed(args.status, payoutStatuses, "payout status");

    await ctx.db.patch(args.payoutId as never, {
      status: args.status,
      txHash: args.txHash,
      failedReason: args.failedReason,
      failureCount: args.failureCount,
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

export const markPayoutManualReview = mutation({
  args: {
    failedReason: v.optional(v.string()),
    payoutId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.payoutId as never, {
      failedReason: args.failedReason ?? "Manual review requested",
      status: "manual_review",
    });
    return null;
  },
});

export const retryPayout = mutation({
  args: { payoutId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payout = await ctx.db.get(args.payoutId as never);
    if (!payout || payout.txHash) {
      return null;
    }
    await ctx.db.patch(args.payoutId as never, {
      failedReason: undefined,
      nextRetryAt: undefined,
      status: "pending",
    });
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

export const getCheckoutAdmin = query({
  args: { checkoutId: v.string() },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, args) => {
    const checkout = await ctx.db.get(args.checkoutId as never);
    if (!checkout) {
      return null;
    }
    const store = await ctx.db.get(checkout.storeId as never);
    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", args.checkoutId))
      .collect();
    const paymentEvents = await ctx.db
      .query("paymentEvents")
      .withIndex("by_checkout", (q) => q.eq("checkoutId", args.checkoutId))
      .collect();
    return {
      checkout: { id: checkout._id, ...checkout },
      paymentEvents: paymentEvents.map((event) => ({
        id: event._id,
        ...event,
      })),
      payouts: payouts.map((payout) => ({ id: payout._id, ...payout })),
      store: store ? { id: store._id, ...store } : null,
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
    payload: v.optional(v.any()),
    secret: v.optional(v.string()),
    attemptNumber: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.object({ attemptId: v.string() }),
  handler: async (ctx, args) => {
    const attemptId = await ctx.db.insert("webhookAttempts", {
      storeId: args.storeId,
      checkoutId: args.checkoutId,
      event: args.event,
      url: args.url,
      status: args.status,
      statusCode: args.statusCode,
      responseBody: args.responseBody,
      error: args.error,
      payload: args.payload,
      secret: args.secret,
      attemptNumber: args.attemptNumber,
      nextRetryAt: args.nextRetryAt,
      lastError: args.lastError,
      deliveredAt: args.deliveredAt,
      createdAt: args.now,
    });

    return { attemptId };
  },
});

export const listDueWebhookAttempts = query({
  args: { now: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("webhookAttempts").collect();
    return rows
      .filter(
        (attempt) =>
          attempt.status === "failed" &&
          (!attempt.nextRetryAt || attempt.nextRetryAt <= args.now) &&
          attempt.url &&
          attempt.payload &&
          attempt.secret,
      )
      .map((attempt) => ({ id: attempt._id, ...attempt }));
  },
});

export const updateWebhookAttempt = mutation({
  args: {
    attemptId: v.string(),
    status: v.string(),
    statusCode: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    error: v.optional(v.string()),
    lastError: v.optional(v.string()),
    attemptNumber: v.number(),
    nextRetryAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.attemptId as never, {
      attemptNumber: args.attemptNumber,
      deliveredAt: args.deliveredAt,
      error: args.error,
      lastError: args.lastError,
      nextRetryAt: args.nextRetryAt,
      responseBody: args.responseBody,
      status: args.status,
      statusCode: args.statusCode,
    });
    return null;
  },
});

export const retryWebhookAttempt = mutation({
  args: { attemptId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.attemptId as never, {
      nextRetryAt: undefined,
      status: "failed",
    });
    return null;
  },
});
