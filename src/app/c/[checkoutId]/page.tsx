import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import {
  HostedCheckout,
  type HostedCheckoutData,
} from "@/components/checkout/hosted-checkout";
import { createCheckoutCallbackUrls } from "@/server/callbacks";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { atomicToDisplay } from "@/server/money";

export const dynamic = "force-dynamic";

type CheckoutPageProps = {
  params: Promise<{ checkoutId: string }>;
};

export async function generateMetadata({
  params,
}: CheckoutPageProps): Promise<Metadata> {
  const { checkoutId } = await params;
  return {
    title: `Checkout ${checkoutId} | cheyn`,
  };
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { checkoutId } = await params;
  const checkoutWithStore = await convex.query<{
    checkout: HostedCheckoutData | null;
    store: { webhookSecret: string } | null;
  } | null>(convex.refs.getCheckoutWithStore, { checkoutId });
  const checkout = checkoutWithStore?.checkout;

  if (!checkout || !checkoutWithStore?.store) {
    notFound();
  }

  const requiredConfirmations =
    checkout.requiredConfirmations ?? getConfig().REQUIRED_CONFIRMATIONS;
  const amountXmr = atomicToDisplay(checkout.amountAtomic);
  const hostedCheckout = {
    ...checkout,
    address: checkout.address ?? checkout.subaddress,
    requiredConfirmations,
  };
  if (!hostedCheckout.address) {
    notFound();
  }

  const paymentUri = `monero:${hostedCheckout.address}?tx_amount=${amountXmr}`;
  const qrDataUrl = await QRCode.toDataURL(paymentUri, {
    color: {
      dark: "#171717",
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
    margin: 1,
    width: 440,
  });

  return (
    <HostedCheckout
      checkout={{
        ...hostedCheckout,
        ...createCheckoutCallbackUrls({
          checkout: hostedCheckout,
          store: checkoutWithStore.store,
        }),
      }}
      paymentUri={paymentUri}
      qrDataUrl={qrDataUrl}
    />
  );
}
