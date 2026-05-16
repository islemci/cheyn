import { requireAdmin } from "@/server/api-auth";
import { convex } from "@/server/convex-client";
import { handleApiError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ payoutId: string }> },
) {
  try {
    requireAdmin(request);
    const { payoutId } = await context.params;
    await convex.mutation(convex.refs.markPayoutManualReview, {
      failedReason: "Manual review requested by admin",
      payoutId,
    });
    return json({ ok: true, payoutId });
  } catch (error) {
    return handleApiError(error);
  }
}
