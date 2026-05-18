import { createHmac } from "node:crypto";

type CheckoutForCallback = {
  amountAtomic: string;
  cancelUrl?: string;
  id: string;
  receivedAtomic: string;
  status: string;
  storeId: string;
  successUrl?: string;
  txHash?: string;
};

type StoreForCallback = {
  webhookSecret: string;
};

export function createCheckoutCallbackUrls(args: {
  checkout: CheckoutForCallback;
  store: StoreForCallback;
  timestamp?: number;
}) {
  const timestamp = args.timestamp ?? Date.now();
  return {
    signedCancelUrl: args.checkout.cancelUrl
      ? signCallbackUrl({
          checkout: args.checkout,
          secret: args.store.webhookSecret,
          timestamp,
          url: args.checkout.cancelUrl,
        })
      : undefined,
    signedSuccessUrl: args.checkout.successUrl
      ? signCallbackUrl({
          checkout: args.checkout,
          secret: args.store.webhookSecret,
          timestamp,
          url: args.checkout.successUrl,
        })
      : undefined,
  };
}

function signCallbackUrl(args: {
  checkout: CheckoutForCallback;
  secret: string;
  timestamp: number;
  url: string;
}) {
  const params: Record<string, string> = {
    amountAtomic: args.checkout.amountAtomic,
    checkoutId: args.checkout.id,
    receivedAtomic: args.checkout.receivedAtomic,
    status: args.checkout.status,
    storeId: args.checkout.storeId,
    timestamp: String(args.timestamp),
  };

  if (args.checkout.txHash) {
    params.txHash = args.checkout.txHash;
  }

  const signature = createHmac("sha256", args.secret)
    .update(canonicalize(params))
    .digest("hex");
  const url = new URL(args.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("signature", signature);
  return url.toString();
}

function canonicalize(params: Record<string, string>) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}
