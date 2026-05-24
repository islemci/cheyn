import {
  ArrowRight,
  Blocks,
  CircleDollarSign,
  Code2,
  ShieldCheck,
  TerminalSquare,
  WalletCards,
  Webhook,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const workflow = [
  {
    icon: Code2,
    label: "Create",
    text: "Make a checkout link.",
  },
  {
    icon: WalletCards,
    label: "Collect",
    text: "Customer pays in XMR.",
  },
  {
    icon: Blocks,
    label: "Confirm",
    text: "We watch the blocks.",
  },
  {
    icon: Webhook,
    label: "Notify",
    text: "Your app gets the result.",
  },
];

const tiers = [
  ["0 - 0.025 XMR", "1 block"],
  ["0.025 - 0.1 XMR", "2 blocks"],
  ["0.1 - 1 XMR", "3 blocks"],
  ["> 1 XMR", "5 blocks"],
];

const stats = [
  ["0% fee", "Direct-to-merchant XMR"],
  ["Hosted", "Clean payment page"],
  ["Signed", "Callbacks included"],
];

export function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-border/80 border-b bg-background/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Image
              src="/cheyn.svg"
              alt="cheyn"
              width={104}
              height={40}
              className="theme-logo h-10 w-auto"
              priority
            />
          </Link>
          <div className="hidden items-center gap-7 text-muted-foreground text-sm md:flex">
            <Link
              className="transition-colors hover:text-foreground"
              href="#product"
            >
              Product
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="#workflow"
            >
              Workflow
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="#operations"
            >
              Operations
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="#pricing"
            >
              Pricing
            </Link>
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

      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_14%,rgba(251,146,60,0.12),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.08),transparent_24%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent,var(--background)_88%)]" />
        <div className="mx-auto grid min-h-[calc(92dvh-4rem)] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-6 bg-background/70">
              <ShieldCheck className="mr-1 size-3" />
              Monero checkout
            </Badge>
            <h1 className="text-balance font-semibold text-5xl leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
              Accept Monero without the extra mess.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground leading-8">
              Create a checkout, get paid in XMR, and send customers back when
              payment is confirmed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-11 px-5">
                <Link href="/sign-up">
                  Create a store <ArrowRight />
                </Link>
              </Button>
              <Button asChild className="h-11 px-5" variant="outline">
                <Link href="/dashboard/overview">Open dashboard</Link>
              </Button>
            </div>
            <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
              {stats.map(([value, label]) => (
                <div
                  key={value}
                  className="rounded-xl border border-border/80 bg-background/50 p-3"
                >
                  <p className="font-mono font-medium text-sm tabular-nums">
                    {value}
                  </p>
                  <p className="mt-1 text-muted-foreground text-sm">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div id="product" className="relative">
            <div className="absolute -inset-x-8 top-10 bottom-4 -z-10 rounded-[2rem] bg-muted/60 blur-3xl" />
            <div className="grid gap-4">
              <div className="rounded-2xl border border-border bg-card/95 p-5 shadow-xl shadow-zinc-950/5 dark:shadow-black/20">
                <div className="flex items-start justify-between gap-5 border-border border-b pb-5">
                  <div>
                    <p className="font-medium text-sm text-muted-foreground">
                      Hosted checkout
                    </p>
                    <h2 className="mt-2 font-semibold text-2xl">0.042 XMR</h2>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Akari Labs · chk_8f4a
                    </p>
                  </div>
                  <Badge variant="warning">2 / 2 blocks</Badge>
                </div>

                <div className="grid gap-3 py-5">
                  <InfoRow label="Address" value="84zpXBpN...6LaWS1" />
                  <InfoRow label="Received" value="0.042 XMR" />
                  <InfoRow label="Webhook" value="payment.confirmed" />
                </div>

                <div className="rounded-xl border border-border bg-muted/50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <TerminalSquare className="size-4 text-muted-foreground" />
                      <span className="font-medium">Checkout request</span>
                    </div>
                    <span className="font-mono text-muted-foreground text-xs">
                      201 Created
                    </span>
                  </div>
                  <pre className="overflow-x-auto text-sm leading-6">
                    <code>{`POST /api/v1/checkouts
{
  "storeId": "store_live_9m2",
  "amountAtomic": "42000000000"
}`}</code>
                  </pre>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-2xl border border-border bg-card/90 p-5">
                  <p className="text-muted-foreground text-sm">Callback</p>
                  <p className="mt-2 font-medium">Signed redirect ready</p>
                  <p className="mt-4 font-mono text-muted-foreground text-xs leading-5">
                    status=confirmed
                    <br />
                    signature=7ba43c...
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-foreground p-5 text-background dark:bg-zinc-100 dark:text-zinc-950">
                  <p className="text-background/70 text-sm dark:text-zinc-600">
                    Direct to merchant
                  </p>
                  <p className="mt-2 font-semibold text-2xl">0% fee</p>
                  <p className="mt-4 text-background/70 text-sm dark:text-zinc-600">
                    Payer sends XMR straight into your flow. iykyk.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-border border-t py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="max-w-xl">
              <Badge variant="muted" className="mb-4">
                Flow
              </Badge>
              <h2 className="text-balance font-semibold text-4xl">
                Four steps. Nothing cute.
              </h2>
              <p className="mt-4 text-muted-foreground leading-7">
                A checkout page, a payment, a confirmation, a callback.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {workflow.map((item, index) => (
                <Card key={item.label} className="rounded-2xl">
                  <CardHeader>
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                        <item.icon className="size-4" />
                      </div>
                      <span className="font-mono text-muted-foreground text-xs">
                        0{index + 1}
                      </span>
                    </div>
                    <CardTitle>{item.label}</CardTitle>
                    <CardDescription className="leading-6">
                      {item.text}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="operations" className="border-border border-t py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.85fr]">
          <div>
            <Badge variant="muted" className="mb-4">
              Confirmations
            </Badge>
            <h2 className="text-balance font-semibold text-4xl">
              Simple rules for bigger payments.
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground leading-7">
              Small payments clear faster. Larger payments wait for more blocks.
            </p>
            <div className="mt-8 grid max-w-xl gap-3">
              {tiers.map(([range, blocks]) => (
                <div
                  key={range}
                  className="flex items-center justify-between rounded-xl border border-border bg-background p-4"
                >
                  <span className="text-muted-foreground text-sm">{range}</span>
                  <Badge variant="outline">{blocks}</Badge>
                </div>
              ))}
            </div>
          </div>
          <aside
            id="pricing"
            className="rounded-3xl border border-border bg-foreground p-6 text-background sm:p-8 dark:bg-zinc-100 dark:text-zinc-950"
          >
            <CircleDollarSign className="size-8 text-background/70 dark:text-zinc-500" />
            <h3 className="mt-8 font-semibold text-5xl">0%</h3>
            <p className="mt-3 text-background/70 leading-7 dark:text-zinc-600">
              Fee for direct-to-merchant Monero payments. Customer pays you.
              cheyn confirms it.
            </p>
            <Button
              asChild
              className="mt-8 w-full bg-background text-foreground hover:bg-background/90 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              <Link href="/sign-up">
                Start accepting XMR <ArrowRight />
              </Link>
            </Button>
          </aside>
        </div>
      </section>

      <section className="border-border border-t py-12">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center">
          <div>
            <p className="font-medium">Start with one checkout.</p>
            <p className="mt-1 text-muted-foreground text-sm">
              Add callbacks when you are ready.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">
                Create account <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="min-w-0 truncate font-mono text-sm">{value}</span>
    </div>
  );
}
