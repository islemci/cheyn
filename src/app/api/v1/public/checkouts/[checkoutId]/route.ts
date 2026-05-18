import { createCheckoutCallbackUrls } from "@/server/callbacks";
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
    const checkoutWithStore = await convex.query<{
      checkout: Record<string, unknown> | null;
      store: { webhookSecret: string } | null;
    } | null>(convex.refs.getCheckoutWithStore, { checkoutId });
    const checkout = checkoutWithStore?.checkout;

    if (!checkout || !checkoutWithStore?.store) {
      throw new ApiError(404, "Checkout not found");
    }
    const hostedCheckout = {
      ...checkout,
      address: checkout.subaddress,
      requiredConfirmations:
        checkout.requiredConfirmations ?? getConfig().REQUIRED_CONFIRMATIONS,
    };

    return json({
      ...hostedCheckout,
      ...createCheckoutCallbackUrls({
        checkout: hostedCheckout as never,
        store: checkoutWithStore.store,
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
