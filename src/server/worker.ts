import { getConfig } from "./config";
import { convex } from "./convex-client";
import {
  addAtomicAmounts,
  calculatePayoutAmount,
  isAtLeastAtomic,
} from "./money";
import { createWalletClient } from "./wallet-rpc";
import { deliverWebhook } from "./webhooks";

type Checkout = {
  id: string;
  storeId: string;
  developerId: string;
  amountAtomic: string;
  metadata?: Record<string, unknown>;
  subaddressIndexMajor: number;
  subaddressIndexMinor: number;
  expiresAt: number;
  requiredConfirmations?: number;
  status: string;
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
  withdrawAddress: string;
  txHash?: string;
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
function transferKey(transfer: {
  subaddressIndexMajor: number;
  subaddressIndexMinor: number;
}) {
  return `${transfer.subaddressIndexMajor}:${transfer.subaddressIndexMinor}`;
}

async function scanPayments() {
  const config = getConfig();
  const now = Date.now();
  const [checkouts, transfers] = await Promise.all([
    convex.query<Checkout[]>(convex.refs.listOpenCheckouts, {}),
    wallet.getTransfers(),
  ]);

  const checkoutsByIndex = new Map(
    checkouts.map((checkout) => [
      `${checkout.subaddressIndexMajor}:${checkout.subaddressIndexMinor}`,
      checkout,
    ]),
  );
  const transfersByCheckout = new Map<string, typeof transfers>();

  for (const transfer of transfers) {
    const checkout = checkoutsByIndex.get(transferKey(transfer));
    if (!checkout) {
      continue;
    }

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
    const hasEnoughMoney = isAtLeastAtomic(
      receivedAtomic,
      checkout.amountAtomic,
    );
    const requiredConfirmations =
      checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS;
    const status = !hasEnoughMoney
      ? "seen"
      : confirmations >= requiredConfirmations
        ? "confirmed"
        : confirmations > 0
          ? "confirming"
          : "seen";

    await convex.mutation(convex.refs.updateCheckoutPaymentState, {
      checkoutId: checkout.id,
      confirmations,
      now,
      receivedAtomic,
      status,
      txHash,
    });

    if (status === "confirmed") {
      const store = await convex.query<Store | null>(
        convex.refs.getStoreForDeveloper,
        {
          developerId: checkout.developerId,
          storeId: checkout.storeId,
        },
      );
      if (!store) {
        continue;
      }

      const payoutBreakdown = calculatePayoutAmount({
        amountAtomic: checkout.amountAtomic,
        maxTotalFeeBps: config.MAX_TOTAL_FEE_BPS,
        networkFeeReserveAtomic: config.PAYOUT_NETWORK_FEE_RESERVE_ATOMIC,
        platformFeeBps: config.PLATFORM_FEE_BPS,
      });

      await convex.mutation(convex.refs.createPayoutIfMissing, {
        ...payoutBreakdown,
        amountAtomic: payoutBreakdown.netPayoutAtomic,
        checkoutId: checkout.id,
        developerId: checkout.developerId,
        now,
        storeId: checkout.storeId,
        withdrawAddress: store.withdrawAddress,
      });
    }
  }
}

async function processPayouts() {
  const config = getConfig();
  const now = Date.now();
  const payouts = await convex.query<Payout[]>(
    convex.refs.listPendingPayouts,
    {},
  );

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
        await convex.mutation(convex.refs.updatePayoutStatus, {
          failedReason: "Payout exceeds MAX_PAYOUT_ATOMIC",
          now,
          payoutId: payout.id,
          status: "manual_review",
        });
        continue;
      }

      if ((payout.failureCount ?? 0) >= config.PAYOUT_MAX_FAILURES) {
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
          storeId: payout.storeId,
          txHash: checkoutWithStore.checkout.txHash,
        },
        secret: checkoutWithStore.store.webhookSecret,
        storeId: payout.storeId,
        url: checkoutWithStore.store.webhookUrl,
      });
    } catch (error) {
      const failureCount = (payout.failureCount ?? 0) + 1;
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

  for (const attempt of attempts) {
    const attemptNumber = (attempt.attemptNumber ?? 0) + 1;
    if (attemptNumber > config.WEBHOOK_MAX_FAILURES) {
      await convex.mutation(convex.refs.updateWebhookAttempt, {
        attemptId: attempt.id,
        attemptNumber,
        error: "Webhook exceeded max failure count",
        lastError: "Webhook exceeded max failure count",
        status: "failed",
      });
      continue;
    }

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
  await scanPayments();
  await processPayouts();
  await processWebhookRetries();
}

async function main() {
  const config = getConfig();
  console.log(
    `Worker started with ${config.WORKER_POLL_INTERVAL_MS}ms interval`,
  );

  for (;;) {
    try {
      await runWorkerOnce();
    } catch (error) {
      console.error("Worker loop failed", error);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, config.WORKER_POLL_INTERVAL_MS),
    );
  }
}

if (process.argv[1]?.endsWith("worker.ts")) {
  void main();
}
