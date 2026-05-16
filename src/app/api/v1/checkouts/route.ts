import { requireDeveloper } from "@/server/api-auth";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json, parseJson } from "@/server/http";
import { assertAtomicAmount } from "@/server/money";
import { rateLimit } from "@/server/rate-limit";
import { CreateCheckoutSchema } from "@/server/schemas";
import { createWalletClient } from "@/server/wallet-rpc";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const developer = await requireDeveloper(request);
    rateLimit(`checkout:${developer.id}`, 60, 60_000);

    const input = await parseJson(request, CreateCheckoutSchema);
    assertAtomicAmount(input.amountAtomic);

    const store = await convex.query<{ id: string; status: string } | null>(
      convex.refs.getStoreForDeveloper,
      {
        developerId: developer.id,
        storeId: input.storeId,
      },
    );
    if (!store || store.status !== "active") {
      throw new ApiError(404, "Store not found");
    }

    const config = getConfig();
    const wallet = createWalletClient();
    const subaddress = await wallet.createSubaddress();
    const now = Date.now();
    const result = await convex.mutation<{ checkoutId: string }>(
      convex.refs.createCheckout,
      {
        amountAtomic: input.amountAtomic,
        cancelUrl: input.cancelUrl,
        developerId: developer.id,
        expiresAt: now + config.CHECKOUT_EXPIRY_MINUTES * 60_000,
        metadata: input.metadata,
        now,
        storeId: input.storeId,
        subaddress: subaddress.address,
        subaddressIndexMajor: subaddress.majorIndex,
        subaddressIndexMinor: subaddress.minorIndex,
        successUrl: input.successUrl,
      },
    );

    return json(
      {
        address: subaddress.address,
        amountAtomic: input.amountAtomic,
        checkoutId: result.checkoutId,
        checkoutUrl: `${config.API_BASE_URL}/c/${result.checkoutId}`,
        currency: "XMR",
        status: "waiting_for_payment",
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
