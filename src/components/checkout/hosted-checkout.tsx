"use client";

import {
  CheckCircle2,
  Copy,
  ExternalLink,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type HostedCheckoutData = {
  address: string;
  amountAtomic: string;
  amountUsdCents?: string;
  cancelUrl?: string;
  confirmations: number;
  expiresAt: number;
  id: string;
  pricingCurrency?: string;
  receivedAtomic: string;
  requiredConfirmations: number;
  status: string;
  storeName?: string;
  successUrl?: string;
  txHash?: string;
  xmrUsdPriceDecimal?: string;
  xmrUsdPriceMicro?: string;
};

type HostedCheckoutProps = {
  checkout: HostedCheckoutData;
  paymentUri: string;
  qrDataUrl: string;
};

const completeStatuses = new Set(["confirmed", "payout_pending", "paid_out"]);

export function HostedCheckout({
  checkout: initialCheckout,
  paymentUri,
  qrDataUrl,
}: HostedCheckoutProps) {
  const [checkout, setCheckout] = useState(initialCheckout);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/public/checkouts/${checkout.id}`);
        if (!response.ok) {
          return;
        }
        const nextCheckout = (await response.json()) as HostedCheckoutData;
        setCheckout(nextCheckout);
      } catch {
        return;
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [checkout.id]);

  const progress = Math.min(
    100,
    Math.round(
      (checkout.confirmations / Math.max(checkout.requiredConfirmations, 1)) *
        100,
    ),
  );
  const isComplete = completeStatuses.has(checkout.status);
  const isExpired = checkout.status === "expired";
  const amountXmr = useMemo(
    () => formatAtomic(checkout.amountAtomic),
    [checkout.amountAtomic],
  );
  const displayAmount = useMemo(
    () => formatCheckoutAmount(checkout),
    [checkout],
  );
  const receivedXmr = useMemo(
    () => formatAtomic(checkout.receivedAtomic),
    [checkout.receivedAtomic],
  );

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopyStatus(`${label} copied`);
    window.setTimeout(() => setCopyStatus(null), 2200);
  }

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-10 px-4 py-10 md:grid-cols-[0.88fr_1.12fr] md:px-6">
        <section className="grid gap-7">
          <Link href="/" className="inline-flex w-fit items-center">
            <Image
              src="/cheyn.svg"
              alt="cheyn"
              width={116}
              height={45}
              className="theme-logo h-10 w-auto"
              priority
            />
          </Link>

          <div>
            <Badge variant={isComplete ? "success" : "outline"}>
              {isComplete ? (
                <CheckCircle2 className="mr-1 size-3" />
              ) : (
                <RadioTower className="mr-1 size-3" />
              )}
              {statusLabel(checkout.status)}
            </Badge>
            <h1 className="mt-5 max-w-xl font-semibold text-4xl tracking-normal md:text-[3rem] md:leading-[1.08]">
              Pay {displayAmount} to {checkout.storeName ?? "this checkout"}.
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground leading-7">
              Scan with your Monero wallet and send the exact converted amount.
              This page updates automatically while the wallet watches the
              chain.
            </p>
          </div>

          <div className="grid gap-3 text-sm">
            <InfoLine
              icon={<LockKeyhole className="size-4" />}
              label="Signed payment session"
              value={`Checkout ${shortId(checkout.id)}`}
            />
            <InfoLine
              icon={<ShieldCheck className="size-4" />}
              label="Confirmation target"
              value={`${checkout.confirmations} / ${checkout.requiredConfirmations} blocks`}
            />
            <InfoLine
              icon={<Wallet className="size-4" />}
              label="Received"
              value={receivedXmr}
            />
          </div>
        </section>

        <section className="grid gap-5 md:pt-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-medium text-lg">Scan to pay</h2>
              <p className="text-muted-foreground text-sm">
                Use a Monero wallet or copy the address below.
              </p>
            </div>
            <Badge variant={isExpired ? "warning" : "muted"}>
              {isExpired ? "Expired" : "Live"}
            </Badge>
          </div>

          <div className="grid gap-6 border-border border-y py-6 md:grid-cols-[168px_1fr]">
            <div className="grid size-[168px] place-items-center rounded-md border border-border bg-white p-3">
              <Image
                src={qrDataUrl}
                alt="Monero payment QR code"
                width={144}
                height={144}
                className="size-full object-contain"
                unoptimized
                priority
              />
            </div>

            <div className="grid content-start gap-3">
              <PaymentField label="Checkout amount" value={displayAmount} />
              {displayAmount !== amountXmr && (
                <PaymentField label="Exact Monero amount" value={amountXmr} />
              )}
              {checkout.xmrUsdPriceDecimal && (
                <PaymentField
                  label="Locked XMR/USD rate"
                  value={`$${checkout.xmrUsdPriceDecimal}`}
                />
              )}
              <PaymentField label="Address" value={checkout.address} mono />
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => copy(checkout.address, "Address")}>
                  <Copy />
                  Copy address
                </Button>
                <Button asChild variant="outline">
                  <a href={paymentUri}>
                    <Wallet />
                    Open wallet
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="border-border border-b pb-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Confirmation progress</span>
              <span className="text-muted-foreground">
                {checkout.confirmations} / {checkout.requiredConfirmations}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-muted-foreground text-sm">
              {isComplete
                ? "Payment verified. The merchant has been notified."
                : "Waiting for the required block confirmations."}
            </p>
          </div>

          {copyStatus && (
            <p className="rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
              {copyStatus}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {checkout.cancelUrl && !isComplete && (
              <Button asChild variant="outline">
                <Link href={checkout.cancelUrl}>Cancel</Link>
              </Button>
            )}
            {checkout.successUrl && isComplete && (
              <Button asChild>
                <Link href={checkout.successUrl}>
                  Continue <ExternalLink />
                </Link>
              </Button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-border border-t py-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function PaymentField({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="mb-2 text-muted-foreground text-sm">{label}</div>
      <div className="flex min-h-7 items-center">
        <span
          className={`min-w-0 text-sm leading-relaxed ${
            mono ? "break-all font-mono text-[13px]" : "font-semibold text-base"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    confirmed: "Verified",
    confirming: "Confirming",
    expired: "Expired",
    paid_out: "Paid out",
    payout_pending: "Verified",
    seen: "Payment seen",
    waiting_for_payment: "Awaiting payment",
  };
  return labels[status] ?? status;
}

function shortId(value: string) {
  return value.length > 14
    ? `${value.slice(0, 7)}...${value.slice(-4)}`
    : value;
}

function formatCheckoutAmount(checkout: HostedCheckoutData) {
  if (checkout.pricingCurrency === "USD" && checkout.amountUsdCents) {
    return formatUsdCents(checkout.amountUsdCents);
  }
  return formatAtomic(checkout.amountAtomic);
}

function formatUsdCents(amountUsdCents: string) {
  const cents = BigInt(amountUsdCents);
  const dollars = cents / 100n;
  const remainder = (cents % 100n).toString().padStart(2, "0");
  return `$${dollars.toString()}.${remainder}`;
}

function formatAtomic(amountAtomic: string) {
  const amount = BigInt(amountAtomic);
  const whole = amount / 1_000_000_000_000n;
  const fraction = (amount % 1_000_000_000_000n)
    .toString()
    .padStart(12, "0")
    .replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ""} XMR`;
}
