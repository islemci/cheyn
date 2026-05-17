import { refreshXmrUsdPrice } from "./coinmarketcap";
import { getConfig } from "./config";
import { convex } from "./convex-client";
import {
  addAtomicAmounts,
  calculatePayoutAmount,
  isAtLeastAtomicWithTolerance,
} from "./money";
import { createWalletClient } from "./wallet-rpc";
import { deliverWebhook } from "./webhooks";

type Checkout = {
  id: string;
  subaddress: string;
  storeId: string;
  developerId: string;
  amountAtomic: string;
  confirmations: number;
  metadata?: Record<string, unknown>;
  receivedAtomic: string;
  subaddressIndexMajor: number;
  subaddressIndexMinor: number;
  expiresAt: number;
  requiredConfirmations?: number;
  status: string;
  txHash?: string;
};

type Store = {
  id: string;
  withdrawAddress: string;
  webhookUrl?: string;
  webhookSecret: string;
};

type Payout = {
  id: string;
  checkoutId: string;
  developerId: string;
  storeId: string;
  amountAtomic: string;
  failedReason?: string;
  failureCount?: number;
  netPayoutAtomic?: string;
  status: string;
  withdrawAddress: string;
  txHash?: string;
};

type PayoutCollectionCandidate = {
  checkout: Checkout;
  existingPayout?: Payout | null;
  store: Store;
};

type WebhookAttempt = {
  id: string;
  attemptNumber?: number;
  checkoutId?: string;
  event: string;
  payload: Record<string, unknown>;
  secret: string;
  storeId: string;
  url: string;
};

const wallet = createWalletClient();
let lastPriceRefreshAttemptAt = 0;

function logWorker(message: string, fields?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  if (fields) {
    console.log(`[worker] ${timestamp} ${message}`, fields);
    return;
  }
  console.log(`[worker] ${timestamp} ${message}`);
}

function warnWorker(message: string, fields?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  if (fields) {
    console.warn(`[worker] ${timestamp} ${message}`, fields);
    return;
  }
  console.warn(`[worker] ${timestamp} ${message}`);
}

function errorWorker(
  message: string,
  error: unknown,
  fields?: Record<string, unknown>,
) {
  const timestamp = new Date().toISOString();
  console.error(`[worker] ${timestamp} ${message}`, {
    ...fields,
    error: error instanceof Error ? error.message : error,
  });
}

function transferKey(transfer: {
  subaddressIndexMajor?: number;
  subaddressIndexMinor?: number;
}) {
  if (
    transfer.subaddressIndexMajor === undefined ||
    transfer.subaddressIndexMinor === undefined
  ) {
    return null;
  }
  return `${transfer.subaddressIndexMajor}:${transfer.subaddressIndexMinor}`;
}

async function refreshPriceIfDue() {
  const config = getConfig();
  if (!config.CMC_API_KEY) {
    return;
  }

  const now = Date.now();
  if (now - lastPriceRefreshAttemptAt < config.CMC_PRICE_REFRESH_INTERVAL_MS) {
    return;
  }

  lastPriceRefreshAttemptAt = now;

  try {
    const quote = await refreshXmrUsdPrice();
    logWorker("refreshed XMR/USD price", {
      fetchedAt: quote.fetchedAt,
      priceUsdMicro: quote.priceUsdMicro,
      source: quote.source,
    });
  } catch (error) {
    errorWorker("price refresh failed", error);
  }
}

async function deliverPaymentVerifiedWebhook(args: {
  checkout: Checkout;
  confirmations: number;
  receivedAtomic: string;
  store: Store;
  txHash?: string;
}) {
  const existingAttempt = await convex.query<{ id: string } | null>(
    convex.refs.getWebhookAttemptForCheckoutEvent,
    {
      checkoutId: args.checkout.id,
      event: "payment.verified",
    },
  );

  if (existingAttempt) {
    return;
  }

  await deliverWebhook({
    checkoutId: args.checkout.id,
    event: "payment.verified",
    payload: {
      amountAtomic: args.checkout.amountAtomic,
      checkoutId: args.checkout.id,
      confirmations: args.confirmations,
      currency: "XMR",
      event: "payment.verified",
      metadata: args.checkout.metadata ?? {},
      receivedAtomic: args.receivedAtomic,
      requiredConfirmations:
        args.checkout.requiredConfirmations ??
        getConfig().REQUIRED_CONFIRMATIONS,
      storeId: args.checkout.storeId,
      txHash: args.txHash,
    },
    secret: args.store.webhookSecret,
    storeId: args.checkout.storeId,
    url: args.store.webhookUrl,
  });
}

async function createPayoutForCheckout(args: {
  checkout: Checkout;
  now: number;
  store: Store;
}) {
  const config = getConfig();
  const payoutBreakdown = calculatePayoutAmount({
    amountAtomic: args.checkout.amountAtomic,
    maxTotalFeeBps: config.MAX_TOTAL_FEE_BPS,
    networkFeeReserveAtomic: config.PAYOUT_NETWORK_FEE_RESERVE_ATOMIC,
    platformFeeBps: config.PLATFORM_FEE_BPS,
  });

  await convex.mutation(convex.refs.createPayoutIfMissing, {
    ...payoutBreakdown,
    amountAtomic: payoutBreakdown.netPayoutAtomic,
    checkoutId: args.checkout.id,
    developerId: args.checkout.developerId,
    now: args.now,
    storeId: args.checkout.storeId,
    withdrawAddress: args.store.withdrawAddress,
  });
}

async function scanPayments() {
  const config = getConfig();
  const now = Date.now();
  const [checkouts, transfers] = await Promise.all([
    convex.query<Checkout[]>(convex.refs.listOpenCheckouts, {}),
    wallet.getTransfers(),
  ]);
  logWorker("scan payments loaded", {
    openCheckouts: checkouts.length,
    walletTransfers: transfers.length,
  });

  const checkoutsByIndex = new Map(
    checkouts.map((checkout) => [
      `${checkout.subaddressIndexMajor}:${checkout.subaddressIndexMinor}`,
      checkout,
    ]),
  );
  const checkoutsByAddress = new Map(
    checkouts.map((checkout) => [checkout.subaddress, checkout]),
  );
  const transfersByCheckout = new Map<string, typeof transfers>();

  for (const transfer of transfers) {
    const key = transferKey(transfer);
    const checkout =
      (key ? checkoutsByIndex.get(key) : undefined) ??
      (transfer.address ? checkoutsByAddress.get(transfer.address) : undefined);
    if (!checkout) {
      warnWorker("wallet transfer did not match an open checkout", {
        address: transfer.address,
        amountAtomic: transfer.amountAtomic,
        confirmations: transfer.confirmations,
        subaddressIndexMajor: transfer.subaddressIndexMajor,
        subaddressIndexMinor: transfer.subaddressIndexMinor,
        txHash: transfer.txHash,
      });
      continue;
    }

    logWorker("wallet transfer matched checkout", {
      amountAtomic: transfer.amountAtomic,
      checkoutId: checkout.id,
      confirmations: transfer.confirmations,
      matchType:
        key && checkoutsByIndex.get(key) ? "subaddress_index" : "address",
      requiredConfirmations:
        checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS,
      txHash: transfer.txHash,
    });

    const list = transfersByCheckout.get(checkout.id) ?? [];
    list.push(transfer);
    transfersByCheckout.set(checkout.id, list);

    await convex.mutation(convex.refs.recordPaymentObservation, {
      amountAtomic: transfer.amountAtomic,
      checkoutId: checkout.id,
      confirmations: transfer.confirmations,
      height: transfer.height,
      now,
      requiredConfirmations:
        checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS,
      txHash: transfer.txHash,
    });
  }

  for (const checkout of checkouts) {
    const checkoutTransfers = transfersByCheckout.get(checkout.id) ?? [];
    if (checkoutTransfers.length === 0) {
      if (
        checkout.expiresAt <= now &&
        checkout.status === "waiting_for_payment"
      ) {
        await convex.mutation(convex.refs.updateCheckoutPaymentState, {
          checkoutId: checkout.id,
          confirmations: 0,
          now,
          receivedAtomic: "0",
          status: "expired",
        });
      }
      continue;
    }

    const receivedAtomic = addAtomicAmounts(
      checkoutTransfers.map((transfer) => transfer.amountAtomic),
    );
    const confirmations = Math.max(
      ...checkoutTransfers.map((transfer) => transfer.confirmations),
    );
    const txHash = checkoutTransfers[0]?.txHash;
    const hasEnoughMoney = isAtLeastAtomicWithTolerance({
      minimum: checkout.amountAtomic,
      toleranceAtomic: config.PAYMENT_UNDERPAY_TOLERANCE_ATOMIC,
      value: receivedAtomic,
    });
    const requiredConfirmations =
      checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS;

    // Determine the status based on payment state
    let status = checkout.status;
    if (!hasEnoughMoney) {
      status = "seen";
    } else if (confirmations >= requiredConfirmations) {
      status = "confirmed";
    } else if (confirmations > 0) {
      status = "confirming";
    } else {
      status = "seen";
    }

    // Only update if status changed
    if (
      status !== checkout.status ||
      confirmations !== checkout.confirmations
    ) {
      logWorker("updating checkout payment state", {
        checkoutId: checkout.id,
        fromStatus: checkout.status,
        toStatus: status,
        confirmations,
        receivedAtomic,
        requiredConfirmations,
      });
      await convex.mutation(convex.refs.updateCheckoutPaymentState, {
        checkoutId: checkout.id,
        confirmations,
        now,
        receivedAtomic,
        status,
        txHash,
      });
    }

    if (status === "confirmed") {
      const store = await convex.query<Store | null>(
        convex.refs.getStoreForDeveloper,
        {
          developerId: checkout.developerId,
          storeId: checkout.storeId,
        },
      );
      if (!store) {
        warnWorker("confirmed checkout has no store", {
          checkoutId: checkout.id,
          storeId: checkout.storeId,
        });
        continue;
      }

      logWorker("checkout passed threshold during scan", {
        checkoutId: checkout.id,
        confirmations,
        receivedAtomic,
        requiredConfirmations,
      });
      await deliverPaymentVerifiedWebhook({
        checkout,
        confirmations,
        receivedAtomic,
        store,
        txHash,
      });

      await createPayoutForCheckout({ checkout, now, store });
    }
  }

  const stuckVerifiedCheckouts = checkouts.filter((checkout) => {
    const requiredConfirmations =
      checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS;
    return (
      ["waiting_for_payment", "seen", "confirming"].includes(checkout.status) &&
      isAtLeastAtomicWithTolerance({
        minimum: checkout.amountAtomic,
        toleranceAtomic: config.PAYMENT_UNDERPAY_TOLERANCE_ATOMIC,
        value: checkout.receivedAtomic,
      }) &&
      checkout.confirmations >= requiredConfirmations
    );
  });

  for (const checkout of stuckVerifiedCheckouts) {
    logWorker("recovering stuck threshold-passed checkout", {
      checkoutId: checkout.id,
      confirmations: checkout.confirmations,
      receivedAtomic: checkout.receivedAtomic,
      requiredConfirmations:
        checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS,
      status: checkout.status,
    });
    const store = await convex.query<Store | null>(
      convex.refs.getStoreForDeveloper,
      {
        developerId: checkout.developerId,
        storeId: checkout.storeId,
      },
    );
    if (!store) {
      warnWorker("stuck verified checkout has no store", {
        checkoutId: checkout.id,
        storeId: checkout.storeId,
      });
      continue;
    }

    await convex.mutation(convex.refs.updateCheckoutPaymentState, {
      checkoutId: checkout.id,
      confirmations: checkout.confirmations,
      now,
      receivedAtomic: checkout.receivedAtomic,
      status: "confirmed",
    });

    await deliverPaymentVerifiedWebhook({
      checkout,
      confirmations: checkout.confirmations,
      receivedAtomic: checkout.receivedAtomic,
      store,
      txHash: checkout.txHash,
    });

    await createPayoutForCheckout({ checkout, now, store });
  }

  // Recovery: create payouts for already-confirmed checkouts that don't have one yet
  // This handles cases where the worker was stopped before payout creation
  const confirmedCheckouts = checkouts.filter((c) => c.status === "confirmed");
  for (const checkout of confirmedCheckouts) {
    logWorker("recovering confirmed checkout payout", {
      checkoutId: checkout.id,
      confirmations: checkout.confirmations,
      receivedAtomic: checkout.receivedAtomic,
    });
    const store = await convex.query<Store | null>(
      convex.refs.getStoreForDeveloper,
      {
        developerId: checkout.developerId,
        storeId: checkout.storeId,
      },
    );
    if (!store) {
      warnWorker("confirmed checkout has no store", {
        checkoutId: checkout.id,
        storeId: checkout.storeId,
      });
      continue;
    }

    await deliverPaymentVerifiedWebhook({
      checkout,
      confirmations: checkout.confirmations,
      receivedAtomic: checkout.amountAtomic,
      store,
      txHash: undefined,
    });

    await createPayoutForCheckout({ checkout, now, store });
  }
}

async function collectEligiblePayouts() {
  const config = getConfig();
  const now = Date.now();
  const candidates = await convex.query<PayoutCollectionCandidate[]>(
    convex.refs.listPayoutCollectionCandidates,
    {},
  );
  logWorker("collect eligible payouts loaded", {
    candidates: candidates.length,
  });

  for (const { checkout, existingPayout, store } of candidates) {
    const requiredConfirmations =
      checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS;
    const isEligible =
      isAtLeastAtomicWithTolerance({
        minimum: checkout.amountAtomic,
        toleranceAtomic: config.PAYMENT_UNDERPAY_TOLERANCE_ATOMIC,
        value: checkout.receivedAtomic,
      }) && checkout.confirmations >= requiredConfirmations;

    if (!isEligible) {
      logWorker("checkout not payout eligible", {
        checkoutId: checkout.id,
        confirmations: checkout.confirmations,
        expectedAtomic: checkout.amountAtomic,
        shortfallAtomic: (
          BigInt(checkout.amountAtomic) - BigInt(checkout.receivedAtomic)
        ).toString(),
        receivedAtomic: checkout.receivedAtomic,
        requiredConfirmations,
        status: checkout.status,
        toleranceAtomic: config.PAYMENT_UNDERPAY_TOLERANCE_ATOMIC,
      });
      continue;
    }

    logWorker("checkout is payout eligible", {
      checkoutId: checkout.id,
      confirmations: checkout.confirmations,
      existingPayoutId: existingPayout?.id,
      receivedAtomic: checkout.receivedAtomic,
      requiredConfirmations,
      status: checkout.status,
    });

    if (existingPayout) {
      if (
        checkout.status !== "payout_pending" &&
        checkout.status !== "paid_out"
      ) {
        await convex.mutation(convex.refs.updateCheckoutPaymentState, {
          checkoutId: checkout.id,
          confirmations: checkout.confirmations,
          now,
          receivedAtomic: checkout.receivedAtomic,
          status:
            existingPayout.status === "sent" ? "paid_out" : "payout_pending",
          txHash: checkout.txHash,
        });
        logWorker("repaired checkout status from existing payout", {
          checkoutId: checkout.id,
          payoutId: existingPayout.id,
          payoutStatus: existingPayout.status,
        });
      }
      continue;
    }

    if (checkout.status !== "confirmed") {
      await convex.mutation(convex.refs.updateCheckoutPaymentState, {
        checkoutId: checkout.id,
        confirmations: checkout.confirmations,
        now,
        receivedAtomic: checkout.receivedAtomic,
        status: "confirmed",
        txHash: checkout.txHash,
      });
    }

    await deliverPaymentVerifiedWebhook({
      checkout,
      confirmations: checkout.confirmations,
      receivedAtomic: checkout.receivedAtomic,
      store,
      txHash: checkout.txHash,
    });

    await createPayoutForCheckout({ checkout, now, store });

    logWorker("queued payout for eligible checkout", {
      checkoutId: checkout.id,
      confirmations: checkout.confirmations,
      requiredConfirmations,
    });
  }
}

async function processPayouts() {
  const config = getConfig();
  const now = Date.now();
  const payouts = await convex.query<Payout[]>(
    convex.refs.listPendingPayouts,
    {},
  );
  logWorker("process payouts loaded", {
    payouts: payouts.length,
  });

  for (const payout of payouts) {
    if (payout.txHash) {
      continue;
    }

    try {
      const checkoutWithStore = await convex.query<{
        checkout: Checkout & {
          amountAtomic: string;
          confirmations: number;
          metadata?: Record<string, unknown>;
          txHash?: string;
        };
        store: Store;
      } | null>(convex.refs.getCheckoutWithStore, {
        checkoutId: payout.checkoutId,
      });

      if (!checkoutWithStore) {
        throw new Error(`Checkout not found for payout ${payout.id}`);
      }

      if (
        checkoutWithStore.checkout.confirmations <
        config.PAYOUT_REQUIRED_CONFIRMATIONS
      ) {
        logWorker("payout waiting for required confirmations", {
          checkoutConfirmations: checkoutWithStore.checkout.confirmations,
          checkoutId: payout.checkoutId,
          payoutId: payout.id,
          requiredConfirmations: config.PAYOUT_REQUIRED_CONFIRMATIONS,
        });
        continue;
      }

      const currentPayoutAmount = calculatePayoutAmount({
        amountAtomic: checkoutWithStore.checkout.amountAtomic,
        maxTotalFeeBps: config.MAX_TOTAL_FEE_BPS,
        networkFeeReserveAtomic: config.PAYOUT_NETWORK_FEE_RESERVE_ATOMIC,
        platformFeeBps: config.PLATFORM_FEE_BPS,
      });
      const netPayoutAtomic = currentPayoutAmount.netPayoutAtomic;

      if (
        payout.netPayoutAtomic !== netPayoutAtomic ||
        payout.amountAtomic !== netPayoutAtomic
      ) {
        await convex.mutation(convex.refs.recalculatePayoutAmount, {
          ...currentPayoutAmount,
          amountAtomic: netPayoutAtomic,
          now,
          payoutId: payout.id,
        });
      }

      if (!config.PAYOUTS_ENABLED) {
        warnWorker("payout moved to manual review because payouts disabled", {
          payoutId: payout.id,
          checkoutId: payout.checkoutId,
        });
        await convex.mutation(convex.refs.updatePayoutStatus, {
          failedReason: "Payouts are disabled",
          now,
          payoutId: payout.id,
          status: "manual_review",
        });
        continue;
      }

      if (
        config.MAX_PAYOUT_ATOMIC &&
        BigInt(netPayoutAtomic) > BigInt(config.MAX_PAYOUT_ATOMIC)
      ) {
        warnWorker("payout moved to manual review because max exceeded", {
          maxPayoutAtomic: config.MAX_PAYOUT_ATOMIC,
          netPayoutAtomic,
          payoutId: payout.id,
        });
        await convex.mutation(convex.refs.updatePayoutStatus, {
          failedReason: "Payout exceeds MAX_PAYOUT_ATOMIC",
          now,
          payoutId: payout.id,
          status: "manual_review",
        });
        continue;
      }

      if ((payout.failureCount ?? 0) >= config.PAYOUT_MAX_FAILURES) {
        warnWorker("payout moved to manual review because failures exceeded", {
          failureCount: payout.failureCount ?? 0,
          payoutId: payout.id,
        });
        await convex.mutation(convex.refs.updatePayoutStatus, {
          failedReason: "Payout exceeded max failure count",
          now,
          payoutId: payout.id,
          status: "manual_review",
        });
        continue;
      }

      await convex.mutation(convex.refs.updatePayoutStatus, {
        now,
        payoutId: payout.id,
        status: "processing",
      });

      logWorker("sending payout transfer", {
        amountAtomic: netPayoutAtomic,
        checkoutId: payout.checkoutId,
        payoutId: payout.id,
        withdrawAddress: payout.withdrawAddress,
      });
      const result = await wallet.transfer({
        address: payout.withdrawAddress,
        amountAtomic: netPayoutAtomic,
      });

      await convex.mutation(convex.refs.updatePayoutStatus, {
        now,
        payoutId: payout.id,
        status: "sent",
        txHash: result.txHash,
      });
      logWorker("payout transfer sent", {
        checkoutId: payout.checkoutId,
        payoutId: payout.id,
        txHash: result.txHash,
      });

      await deliverWebhook({
        checkoutId: payout.checkoutId,
        event: "payment.confirmed",
        payload: {
          amountAtomic: checkoutWithStore.checkout.amountAtomic,
          checkoutId: payout.checkoutId,
          confirmations: checkoutWithStore.checkout.confirmations,
          currency: "XMR",
          event: "payment.confirmed",
          metadata: checkoutWithStore.checkout.metadata ?? {},
          payoutAmountAtomic: netPayoutAtomic,
          payoutId: payout.id,
          payoutStatus: "sent",
          payoutTxHash: result.txHash,
          storeId: payout.storeId,
          txHash: checkoutWithStore.checkout.txHash,
        },
        secret: checkoutWithStore.store.webhookSecret,
        storeId: payout.storeId,
        url: checkoutWithStore.store.webhookUrl,
      });
    } catch (error) {
      const failureCount = (payout.failureCount ?? 0) + 1;
      errorWorker("payout processing failed", error, {
        checkoutId: payout.checkoutId,
        failureCount,
        payoutId: payout.id,
      });
      await convex.mutation(convex.refs.updatePayoutStatus, {
        failedReason:
          error instanceof Error ? error.message : "Unknown payout error",
        failureCount,
        nextRetryAt: now + config.PAYOUT_RETRY_DELAY_MS * failureCount,
        now,
        payoutId: payout.id,
        status:
          failureCount >= config.PAYOUT_MAX_FAILURES
            ? "manual_review"
            : "failed",
      });
    }
  }
}

async function processWebhookRetries() {
  const config = getConfig();
  const now = Date.now();
  const attempts = await convex.query<WebhookAttempt[]>(
    convex.refs.listDueWebhookAttempts,
    { now },
  );
  logWorker("process webhook retries loaded", {
    attempts: attempts.length,
  });

  for (const attempt of attempts) {
    const attemptNumber = (attempt.attemptNumber ?? 0) + 1;
    if (attemptNumber > config.WEBHOOK_MAX_FAILURES) {
      warnWorker("webhook exceeded max failure count", {
        attemptId: attempt.id,
        attemptNumber,
        event: attempt.event,
      });
      await convex.mutation(convex.refs.updateWebhookAttempt, {
        attemptId: attempt.id,
        attemptNumber,
        error: "Webhook exceeded max failure count",
        lastError: "Webhook exceeded max failure count",
        status: "failed",
      });
      continue;
    }

    logWorker("retrying webhook", {
      attemptId: attempt.id,
      attemptNumber,
      event: attempt.event,
      storeId: attempt.storeId,
    });
    await deliverWebhook({
      attemptId: attempt.id,
      attemptNumber,
      checkoutId: attempt.checkoutId,
      event: attempt.event,
      maxFailures: config.WEBHOOK_MAX_FAILURES,
      payload: attempt.payload,
      retryDelayMs: config.WEBHOOK_RETRY_DELAY_MS,
      secret: attempt.secret,
      storeId: attempt.storeId,
      url: attempt.url,
    });
  }
}

export async function runWorkerOnce() {
  logWorker("worker loop started");
  await refreshPriceIfDue();
  await scanPayments();
  await collectEligiblePayouts();
  await processPayouts();
  await processWebhookRetries();
  logWorker("worker loop finished");
}

async function main() {
  const config = getConfig();
  logWorker("worker started", {
    intervalMs: config.WORKER_POLL_INTERVAL_MS,
  });

  for (;;) {
    try {
      await runWorkerOnce();
    } catch (error) {
      errorWorker("worker loop failed", error);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, config.WORKER_POLL_INTERVAL_MS),
    );
  }
}

if (process.argv[1]?.endsWith("worker.ts")) {
  void main();
}
