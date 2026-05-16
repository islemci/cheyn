import { requireAdmin } from "@/server/api-auth";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ checkoutId: string }> },
) {
  try {
    requireAdmin(request);
    const { checkoutId } = await context.params;
    const checkout = await convex.query(convex.refs.getCheckoutAdmin, {
      checkoutId,
    });

    if (!checkout) {
      throw new ApiError(404, "Checkout not found");
    }

    return json(checkout);
  } catch (error) {
    return handleApiError(error);
  }
}
