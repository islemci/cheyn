import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  CircleDollarSign,
  Code2,
  KeyRound,
  RadioTower,
  ShieldCheck,
  WalletCards,
  Webhook,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const workflow = [
  {
    icon: Code2,
    label: "Create checkout",
    text: "Your server calls the API with an amount in atomic units.",
  },
  {
    icon: WalletCards,
    label: "Generate address",
    text: "Wallet RPC creates a dedicated Monero subaddress.",
  },
  {
    icon: Blocks,
    label: "Track confirmations",
    text: "The worker scans transfers and applies your tier policy.",
  },
  {
    icon: Webhook,
    label: "Settle and notify",
    text: "Payout is queued and your app receives a signed webhook.",
  },
];

const features = [
  {
    icon: KeyRound,
    title: "Developer API keys",
    text: "Issue and rotate keys while storing only hashes.",
  },
  {
    icon: RadioTower,
    title: "Wallet RPC isolation",
    text: "Expose checkout APIs, not raw wallet RPC endpoints.",
  },
  {
    icon: CircleDollarSign,
    title: "Payout controls",
    text: "Fees, retry delays, max payout limits, and manual review.",
  },
  {
    icon: ShieldCheck,
    title: "Signed webhooks",
    text: "HMAC-signed events with retry tracking in Convex.",
  },
];

const tiers = [
  ["0 - 0.025 XMR", "1 block"],
  ["0.025 - 0.1 XMR", "2 blocks"],
  ["0.1 - 1 XMR", "3 blocks"],
  ["> 1 XMR", "5 blocks"],
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-border border-b bg-background/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
              X
            </span>
            MoneroBar Pay
          </Link>
          <div className="hidden items-center gap-6 text-muted-foreground text-sm md:flex">
            <Link href="#product">Product</Link>
            <Link href="#workflow">Workflow</Link>
            <Link href="#pricing">Pricing</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">
                Start now <ArrowRight />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="max-w-3xl">
          <Badge variant="outline" className="mb-6">
            <ShieldCheck className="mr-1 size-3" />
            Monero checkout infrastructure
          </Badge>
          <h1 className="max-w-4xl font-semibold text-5xl tracking-normal sm:text-6xl lg:text-7xl">
            Accept Monero without building payment ops from scratch.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-8">
            A developer-first API for creating XMR checkouts, watching
            confirmations, sending payouts, and notifying your app with signed
            webhooks.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/sign-up">
                Create account <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">View dashboard</Link>
            </Button>
          </div>
          <div className="mt-8 grid max-w-xl gap-3 text-sm sm:grid-cols-3">
            {["API keys", "Subaddresses", "Auto payout"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div id="product" className="border-border border bg-card p-4">
          <div className="flex items-center justify-between border-border border-b pb-4">
            <div>
              <p className="font-medium">Live checkout</p>
              <p className="text-muted-foreground text-sm">
                chk_8f4a · 0.042 XMR
              </p>
            </div>
            <Badge variant="warning">2 / 2 blocks</Badge>
          </div>
          <div className="grid gap-3 py-4">
            <InfoRow label="Address" value="84zpXBpN...6LaWS1" />
            <InfoRow label="Received" value="0.042 XMR" />
            <InfoRow label="Webhook" value="payment.confirmed" />
          </div>
          <div className="border-border border-t pt-4">
            <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
              <code>{`POST /api/v1/checkouts
{
  "storeId": "store_...",
  "amountAtomic": "42000000000"
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-border border-t py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <Badge variant="muted" className="mb-4">
              Backend-first
            </Badge>
            <h2 className="font-semibold text-3xl">
              One API flow from checkout to payout.
            </h2>
            <p className="mt-3 text-muted-foreground">
              The public surface stays small. Your app creates checkouts and
              reads status; the worker handles wallet observations and payouts.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item) => (
              <Card key={item.label}>
                <CardHeader>
                  <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-muted">
                    <item.icon className="size-4" />
                  </div>
                  <CardTitle>{item.label}</CardTitle>
                  <CardDescription>{item.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-border border-t bg-muted/40 py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <Badge variant="muted" className="mb-4">
              Operations
            </Badge>
            <h2 className="font-semibold text-3xl">
              Controls for real-fund handling.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Keep wallet access private, set confirmation tiers by amount, and
              prevent unsafe payout behavior with environment-managed limits.
            </p>
          </div>
          <div className="grid gap-3">
            {tiers.map(([range, blocks]) => (
              <div
                key={range}
                className="flex items-center justify-between border border-border bg-card p-4"
              >
                <span className="text-muted-foreground text-sm">{range}</span>
                <Badge variant="outline">{blocks}</Badge>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-border border-t py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-muted">
                    <item.icon className="size-4" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-border border-t py-16">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <Badge variant="outline" className="mb-4">
              Pricing
            </Badge>
            <h2 className="font-semibold text-3xl">
              Simple payment processing fee.
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Start with the hosted API flow. No subscription layer, no customer
              accounts, no multi-currency complexity.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-4xl">3%</CardTitle>
              <CardDescription>
                Standard processing fee, capped by your configured max total fee
                policy for smaller payments.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                "Checkout creation",
                "Subaddress generation",
                "Confirmation tracking",
                "Automatic payout",
                "Signed webhooks",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  {item}
                </div>
              ))}
              <Button asChild className="mt-2">
                <Link href="/sign-up">
                  Create account <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="min-w-0 truncate font-mono text-sm">{value}</span>
    </div>
  );
}
