import { requireAdmin } from "@/server/api-auth";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { handleApiError, json } from "@/server/http";
import { calculatePayoutAmount } from "@/server/money";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ checkoutId: string }> },
) {
  try {
    requireAdmin(request);
    const { checkoutId } = await context.params;
    const config = getConfig();
    const now = Date.now();

    // Get checkout details
    const checkoutWithStore = await convex.query<{
      checkout: {
        id: string;
        amountAtomic: string;
        status: string;
        developerId: string;
        storeId: string;
      } | null;
      store: { withdrawAddress: string } | null;
    } | null>(convex.refs.getCheckoutWithStore, {
      checkoutId,
    });

    if (!checkoutWithStore?.checkout || !checkoutWithStore.store) {
      return json(
        { ok: false, error: "Checkout or store not found" },
        { status: 404 },
      );
    }

    const checkout = checkoutWithStore.checkout;

    // Update checkout status to confirmed
    await convex.mutation(convex.refs.updateCheckoutPaymentState, {
      checkoutId: checkout.id,
      confirmations: 999,
      now,
      receivedAtomic: checkout.amountAtomic,
      status: "confirmed",
    });

    // Create payout
    const payoutBreakdown = calculatePayoutAmount({
      amountAtomic: checkout.amountAtomic,
      maxTotalFeeBps: config.MAX_TOTAL_FEE_BPS,
      networkFeeReserveAtomic: config.PAYOUT_NETWORK_FEE_RESERVE_ATOMIC,
      platformFeeBps: config.PLATFORM_FEE_BPS,
    });

    const payoutResult = await convex.mutation<{
      payoutId: string;
      created: boolean;
    }>(convex.refs.createPayoutIfMissing, {
      ...payoutBreakdown,
      amountAtomic: payoutBreakdown.netPayoutAtomic,
      checkoutId: checkout.id,
      developerId: checkout.developerId,
      now,
      storeId: checkout.storeId,
      withdrawAddress: checkoutWithStore.store.withdrawAddress,
    });

    return json({
      ok: true,
      checkoutId: checkout.id,
      payoutId: payoutResult.payoutId,
      payoutCreated: payoutResult.created,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
