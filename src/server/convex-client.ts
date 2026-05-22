import { ConvexHttpClient } from "convex/browser";
import { getFunctionName, makeFunctionReference } from "convex/server";

import { getConfig, getConvexUrl } from "./config";

const refs = {
  createDeveloper: makeFunctionReference<"mutation">(
    "payments.js:createDeveloper",
  ),
  getDeveloperByApiKeyHash: makeFunctionReference<"query">(
    "payments.js:getDeveloperByApiKeyHash",
  ),
  getOrClaimDeveloperForCurrentUser: makeFunctionReference<"mutation">(
    "payments.js:getOrClaimDeveloperForCurrentUser",
  ),
  getDashboardForCurrentUser: makeFunctionReference<"query">(
    "payments.js:getDashboardForCurrentUser",
  ),
  rotateDeveloperApiKey: makeFunctionReference<"mutation">(
    "payments.js:rotateDeveloperApiKey",
  ),
  createStore: makeFunctionReference<"mutation">("payments.js:createStore"),
  createStoreForCurrentUser: makeFunctionReference<"mutation">(
    "payments.js:createStoreForCurrentUser",
  ),
  updateStore: makeFunctionReference<"mutation">("payments.js:updateStore"),
  updateStoreWalletReference: makeFunctionReference<"mutation">(
    "payments.js:updateStoreWalletReference",
  ),
  updateStoreProvisioningProgress: makeFunctionReference<"mutation">(
    "payments.js:updateStoreProvisioningProgress",
  ),
  updateStoreForCurrentUser: makeFunctionReference<"mutation">(
    "payments.js:updateStoreForCurrentUser",
  ),
  getStoreForDeveloper: makeFunctionReference<"query">(
    "payments.js:getStoreForDeveloper",
  ),
  createCheckout: makeFunctionReference<"mutation">(
    "payments.js:createCheckout",
  ),
  getLatestPriceQuote: makeFunctionReference<"query">(
    "payments.js:getLatestPriceQuote",
  ),
  upsertPriceQuote: makeFunctionReference<"mutation">(
    "payments.js:upsertPriceQuote",
  ),
  getCheckoutForDeveloper: makeFunctionReference<"query">(
    "payments.js:getCheckoutForDeveloper",
  ),
  getHostedCheckout: makeFunctionReference<"query">(
    "payments.js:getHostedCheckout",
  ),
  getCheckoutByIdempotency: makeFunctionReference<"query">(
    "payments.js:getCheckoutByIdempotency",
  ),
  getWebhookAttemptForCheckoutEvent: makeFunctionReference<"query">(
    "payments.js:getWebhookAttemptForCheckoutEvent",
  ),
  listOpenCheckouts: makeFunctionReference<"query">(
    "payments.js:listOpenCheckouts",
  ),
  listScannableWalletContexts: makeFunctionReference<"query">(
    "payments.js:listScannableWalletContexts",
  ),
  listProvisioningViewOnlyStores: makeFunctionReference<"query">(
    "payments.js:listProvisioningViewOnlyStores",
  ),
  recordPaymentObservation: makeFunctionReference<"mutation">(
    "payments.js:recordPaymentObservation",
  ),
  updateCheckoutPaymentState: makeFunctionReference<"mutation">(
    "payments.js:updateCheckoutPaymentState",
  ),
  createPayoutIfMissing: makeFunctionReference<"mutation">(
    "payments.js:createPayoutIfMissing",
  ),
  recalculatePayoutAmount: makeFunctionReference<"mutation">(
    "payments.js:recalculatePayoutAmount",
  ),
  listPendingPayouts: makeFunctionReference<"query">(
    "payments.js:listPendingPayouts",
  ),
  listPayoutCollectionCandidatesForDeveloper: makeFunctionReference<"query">(
    "payments.js:listPayoutCollectionCandidatesForDeveloper",
  ),
  listPayoutCollectionCandidates: makeFunctionReference<"query">(
    "payments.js:listPayoutCollectionCandidates",
  ),
  getPayoutWithCheckout: makeFunctionReference<"query">(
    "payments.js:getPayoutWithCheckout",
  ),
  updatePayoutStatus: makeFunctionReference<"mutation">(
    "payments.js:updatePayoutStatus",
  ),
  markPayoutManualReview: makeFunctionReference<"mutation">(
    "payments.js:markPayoutManualReview",
  ),
  retryPayout: makeFunctionReference<"mutation">("payments.js:retryPayout"),
  getCheckoutWithStore: makeFunctionReference<"query">(
    "payments.js:getCheckoutWithStore",
  ),
  getCheckoutAdmin: makeFunctionReference<"query">(
    "payments.js:getCheckoutAdmin",
  ),
  recordWebhookAttempt: makeFunctionReference<"mutation">(
    "payments.js:recordWebhookAttempt",
  ),
  listDueWebhookAttempts: makeFunctionReference<"query">(
    "payments.js:listDueWebhookAttempts",
  ),
  updateWebhookAttempt: makeFunctionReference<"mutation">(
    "payments.js:updateWebhookAttempt",
  ),
  retryWebhookAttempt: makeFunctionReference<"mutation">(
    "payments.js:retryWebhookAttempt",
  ),
};

let client: ConvexHttpClient | undefined;

export function getConvexClient() {
  if (client) {
    return client;
  }

  const config = getConfig();
  client = new ConvexHttpClient(getConvexUrl());
  if (config.CONVEX_ADMIN_KEY) {
    (
      client as ConvexHttpClient & {
        setAdminAuth: (token: string) => void;
      }
    ).setAdminAuth(config.CONVEX_ADMIN_KEY);
  }
  return client;
}

export const convex = {
  refs,
  async query<T>(
    ref: (typeof refs)[keyof typeof refs],
    args: Record<string, unknown>,
  ) {
    try {
      return (await getConvexClient().query(ref as never, args as never)) as T;
    } catch (error) {
      throw annotateConvexError("query", ref, error);
    }
  },
  async mutation<T>(
    ref: (typeof refs)[keyof typeof refs],
    args: Record<string, unknown>,
  ) {
    try {
      return (await getConvexClient().mutation(
        ref as never,
        args as never,
      )) as T;
    } catch (error) {
      throw annotateConvexError("mutation", ref, error);
    }
  },
};

function annotateConvexError(
  operation: "mutation" | "query",
  ref: (typeof refs)[keyof typeof refs],
  error: unknown,
) {
  const functionName = getFunctionName(ref);
  const message =
    error instanceof Error && error.message
      ? error.message
      : `Convex ${operation} failed`;
  const wrapped = new Error(`${operation} ${functionName}: ${message}`);
  if (error instanceof Error) {
    wrapped.name = error.name;
    wrapped.cause = error;
  }
  console.error("Convex request failed", {
    cause: error,
    functionName,
    operation,
  });
  return wrapped;
}
