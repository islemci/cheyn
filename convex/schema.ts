import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  developers: defineTable({
    name: v.string(),
    email: v.string(),
    apiKeyHash: v.string(),
    authUserId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
    status: v.string(),
  })
    .index("by_api_key_hash", ["apiKeyHash"])
    .index("by_auth_user", ["authUserId"])
    .index("by_email", ["email"]),

  stores: defineTable({
    developerId: v.string(),
    name: v.string(),
    paymentMode: v.optional(v.string()),
    withdrawAddress: v.optional(v.string()),
    merchantPrimaryAddress: v.optional(v.string()),
    encryptedPrivateViewKey: v.optional(v.string()),
    encryptionKeyVersion: v.optional(v.string()),
    restoreHeight: v.optional(v.number()),
    viewOnlyWalletReference: v.optional(v.string()),
    provisioningProgress: v.optional(v.number()),
    provisioningStep: v.optional(v.string()),
    provisioningError: v.optional(v.string()),
    provisioningUpdatedAt: v.optional(v.number()),
    provisioningAttempts: v.optional(v.number()),
    nextProvisioningRetryAt: v.optional(v.number()),
    webhookUrl: v.optional(v.string()),
    successCallbackUrl: v.optional(v.string()),
    cancelCallbackUrl: v.optional(v.string()),
    webhookSecret: v.string(),
    createdAt: v.number(),
    status: v.string(),
  })
    .index("by_developer", ["developerId"])
    .index("by_developer_status", ["developerId", "status"]),

  checkouts: defineTable({
    storeId: v.string(),
    developerId: v.string(),
    mode: v.optional(v.string()),
    settlementType: v.optional(v.string()),
    walletContextId: v.optional(v.string()),
    amountAtomic: v.string(),
    amountUsdCents: v.optional(v.string()),
    pricingCurrency: v.optional(v.string()),
    xmrUsdPriceDecimal: v.optional(v.string()),
    xmrUsdPriceMicro: v.optional(v.string()),
    xmrUsdPriceFetchedAt: v.optional(v.number()),
    xmrUsdPriceSource: v.optional(v.string()),
    receivedAtomic: v.string(),
    currency: v.string(),
    metadata: v.optional(v.any()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
    subaddress: v.string(),
    subaddressIndexMajor: v.number(),
    subaddressIndexMinor: v.number(),
    status: v.string(),
    confirmations: v.number(),
    requiredConfirmations: v.optional(v.number()),
    txHash: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    requestFingerprint: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_developer", ["developerId"])
    .index("by_developer_idempotency", ["developerId", "idempotencyKey"])
    .index("by_store", ["storeId"])
    .index("by_status", ["status"])
    .index("by_subaddress_index", [
      "subaddressIndexMajor",
      "subaddressIndexMinor",
    ]),

  paymentEvents: defineTable({
    checkoutId: v.string(),
    txHash: v.string(),
    subaddressIndexMajor: v.optional(v.number()),
    subaddressIndexMinor: v.optional(v.number()),
    amountAtomic: v.string(),
    confirmations: v.number(),
    height: v.optional(v.number()),
    seenAt: v.number(),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_checkout", ["checkoutId"])
    .index("by_checkout_tx", ["checkoutId", "txHash"]),

  payouts: defineTable({
    checkoutId: v.string(),
    developerId: v.string(),
    storeId: v.string(),
    amountAtomic: v.string(),
    grossAmountAtomic: v.optional(v.string()),
    platformFeeAtomic: v.optional(v.string()),
    networkReserveAtomic: v.optional(v.string()),
    netPayoutAtomic: v.optional(v.string()),
    platformFeeBps: v.optional(v.number()),
    maxTotalFeeBps: v.optional(v.number()),
    withdrawAddress: v.string(),
    status: v.string(),
    txHash: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    failedReason: v.optional(v.string()),
    failureCount: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
  })
    .index("by_checkout", ["checkoutId"])
    .index("by_status", ["status"]),

  webhookAttempts: defineTable({
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
    createdAt: v.number(),
  })
    .index("by_store", ["storeId"])
    .index("by_checkout", ["checkoutId"]),

  priceQuotes: defineTable({
    fetchedAt: v.number(),
    lastUpdatedAt: v.optional(v.number()),
    priceUsdDecimal: v.optional(v.string()),
    priceUsdMicro: v.string(),
    quoteCurrency: v.string(),
    source: v.string(),
    symbol: v.string(),
  }).index("by_symbol_quote", ["symbol", "quoteCurrency"]),
});
