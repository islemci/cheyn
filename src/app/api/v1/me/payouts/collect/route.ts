import { fetchAuthMutation } from "@/lib/auth-server";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { handleApiError, json } from "@/server/http";
import {
  calculatePayoutAmount,
  isAtLeastAtomicWithTolerance,
} from "@/server/money";
import { deliverWebhook } from "@/server/webhooks";

export const dynamic = "force-dynamic";

type CurrentDeveloper = {
  id: string;
};

type CandidateCheckout = {
  amountAtomic: string;
  confirmations: number;
  developerId: string;
  id: string;
  metadata?: Record<string, unknown>;
  receivedAtomic: string;
  requiredConfirmations?: number;
  status: string;
  storeId: string;
  txHash?: string;
};

type CandidatePayout = {
  checkoutId: string;
  id: string;
  status: string;
};

type CandidateStore = {
  id: string;
  webhookSecret: string;
  webhookUrl?: string;
  withdrawAddress: string;
};

type Candidate = {
  checkout: CandidateCheckout;
  existingPayout?: CandidatePayout | null;
  store: CandidateStore;
};

export async function POST() {
  try {
    const developer = (await fetchAuthMutation(
      convex.refs.getOrClaimDeveloperForCurrentUser,
      {},
    )) as CurrentDeveloper;
    const config = getConfig();
    const now = Date.now();
    const candidates = (
      await convex.query<Candidate[]>(
        convex.refs.listPayoutCollectionCandidates,
        {},
      )
    ).filter((candidate) => candidate.checkout.developerId === developer.id);

    let eligibleCount = 0;
    let existingPayoutCount = 0;
    let queuedCount = 0;
    const skipped: Array<{ checkoutId: string; reason: string }> = [];
    const payouts: Array<{
      checkoutId: string;
      payoutCreated: boolean;
      payoutId: string;
    }> = [];

    for (const { checkout, existingPayout, store } of candidates) {
      const requiredConfirmations =
        checkout.requiredConfirmations ?? config.REQUIRED_CONFIRMATIONS;
      if (
        !isAtLeastAtomicWithTolerance({
          minimum: checkout.amountAtomic,
          toleranceAtomic: config.PAYMENT_UNDERPAY_TOLERANCE_ATOMIC,
          value: checkout.receivedAtomic,
        })
      ) {
        skipped.push({
          checkoutId: checkout.id,
          reason: "amount_not_received",
        });
        continue;
      }
      if (checkout.confirmations < requiredConfirmations) {
        skipped.push({
          checkoutId: checkout.id,
          reason: "confirmations_below_threshold",
        });
        continue;
      }

      eligibleCount += 1;

      if (existingPayout) {
        existingPayoutCount += 1;
        await convex.mutation(convex.refs.updateCheckoutPaymentState, {
          checkoutId: checkout.id,
          confirmations: checkout.confirmations,
          now,
          receivedAtomic: checkout.receivedAtomic,
          status:
            existingPayout.status === "sent" ? "paid_out" : "payout_pending",
          txHash: checkout.txHash,
        });
        payouts.push({
          checkoutId: checkout.id,
          payoutCreated: false,
          payoutId: existingPayout.id,
        });
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

      const existingVerifiedWebhook = await convex.query<{ id: string } | null>(
        convex.refs.getWebhookAttemptForCheckoutEvent,
        {
          checkoutId: checkout.id,
          event: "payment.verified",
        },
      );
      if (!existingVerifiedWebhook) {
        await deliverWebhook({
          checkoutId: checkout.id,
          event: "payment.verified",
          payload: {
            amountAtomic: checkout.amountAtomic,
            checkoutId: checkout.id,
            confirmations: checkout.confirmations,
            currency: "XMR",
            event: "payment.verified",
            metadata: checkout.metadata ?? {},
            receivedAtomic: checkout.receivedAtomic,
            requiredConfirmations,
            storeId: checkout.storeId,
            txHash: checkout.txHash,
          },
          secret: store.webhookSecret,
          storeId: checkout.storeId,
          url: store.webhookUrl,
        });
      }

      const payoutBreakdown = calculatePayoutAmount({
        amountAtomic: checkout.amountAtomic,
        maxTotalFeeBps: config.MAX_TOTAL_FEE_BPS,
        networkFeeReserveAtomic: config.PAYOUT_NETWORK_FEE_RESERVE_ATOMIC,
        platformFeeBps: config.PLATFORM_FEE_BPS,
      });
      const payoutResult = await convex.mutation<{
        created: boolean;
        payoutId: string;
      }>(convex.refs.createPayoutIfMissing, {
        ...payoutBreakdown,
        amountAtomic: payoutBreakdown.netPayoutAtomic,
        checkoutId: checkout.id,
        developerId: developer.id,
        now,
        storeId: checkout.storeId,
        withdrawAddress: store.withdrawAddress,
      });

      if (payoutResult.created) {
        queuedCount += 1;
      }
      payouts.push({
        checkoutId: checkout.id,
        payoutCreated: payoutResult.created,
        payoutId: payoutResult.payoutId,
      });
    }

    return json({
      eligibleCount,
      existingPayoutCount,
      payoutCount: payouts.length,
      payouts,
      queuedCount,
      skipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error);
  }
}
