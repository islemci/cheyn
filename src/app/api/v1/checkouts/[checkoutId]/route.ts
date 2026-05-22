import { requireDeveloper } from "@/server/api-auth";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ checkoutId: string }> },
) {
  try {
    const developer = await requireDeveloper(request);
    rateLimit(`status:${developer.id}`, 300, 60_000);

    const { checkoutId } = await context.params;
    const checkout = await convex.query<{
      id: string;
      amountAtomic: string;
      receivedAtomic: string;
      confirmations: number;
      mode?: string;
      requiredConfirmations?: number;
      settlementType?: string;
      status: string;
      txHash?: string;
      subaddress: string;
    } | null>(convex.refs.getCheckoutForDeveloper, {
      checkoutId,
      developerId: developer.id,
    });

    if (!checkout) {
      throw new ApiError(404, "Checkout not found");
    }

    return json({
      address: checkout.subaddress,
      amountAtomic: checkout.amountAtomic,
      checkoutId: checkout.id,
      confirmations: checkout.confirmations,
      currency: "XMR",
      mode: checkout.mode ?? "hosted",
      receivedAtomic: checkout.receivedAtomic,
      requiredConfirmations:
        checkout.requiredConfirmations ?? getConfig().REQUIRED_CONFIRMATIONS,
      settlementType: checkout.settlementType ?? "platform_payout",
      status: normalizeCheckoutStatus(checkout.status),
      txHash: checkout.txHash,
      txHashes: checkout.txHash ? [checkout.txHash] : [],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function normalizeCheckoutStatus(status: string) {
  if (status === "paid_out") {
    return "settled";
  }
  return status;
}
