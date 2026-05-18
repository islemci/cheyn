import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ checkoutId: string }> },
) {
  try {
    const { checkoutId } = await context.params;
    const checkout = await convex.query<Record<string, unknown> | null>(
      convex.refs.getHostedCheckout,
      { checkoutId },
    );

    if (!checkout) {
      throw new ApiError(404, "Checkout not found");
    }

    return json({
      ...checkout,
      requiredConfirmations:
        checkout.requiredConfirmations ?? getConfig().REQUIRED_CONFIRMATIONS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
