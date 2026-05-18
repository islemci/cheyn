import { fetchAuthMutation } from "@/lib/auth-server";
import { getFreshXmrUsdPrice } from "@/server/coinmarketcap";
import { getConfig } from "@/server/config";
import { getRequiredConfirmationsForAmount } from "@/server/confirmations";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json, parseJson } from "@/server/http";
import { createRequestFingerprint } from "@/server/idempotency";
import {
  assertAtomicAmount,
  usdCentsToAtomicFromUsdPrice,
  usdDisplayToCents,
} from "@/server/money";
import { rateLimit } from "@/server/rate-limit";
import { CreateCheckoutSchema } from "@/server/schemas";
import { createWalletClient } from "@/server/wallet-rpc";

export const dynamic = "force-dynamic";

type CurrentDeveloper = {
  id: string;
};

export async function POST(request: Request) {
  try {
    const developer = (await fetchAuthMutation(
      convex.refs.getOrClaimDeveloperForCurrentUser,
      {},
    )) as CurrentDeveloper;
    rateLimit(`checkout:${developer.id}`, 60, 60_000);

    const input = await parseJson(request, CreateCheckoutSchema);
    const config = getConfig();
    const amountUsdCents =
      input.amountUsdCents ??
      (input.currency === "USD" && input.amount
        ? usdDisplayToCents(input.amount)
        : undefined);
    const pricing = amountUsdCents ? await getFreshXmrUsdPrice() : undefined;
    const amountAtomic = input.amountAtomic
      ? assertAtomicAmount(input.amountAtomic)
      : usdCentsToAtomicFromUsdPrice({
          amountUsdCents: amountUsdCents as string,
          xmrUsdPriceDecimal: pricing?.priceUsdDecimal as string,
        });

    if (BigInt(amountAtomic) < BigInt(config.MIN_CHECKOUT_AMOUNT_ATOMIC)) {
      throw new ApiError(400, "Checkout amount is below the minimum amount");
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

    const requestFingerprint = createRequestFingerprint({
      amountAtomic,
      amountUsdCents,
      cancelUrl: input.cancelUrl,
      metadata: input.metadata ?? {},
      pricingCurrency: amountUsdCents ? "USD" : "XMR",
      storeId: input.storeId,
      successUrl: input.successUrl,
    });
    const wallet = createWalletClient();
    const subaddress = await wallet.createSubaddress();
    const now = Date.now();
    const requiredConfirmations = getRequiredConfirmationsForAmount(
      amountAtomic,
      config,
    );
    const result = await convex.mutation<{ checkoutId: string }>(
      convex.refs.createCheckout,
      {
        amountAtomic,
        amountUsdCents,
        cancelUrl: input.cancelUrl,
        developerId: developer.id,
        expiresAt: now + config.CHECKOUT_EXPIRY_MINUTES * 60_000,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        now,
        pricingCurrency: amountUsdCents ? "USD" : "XMR",
        requiredConfirmations,
        requestFingerprint,
        storeId: input.storeId,
        subaddress: subaddress.address,
        subaddressIndexMajor: subaddress.majorIndex,
        subaddressIndexMinor: subaddress.minorIndex,
        successUrl: input.successUrl,
        xmrUsdPriceFetchedAt: pricing?.fetchedAt,
        xmrUsdPriceDecimal: pricing?.priceUsdDecimal,
        xmrUsdPriceMicro: pricing?.priceUsdMicro,
        xmrUsdPriceSource: pricing?.source,
      },
    );

    return json(
      {
        address: subaddress.address,
        amountAtomic,
        amountUsdCents,
        checkoutId: result.checkoutId,
        checkoutUrl: `${config.API_BASE_URL}/c/${result.checkoutId}`,
        currency: "XMR",
        pricingCurrency: amountUsdCents ? "USD" : "XMR",
        requiredConfirmations,
        status: "waiting_for_payment",
        xmrUsdPriceDecimal: pricing?.priceUsdDecimal,
        xmrUsdPriceMicro: pricing?.priceUsdMicro,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error);
  }
}
