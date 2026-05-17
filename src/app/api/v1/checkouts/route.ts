import { requireDeveloper } from "@/server/api-auth";
import { getConfig } from "@/server/config";
import { getRequiredConfirmationsForAmount } from "@/server/confirmations";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json, parseJson } from "@/server/http";
import { createRequestFingerprint } from "@/server/idempotency";
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
    const config = getConfig();
    if (
      BigInt(input.amountAtomic) < BigInt(config.MIN_CHECKOUT_AMOUNT_ATOMIC)
    ) {
      throw new ApiError(400, "Checkout amount is below the minimum amount");
    }

    const requestFingerprint = createRequestFingerprint({
      amountAtomic: input.amountAtomic,
      cancelUrl: input.cancelUrl,
      metadata: input.metadata ?? {},
      storeId: input.storeId,
      successUrl: input.successUrl,
    });

    if (input.idempotencyKey) {
      const existing = await convex.query<{
        id: string;
        amountAtomic: string;
        requestFingerprint?: string;
        requiredConfirmations?: number;
        status: string;
        subaddress: string;
      } | null>(convex.refs.getCheckoutByIdempotency, {
        developerId: developer.id,
        idempotencyKey: input.idempotencyKey,
      });

      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new ApiError(
            409,
            "Idempotency key was already used with different checkout parameters",
          );
        }
        return json({
          address: existing.subaddress,
          amountAtomic: existing.amountAtomic,
          checkoutId: existing.id,
          checkoutUrl: `${config.API_BASE_URL}/c/${existing.id}`,
          currency: "XMR",
          requiredConfirmations:
            "requiredConfirmations" in existing
              ? existing.requiredConfirmations
              : config.REQUIRED_CONFIRMATIONS,
          status: existing.status,
        });
      }
    }

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

    const wallet = createWalletClient();
    const subaddress = await wallet.createSubaddress();
    const now = Date.now();
    const requiredConfirmations = getRequiredConfirmationsForAmount(
      input.amountAtomic,
      config,
    );
    const result = await convex.mutation<{ checkoutId: string }>(
      convex.refs.createCheckout,
      {
        amountAtomic: input.amountAtomic,
        cancelUrl: input.cancelUrl,
        developerId: developer.id,
        expiresAt: now + config.CHECKOUT_EXPIRY_MINUTES * 60_000,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        now,
        requiredConfirmations,
        requestFingerprint,
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
        requiredConfirmations,
        status: "waiting_for_payment",
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
