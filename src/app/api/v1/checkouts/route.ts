import { randomUUID } from "node:crypto";

import { requireDeveloper } from "@/server/api-auth";
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
import {
  createWalletManager,
  settlementTypeForMode,
} from "@/server/wallet-manager";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = randomUUID();
  let stage = "authenticate";
  const logContext: {
    developerId?: string;
    pricingCurrency?: "USD" | "XMR";
    requestId: string;
    route: string;
    stage: string;
    storeId?: string;
  } = {
    requestId,
    route: "/api/v1/checkouts",
    stage,
  };

  try {
    const developer = await requireDeveloper(request);
    logContext.developerId = developer.id;
    rateLimit(`checkout:${developer.id}`, 60, 60_000);

    stage = "parse_request";
    logContext.stage = stage;
    const input = await parseJson(request, CreateCheckoutSchema);
    logContext.storeId = input.storeId;
    const config = getConfig();
    const amountUsdCents =
      input.amountUsdCents ??
      (input.currency === "USD" && input.amount
        ? usdDisplayToCents(input.amount)
        : undefined);
    logContext.pricingCurrency = amountUsdCents ? "USD" : "XMR";

    stage = "fetch_xmr_usd_price";
    logContext.stage = stage;
    const pricing = amountUsdCents
      ? await getFreshXmrUsdPrice().catch((error: unknown) => {
          throw new ApiError(503, "XMR/USD price is temporarily unavailable", {
            cause: error,
          });
        })
      : undefined;

    stage = "calculate_amount";
    logContext.stage = stage;
    const amountAtomic = input.amountAtomic
      ? assertAtomicAmount(input.amountAtomic)
      : usdCentsToAtomicFromUsdPrice({
          amountUsdCents: amountUsdCents as string,
          xmrUsdPriceDecimal: pricing?.priceUsdDecimal,
          xmrUsdPriceMicro: pricing?.priceUsdMicro,
        });

    if (BigInt(amountAtomic) < BigInt(config.MIN_CHECKOUT_AMOUNT_ATOMIC)) {
      throw new ApiError(400, "Checkout amount is below the minimum amount");
    }

    stage = "load_store";
    logContext.stage = stage;
    const store = await convex.query<{
      encryptedPrivateViewKey?: string;
      id: string;
      paymentMode?: "hosted" | "view_only";
      restoreHeight?: number;
      status: string;
      successCallbackUrl?: string;
      cancelCallbackUrl?: string;
      viewOnlyWalletReference?: string;
    } | null>(convex.refs.getStoreForDeveloper, {
      developerId: developer.id,
      storeId: input.storeId,
    });
    if (!store || store.status !== "active") {
      throw new ApiError(404, "Store not found");
    }
    const successUrl = input.successUrl ?? store.successCallbackUrl;
    const cancelUrl = input.cancelUrl ?? store.cancelCallbackUrl;

    const requestFingerprint = createRequestFingerprint({
      amountAtomic,
      amountUsdCents,
      cancelUrl,
      metadata: input.metadata ?? {},
      pricingCurrency: amountUsdCents ? "USD" : "XMR",
      storeId: input.storeId,
      successUrl,
    });

    if (input.idempotencyKey) {
      stage = "load_idempotent_checkout";
      logContext.stage = stage;
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
          amountUsdCents:
            "amountUsdCents" in existing ? existing.amountUsdCents : undefined,
          checkoutId: existing.id,
          checkoutUrl: `${config.API_BASE_URL}/c/${existing.id}`,
          currency: "XMR",
          mode: "mode" in existing ? existing.mode : "hosted",
          pricingCurrency:
            "pricingCurrency" in existing ? existing.pricingCurrency : "XMR",
          requiredConfirmations:
            "requiredConfirmations" in existing
              ? existing.requiredConfirmations
              : config.REQUIRED_CONFIRMATIONS,
          settlementType:
            "settlementType" in existing
              ? existing.settlementType
              : "platform_payout",
          status: existing.status,
        });
      }
    }

    stage = "create_wallet_subaddress";
    logContext.stage = stage;
    const walletManager = createWalletManager();
    const mode = store.paymentMode ?? "hosted";
    const settlementType = settlementTypeForMode(mode);
    const walletContext = walletManager.resolveWalletContext({
      encryptedPrivateViewKey: store.encryptedPrivateViewKey,
      id: store.id,
      mode,
      restoreHeight: store.restoreHeight,
      viewOnlyWalletReference: store.viewOnlyWalletReference,
    });
    const subaddress = await walletManager
      .createPaymentAddress({
        encryptedPrivateViewKey: store.encryptedPrivateViewKey,
        id: store.id,
        mode,
        restoreHeight: store.restoreHeight,
        viewOnlyWalletReference: store.viewOnlyWalletReference,
      })
      .catch((error: unknown) => {
        throw new ApiError(503, "Wallet RPC is temporarily unavailable", {
          cause: error,
        });
      });
    const now = Date.now();
    const requiredConfirmations = getRequiredConfirmationsForAmount(
      amountAtomic,
      config,
    );
    stage = "persist_checkout";
    logContext.stage = stage;
    const result = await convex.mutation<{ checkoutId: string }>(
      convex.refs.createCheckout,
      {
        amountAtomic,
        amountUsdCents,
        cancelUrl,
        developerId: developer.id,
        expiresAt: now + config.CHECKOUT_EXPIRY_MINUTES * 60_000,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        mode,
        now,
        pricingCurrency: amountUsdCents ? "USD" : "XMR",
        requiredConfirmations,
        requestFingerprint,
        settlementType,
        storeId: input.storeId,
        subaddress: subaddress.address,
        subaddressIndexMajor: subaddress.majorIndex,
        subaddressIndexMinor: subaddress.minorIndex,
        walletContextId: walletContext.id,
        successUrl,
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
        mode,
        pricingCurrency: amountUsdCents ? "USD" : "XMR",
        requiredConfirmations,
        settlementType,
        status: "waiting_for_payment",
        cancelUrl,
        successUrl,
        xmrUsdPriceDecimal: pricing?.priceUsdDecimal,
        xmrUsdPriceMicro: pricing?.priceUsdMicro,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, {
      metadata: {
        developerId: logContext.developerId,
        pricingCurrency: logContext.pricingCurrency,
        storeId: logContext.storeId,
      },
      requestId,
      route: logContext.route,
      stage: logContext.stage,
    });
  }
}
