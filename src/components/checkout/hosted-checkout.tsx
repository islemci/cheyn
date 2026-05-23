"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  LockKeyhole,
  QrCode,
  RadioTower,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { MouseEvent, PointerEvent, ReactNode, TouchEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type HostedCheckoutData = {
  address?: string;
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
  storeId: string;
  storeName?: string;
  subaddress?: string;
  successUrl?: string;
  signedCancelUrl?: string;
  signedSuccessUrl?: string;
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
type InfoTriggerEvent =
  | MouseEvent<HTMLButtonElement>
  | PointerEvent<HTMLButtonElement>
  | TouchEvent<HTMLButtonElement>;

export function HostedCheckout({
  checkout: initialCheckout,
  paymentUri,
  qrDataUrl,
}: HostedCheckoutProps) {
  const [checkout, setCheckout] = useState(initialCheckout);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [showPaymentQr, setShowPaymentQr] = useState(false);

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
  const canRedirect =
    isComplete ||
    (checkout.confirmations >= checkout.requiredConfirmations &&
      isAtomicAtLeast(checkout.receivedAtomic, checkout.amountAtomic));
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
  const paymentAddress = checkout.address ?? checkout.subaddress ?? "";

  useEffect(() => {
    if (!canRedirect || !checkout.signedSuccessUrl) {
      return;
    }

    window.location.assign(checkout.signedSuccessUrl);
  }, [canRedirect, checkout.signedSuccessUrl]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopyStatus(`${label} copied`);
    window.setTimeout(() => setCopyStatus(null), 2200);
  }

  function openInfoDialog(event?: InfoTriggerEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    setIsInfoOpen(true);
  }

  return (
    <main className="min-h-[100dvh] bg-background pb-20 text-foreground">
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
              {displayAmount}
            </h1>
            <p className="mt-3 text-muted-foreground text-sm">
              {checkout.storeName ?? "Checkout payment"}
            </p>
            <p className="mt-4 max-w-md text-muted-foreground leading-7">
              {isExpired
                ? "This checkout can no longer accept a payment."
                : "Scan with your Monero wallet and send the exact amount. This page redirects automatically after the required confirmations."}
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
              <h2 className="font-medium text-lg">
                {isExpired ? "Checkout expired" : "Scan to pay"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {isExpired
                  ? "This payment session timed out after inactivity."
                  : "Use a Monero wallet or copy the address below."}
              </p>
            </div>
            <Badge variant={isExpired ? "warning" : "muted"}>
              {isExpired ? "Expired" : "Live"}
            </Badge>
          </div>

          {isExpired ? (
            <div className="grid gap-4 border-border border-y py-8">
              <div className="flex gap-4 rounded-md border border-border bg-muted/40 p-5">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-300" />
                <div>
                  <p className="font-medium">This checkout has expired.</p>
                  <p className="mt-2 text-muted-foreground text-sm leading-6">
                    The transaction window closed after inactivity. Do not send
                    funds to this checkout address. Create a new checkout from
                    the merchant app to continue.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 border-border border-y py-6 md:grid-cols-[168px_1fr]">
              <div
                className={`size-[168px] place-items-center rounded-md border border-border bg-white p-3 ${
                  showPaymentQr ? "grid" : "hidden md:grid"
                }`}
              >
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
                <PaymentField label="Amount" value={amountXmr} />
                <PaymentField label="Address" value={paymentAddress} mono />
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    disabled={!paymentAddress}
                    onClick={() => copy(paymentAddress, "Address")}
                  >
                    <Copy />
                    Copy address
                  </Button>
                  <Button asChild variant="outline">
                    <a href={paymentUri}>
                      <Wallet />
                      Open wallet
                    </a>
                  </Button>
                  <Button
                    className="md:hidden"
                    onClick={() => setShowPaymentQr((visible) => !visible)}
                    type="button"
                    variant="outline"
                  >
                    <QrCode />
                    {showPaymentQr ? "Hide payment QR" : "Show payment QR"}
                  </Button>
                </div>
              </div>
            </div>
          )}

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
              {canRedirect
                ? "Payment verified. Redirecting to the merchant..."
                : "Waiting for the required block confirmations."}
            </p>
          </div>

          {copyStatus && (
            <p className="rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
              {copyStatus}
            </p>
          )}
        </section>
      </div>
      <footer
        className="fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          aria-expanded={isInfoOpen}
          aria-haspopup="dialog"
          className="rounded-full border border-border bg-background/95 px-4 py-2 text-muted-foreground text-sm shadow-sm backdrop-blur underline-offset-4 hover:text-foreground hover:underline"
          onClick={openInfoDialog}
          onPointerUp={openInfoDialog}
          onTouchEnd={openInfoDialog}
          type="button"
        >
          What is this?
        </button>
      </footer>
      {isInfoOpen && (
        <CheckoutInfoDialog onClose={() => setIsInfoOpen(false)} />
      )}
    </main>
  );
}

function CheckoutInfoDialog({ onClose }: { onClose: () => void }) {
  const titleId = "checkout-info-title";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <button
        aria-label="Close information dialog"
        className="absolute inset-0 bg-black/25 backdrop-blur-md dark:bg-black/55"
        onPointerDown={onClose}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative z-10 w-full max-w-[460px] overflow-hidden rounded-xl border border-border bg-card text-left shadow-2xl"
        role="dialog"
      >
        <div className="border-border border-b bg-muted/35 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-background shadow-sm">
              <Info className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Checkout help
              </p>
              <h2 className="mt-1 font-semibold text-xl" id={titleId}>
                What is Cheyn?
              </h2>
              <p className="mt-2 text-muted-foreground text-sm leading-6">
                Cheyn verifies Monero payments for the merchant you are paying.
              </p>
            </div>
            <button
              aria-label="Close"
              className="rounded-full p-2 text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-5">
          <InfoPanel
            label="How it works"
            text="Send the exact amount shown on this page from your Monero wallet. Cheyn watches for the payment and waits for enough blockchain confirmations."
          />
          <InfoPanel
            label="What the merchant sees"
            text="When the payment is confirmed, Cheyn updates the checkout status and notifies the merchant so they can complete your order."
          />
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-medium text-amber-950 dark:text-amber-100">
              Refunds are handled by the merchant
            </p>
            <p className="mt-2 text-amber-950/75 text-sm leading-6 dark:text-amber-100/75">
              Cheyn cannot issue refunds from this page. If you paid the wrong
              amount, sent funds after expiration, or need money returned,
              contact the merchant directly.
            </p>
          </div>
        </div>

        <div className="flex justify-end border-border border-t bg-muted/25 p-4">
          <Button onClick={onClose} type="button">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfoPanel({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="font-medium">{label}</p>
      <p className="mt-2 text-muted-foreground text-sm leading-6">{text}</p>
    </div>
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

function isAtomicAtLeast(value: string, minimum: string) {
  try {
    return BigInt(value) >= BigInt(minimum);
  } catch {
    return false;
  }
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
