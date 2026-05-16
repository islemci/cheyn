import { requireAdmin } from "@/server/api-auth";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json } from "@/server/http";
import { calculateConfiguredPayoutBreakdown } from "@/server/payouts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ payoutId: string }> },
) {
  try {
    requireAdmin(request);
    const { payoutId } = await context.params;
    const result = await convex.query<{
      checkout: { amountAtomic: string } | null;
      payout: { id: string };
    } | null>(convex.refs.getPayoutWithCheckout, { payoutId });

    if (!result?.checkout) {
      throw new ApiError(404, "Payout or checkout not found");
    }

    const breakdown = calculateConfiguredPayoutBreakdown(
      result.checkout.amountAtomic,
    );
    await convex.mutation(convex.refs.recalculatePayoutAmount, {
      ...breakdown,
      amountAtomic: breakdown.netPayoutAtomic,
      now: Date.now(),
      payoutId,
    });

    return json({ ok: true, payoutId, ...breakdown });
  } catch (error) {
    return handleApiError(error);
  }
}
