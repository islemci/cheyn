import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import {
  HostedCheckout,
  type HostedCheckoutData,
} from "@/components/checkout/hosted-checkout";
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
  const checkout = await convex.query<HostedCheckoutData | null>(
    convex.refs.getHostedCheckout,
    { checkoutId },
  );

  if (!checkout) {
    notFound();
  }

  const requiredConfirmations =
    checkout.requiredConfirmations ?? getConfig().REQUIRED_CONFIRMATIONS;
  const amountXmr = atomicToDisplay(checkout.amountAtomic);
  const paymentUri = `monero:${checkout.address}?tx_amount=${amountXmr}`;
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
      checkout={{ ...checkout, requiredConfirmations }}
      paymentUri={paymentUri}
      qrDataUrl={qrDataUrl}
    />
  );
}
