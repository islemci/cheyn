"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowDownRight,
  Bell,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  KeyRound,
  Landmark,
  Lock,
  Plus,
  RotateCw,
  ShieldCheck,
  Store,
  Wallet,
  Webhook,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

type DashboardStore = {
  id: string;
  cancelCallbackUrl?: string;
  createdAt: number;
  merchantPrimaryAddress?: string;
  name: string;
  paymentMode?: "hosted" | "view_only";
  provisioningError?: string;
  provisioningAttempts?: number;
  provisioningProgress?: number;
  provisioningStep?: string;
  provisioningUpdatedAt?: number;
  nextProvisioningRetryAt?: number;
  restoreHeight?: number;
  settlementType?: "platform_payout" | "direct_to_wallet";
  status: string;
  successCallbackUrl?: string;
  viewOnlyWalletReference?: string;
  webhookUrl?: string;
  withdrawAddress?: string;
};

type DashboardCheckout = {
  id: string;
  amountAtomic: string;
  amountUsdCents?: string;
  confirmations: number;
  createdAt: number;
  expiresAt: number;
  mode?: "hosted" | "view_only";
  pricingCurrency?: string;
  receivedAtomic: string;
  requiredConfirmations?: number;
  settlementType?: "platform_payout" | "direct_to_wallet";
  status: string;
  storeId: string;
  subaddress: string;
  txHash?: string;
  xmrUsdPriceDecimal?: string;
};

type DashboardPayout = {
  id: string;
  amountAtomic: string;
  checkoutId: string;
  createdAt: number;
  failedReason?: string;
  failureCount?: number;
  netPayoutAtomic?: string;
  nextRetryAt?: number;
  sentAt?: number;
  status: string;
  txHash?: string;
};

type DashboardWebhookAttempt = {
  id: string;
  attemptNumber?: number;
  checkoutId?: string;
  createdAt: number;
  deliveredAt?: number;
  event: string;
  lastError?: string;
  nextRetryAt?: number;
  status: string;
  statusCode?: number;
  storeId: string;
  url: string;
};

export type DashboardData = {
  checkouts: DashboardCheckout[];
  developer: {
    createdAt: number;
    email: string;
    id: string;
    name: string;
    status: string;
  };
  payouts: DashboardPayout[];
  stats: {
    checkoutCount: number;
    confirmedVolumeAtomic: string;
    confirmingCount: number;
    pendingPayoutAtomic: string;
    pendingPayoutCount: number;
    webhookSuccessRate: number | null;
  };
  stores: DashboardStore[];
  webhookAttempts: DashboardWebhookAttempt[];
};

type DashboardConfig = {
  confirmationTiers?: string;
  maxPayoutAtomic?: string;
  maxTotalFeeBps: number;
  minCheckoutAmountAtomic: string;
  payoutMaxFailures: number;
  payoutRetryDelayMs: number;
  payoutsEnabled: boolean;
  platformFeeBps: number;
  requiredConfirmations: number;
  webhookMaxFailures: number;
  webhookRetryDelayMs: number;
};

const tabs = [
  {
    href: "/dashboard/overview",
    icon: Store,
    id: "overview",
    label: "Overview",
  },
  { href: "/dashboard/stores", icon: Store, id: "stores", label: "Stores" },
  {
    href: "/dashboard/checkout",
    icon: Wallet,
    id: "checkout",
    label: "Checkouts",
  },
  {
    href: "/dashboard/payouts",
    icon: Landmark,
    id: "payouts",
    label: "Payouts",
  },
  {
    href: "/dashboard/webhooks",
    icon: Webhook,
    id: "webhooks",
    label: "Webhooks",
  },
  {
    href: "/dashboard/api-key",
    icon: KeyRound,
    id: "api-key",
    label: "API key",
  },
  { href: "/dashboard/risk", icon: ShieldCheck, id: "risk", label: "Risk" },
] as const;

export type DashboardTabId = (typeof tabs)[number]["id"];

function StatusBadge({ status }: { status: string }) {
  if (
    ["active", "confirmed", "paid_out", "sent", "settled", "success"].includes(
      status,
    )
  ) {
    return <Badge variant="success">{status}</Badge>;
  }
  if (["failed", "manual_review", "expired"].includes(status)) {
    return <Badge variant="warning">{status}</Badge>;
  }
  return <Badge variant="muted">{status}</Badge>;
}

export function DashboardConsole({
  activeTab,
  config,
  data: initialData,
}: {
  activeTab: DashboardTabId;
  config: DashboardConfig;
  data: DashboardData;
}) {
  const { isAuthenticated } = useConvexAuth();
  const liveData = useQuery(
    api.payments.getDashboardForCurrentUser,
    isAuthenticated ? {} : "skip",
  );
  const data = (liveData ?? initialData) as DashboardData;
  const primaryStore = data.stores[0];
  const stats = useMemo(
    () => [
      {
        detail: `${data.stats.checkoutCount} total`,
        label: "Confirmed volume",
        value: formatAtomic(data.stats.confirmedVolumeAtomic),
      },
      {
        detail: `${data.stats.pendingPayoutCount} payouts`,
        label: "Pending payout",
        value: formatAtomic(data.stats.pendingPayoutAtomic),
      },
      {
        detail: "seen or confirming",
        label: "Confirming",
        value: String(data.stats.confirmingCount),
      },
      {
        detail: "webhook attempts",
        label: "Webhook success",
        value:
          data.stats.webhookSuccessRate === null
            ? "N/A"
            : `${data.stats.webhookSuccessRate}%`,
      },
    ],
    [data.stats],
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-border border-r bg-card lg:block">
        <div className="flex h-16 items-center gap-2 border-border border-b px-5">
          <Image
            src="/c.svg"
            alt=""
            width={27}
            height={32}
            className="theme-logo h-8 w-auto"
          />
          <div>
            <p className="font-semibold">cheyn</p>
            <p className="text-muted-foreground text-xs">
              {data.developer.email}
            </p>
          </div>
        </div>
        <nav className="grid gap-1 p-3 text-sm">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-muted hover:text-foreground",
                activeTab === tab.id && "bg-muted text-foreground",
              )}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="lg:pl-64">
        <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
          <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">Payments</p>
              <p className="text-muted-foreground text-sm">
                {data.developer.name} · {data.developer.status}
              </p>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              <div className="flex rounded-md border border-border p-1 lg:hidden">
                {tabs.map((tab) => (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded px-2 text-muted-foreground text-sm",
                      activeTab === tab.id && "bg-muted text-foreground",
                    )}
                  >
                    <tab.icon className="size-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </Link>
                ))}
              </div>
              <Button size="icon" variant="outline" aria-label="Notifications">
                <Bell />
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Home</Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="px-4 py-6 sm:px-6">
          {activeTab === "overview" && (
            <OverviewTab
              data={data}
              primaryStore={primaryStore}
              stats={stats}
            />
          )}
          {activeTab === "stores" && <StoresTab stores={data.stores} />}
          {activeTab === "checkout" && (
            <CheckoutsTab checkouts={data.checkouts} stores={data.stores} />
          )}
          {activeTab === "payouts" && <PayoutsTab payouts={data.payouts} />}
          {activeTab === "webhooks" && (
            <WebhooksTab attempts={data.webhookAttempts} />
          )}
          {activeTab === "api-key" && <ApiKeyTab />}
          {activeTab === "risk" && <RiskTab config={config} />}
        </div>
      </section>
    </main>
  );
}

function OverviewTab({
  data,
  primaryStore,
  stats,
}: {
  data: DashboardData;
  primaryStore?: DashboardStore;
  stats: Array<{ detail: string; label: string; value: string }>;
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <ArrowDownRight className="size-4 text-emerald-600" />
                {stat.detail}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>System state</CardTitle>
              <CardDescription>
                Database-connected summary for this developer.
              </CardDescription>
            </div>
            <Badge variant="success">connected</Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Stores", data.stores.length],
                ["Checkouts", data.checkouts.length],
                ["Payouts", data.payouts.length],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span className="text-sm">
                    {label}: {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Store</CardTitle>
            <CardDescription>Primary store configuration.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {primaryStore ? (
              <>
                <InfoRow label="Name" value={primaryStore.name} />
                <InfoRow
                  label="Mode"
                  value={formatPaymentMode(primaryStore.paymentMode)}
                />
                <InfoRow
                  label={
                    primaryStore.paymentMode === "view_only"
                      ? "Merchant wallet"
                      : "Withdraw"
                  }
                  value={truncateMiddle(
                    primaryStore.paymentMode === "view_only"
                      ? primaryStore.merchantPrimaryAddress
                      : primaryStore.withdrawAddress,
                  )}
                />
                <InfoRow
                  label="Webhook"
                  value={primaryStore.webhookUrl ?? "Not configured"}
                />
                <InfoRow
                  label="Success callback"
                  value={primaryStore.successCallbackUrl ?? "Not configured"}
                />
              </>
            ) : (
              <EmptyState text="No store has been created for this developer yet." />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function CheckoutsTab({
  checkouts,
  stores,
}: {
  checkouts: DashboardCheckout[];
  stores: DashboardStore[];
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [currency, setCurrency] = useState<"USD" | "XMR">("USD");
  const [amount, setAmount] = useState("");
  const [metadata, setMetadata] = useState("");
  const [createdCheckout, setCreatedCheckout] = useState<{
    address: string;
    amountAtomic: string;
    checkoutId: string;
    checkoutUrl: string;
    mode?: string;
    settlementType?: string;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function createCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setStatus(null);
    setCreatedCheckout(null);

    try {
      const parsedMetadata = metadata.trim()
        ? (JSON.parse(metadata) as Record<string, unknown>)
        : undefined;
      const response = await fetch("/api/v1/me/checkouts", {
        body: JSON.stringify({
          amount: currency === "USD" ? amount : undefined,
          amountAtomic: currency === "XMR" ? amount : undefined,
          currency: currency === "USD" ? "USD" : undefined,
          metadata: parsedMetadata,
          storeId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        address?: string;
        amountAtomic?: string;
        checkoutId?: string;
        checkoutUrl?: string;
        error?: string;
        mode?: string;
        settlementType?: string;
      };

      if (!response.ok || !body.checkoutId || !body.checkoutUrl) {
        throw new Error(body.error ?? "Failed to create checkout");
      }

      setAmount("");
      setMetadata("");
      setCreatedCheckout({
        address: body.address ?? "",
        amountAtomic: body.amountAtomic ?? "",
        checkoutId: body.checkoutId,
        checkoutUrl: body.checkoutUrl,
        mode: body.mode,
        settlementType: body.settlementType,
      });
      setStatus("Checkout link created.");
    } catch (error) {
      setStatus(
        error instanceof SyntaxError
          ? "Metadata must be valid JSON"
          : error instanceof Error
            ? error.message
            : "Checkout creation failed",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Create checkout link</CardTitle>
          <CardDescription>
            Manually create a payment link from the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stores.length === 0 ? (
            <EmptyState text="Create a store before creating checkout links." />
          ) : (
            <form
              onSubmit={createCheckout}
              className="grid gap-3 lg:grid-cols-[1fr_0.6fr_0.8fr_auto]"
            >
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Store</span>
                <select
                  required
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} · {formatPaymentMode(store.paymentMode)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Currency</span>
                <select
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value as "USD" | "XMR")
                  }
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="USD">USD</option>
                  <option value="XMR">XMR atomic</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">
                  {currency === "USD" ? "USD amount" : "Atomic amount"}
                </span>
                <input
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={currency === "USD" ? "10.00" : "10000000000"}
                />
              </label>
              <div className="flex items-end">
                <Button disabled={isCreating} type="submit">
                  <Plus />
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </div>
              <label className="grid gap-1 text-sm lg:col-span-4">
                <span className="font-medium">Metadata JSON</span>
                <textarea
                  value={metadata}
                  onChange={(event) => setMetadata(event.target.value)}
                  className="min-h-20 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder='{"userId":"user_123","plan":"pro"}'
                />
              </label>
            </form>
          )}

          {status && (
            <p className="mt-3 rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
              {status}
            </p>
          )}
          {createdCheckout && (
            <div className="mt-3 grid gap-3 rounded-md border border-border p-3 text-sm md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="font-medium">Checkout link</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {formatPaymentMode(createdCheckout.mode)} ·{" "}
                  {formatSettlementType(createdCheckout.settlementType)}
                </p>
                <p className="mt-1 truncate font-mono text-muted-foreground">
                  {createdCheckout.checkoutUrl}
                </p>
                <p className="mt-2 font-medium">Payment address</p>
                <p className="mt-1 truncate font-mono text-muted-foreground">
                  {createdCheckout.address}
                </p>
              </div>
              <div className="flex flex-wrap items-start gap-2 md:justify-end">
                <Button
                  onClick={() => copyText(createdCheckout.checkoutUrl)}
                  size="sm"
                  variant="outline"
                >
                  <Copy />
                  Copy link
                </Button>
                <Button
                  onClick={() => copyText(createdCheckout.address)}
                  size="sm"
                  variant="outline"
                >
                  <Copy />
                  Copy address
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checkouts</CardTitle>
          <CardDescription>
            Payment requests created through the checkout API and dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {checkouts.length === 0 ? (
            <EmptyState text="No checkouts yet. Create one above or through POST /api/v1/checkouts." />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Checkout</th>
                    <th className="p-3 font-medium">Mode</th>
                    <th className="p-3 font-medium">Expected</th>
                    <th className="p-3 font-medium">Received</th>
                    <th className="p-3 font-medium">Blocks</th>
                    <th className="p-3 font-medium">Address</th>
                    <th className="p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {checkouts.map((checkout) => (
                    <tr key={checkout.id} className="border-border border-t">
                      <td className="p-3 font-mono">{checkout.id}</td>
                      <td className="p-3">
                        <div className="grid gap-1">
                          <Badge variant="muted">
                            {formatPaymentMode(checkout.mode)}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {formatSettlementType(checkout.settlementType)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        {formatCheckoutExpected(checkout)}
                      </td>
                      <td className="p-3">
                        {formatAtomic(checkout.receivedAtomic)}
                      </td>
                      <td className="p-3">
                        {checkout.confirmations} /{" "}
                        {checkout.requiredConfirmations ?? "?"}
                      </td>
                      <td className="max-w-44 truncate p-3 font-mono">
                        {checkout.subaddress}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={checkout.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function StoresTab({ stores }: { stores: DashboardStore[] }) {
  const [name, setName] = useState("");
  const [paymentMode, setPaymentMode] = useState<"hosted" | "view_only">(
    "hosted",
  );
  const [successCallbackUrl, setSuccessCallbackUrl] = useState("");
  const [cancelCallbackUrl, setCancelCallbackUrl] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [merchantPrimaryAddress, setMerchantPrimaryAddress] = useState("");
  const [privateViewKey, setPrivateViewKey] = useState("");
  const [restoreHeight, setRestoreHeight] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setStatus(null);
    setWebhookSecret(null);

    try {
      const response = await fetch("/api/v1/me/stores", {
        body: JSON.stringify({
          name,
          cancelCallbackUrl: cancelCallbackUrl || undefined,
          merchantPrimaryAddress:
            paymentMode === "view_only" ? merchantPrimaryAddress : undefined,
          paymentMode,
          privateViewKey:
            paymentMode === "view_only" ? privateViewKey : undefined,
          restoreHeight:
            paymentMode === "view_only" ? Number(restoreHeight) : undefined,
          successCallbackUrl: successCallbackUrl || undefined,
          webhookUrl: webhookUrl || undefined,
          withdrawAddress:
            paymentMode === "hosted" ? withdrawAddress : undefined,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        storeId?: string;
        webhookSecret?: string;
      };

      if (!response.ok || !body.storeId) {
        throw new Error(body.error ?? "Failed to create store");
      }

      setName("");
      setPaymentMode("hosted");
      setSuccessCallbackUrl("");
      setCancelCallbackUrl("");
      setWithdrawAddress("");
      setMerchantPrimaryAddress("");
      setPrivateViewKey("");
      setRestoreHeight("");
      setWebhookUrl("");
      setWebhookSecret(body.webhookSecret ?? null);
      setStatus(`Store created: ${body.storeId}`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Store creation failed",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create store</CardTitle>
          <CardDescription>
            Choose managed payouts or direct-to-wallet verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createStore} className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Payment mode</span>
              <select
                value={paymentMode}
                onChange={(event) =>
                  setPaymentMode(event.target.value as "hosted" | "view_only")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="hosted">Hosted · platform payout</option>
                <option value="view_only">View-only · direct to wallet</option>
              </select>
            </label>
            {paymentMode === "hosted" ? (
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Withdrawal address</span>
                <input
                  required
                  value={withdrawAddress}
                  onChange={(event) => setWithdrawAddress(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="8..."
                />
              </label>
            ) : (
              <div className="grid gap-3 rounded-md border border-border p-3">
                <p className="text-muted-foreground text-sm">
                  Customers pay your wallet directly. We use the private view
                  key only to verify incoming payments and cannot spend funds.
                </p>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Merchant primary address</span>
                  <input
                    required
                    value={merchantPrimaryAddress}
                    onChange={(event) =>
                      setMerchantPrimaryAddress(event.target.value)
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="8..."
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Private view key</span>
                  <input
                    required
                    value={privateViewKey}
                    onChange={(event) => setPrivateViewKey(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Private view key"
                    type="password"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Restore height</span>
                  <input
                    required
                    value={restoreHeight}
                    onChange={(event) => setRestoreHeight(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    min={0}
                    placeholder="3000000"
                    type="number"
                  />
                </label>
              </div>
            )}
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Store name</span>
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="My SaaS"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Webhook URL</span>
              <input
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="https://example.com/webhook"
                type="url"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Success callback URL</span>
              <input
                value={successCallbackUrl}
                onChange={(event) => setSuccessCallbackUrl(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="https://example.com/payment/success"
                type="url"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Cancel callback URL</span>
              <input
                value={cancelCallbackUrl}
                onChange={(event) => setCancelCallbackUrl(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="https://example.com/payment/cancel"
                type="url"
              />
            </label>
            <Button disabled={isCreating} type="submit">
              <Plus />
              {isCreating ? "Creating..." : "Create store"}
            </Button>
          </form>
          {status && (
            <p className="mt-3 rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
              {status}
            </p>
          )}
          {webhookSecret && (
            <div className="mt-3 rounded-md border border-border p-3">
              <p className="font-medium text-sm">Webhook secret</p>
              <p className="mt-1 text-muted-foreground text-sm">
                Store this now. It will not be shown again.
              </p>
              <code className="mt-2 block overflow-x-auto rounded bg-muted p-2 text-sm">
                {webhookSecret}
              </code>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stores</CardTitle>
          <CardDescription>
            Active stores connected to your developer account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {stores.length === 0 ? (
            <EmptyState text="No stores yet. Create one to start accepting checkouts." />
          ) : (
            stores.map((store) => <StoreEditor key={store.id} store={store} />)
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function StoreEditor({ store }: { store: DashboardStore }) {
  const [name, setName] = useState(store.name);
  const [withdrawAddress, setWithdrawAddress] = useState(
    store.withdrawAddress ?? "",
  );
  const [webhookUrl, setWebhookUrl] = useState(store.webhookUrl ?? "");
  const [successCallbackUrl, setSuccessCallbackUrl] = useState(
    store.successCallbackUrl ?? "",
  );
  const [cancelCallbackUrl, setCancelCallbackUrl] = useState(
    store.cancelCallbackUrl ?? "",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetryingProvisioning, setIsRetryingProvisioning] = useState(false);

  async function updateStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/v1/me/stores/${store.id}`, {
        body: JSON.stringify({
          cancelCallbackUrl: cancelCallbackUrl || null,
          name,
          successCallbackUrl: successCallbackUrl || null,
          webhookUrl: webhookUrl || null,
          withdrawAddress:
            (store.paymentMode ?? "hosted") === "hosted"
              ? withdrawAddress
              : undefined,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to update store");
      }
      setStatus("Store updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Store update failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function retryProvisioning() {
    setIsRetryingProvisioning(true);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/v1/me/stores/${store.id}/provisioning/retry`,
        { method: "POST" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to retry provisioning");
      }
      setStatus("Provisioning retry queued.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Provisioning retry failed",
      );
    } finally {
      setIsRetryingProvisioning(false);
    }
  }

  return (
    <form
      onSubmit={updateStore}
      className="grid gap-3 rounded-md border border-border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{store.name}</p>
          <p className="mt-1 font-mono text-muted-foreground text-xs">
            {store.id}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant="muted">{formatPaymentMode(store.paymentMode)}</Badge>
          <StatusBadge status={store.status} />
        </div>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Store name</span>
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {(store.paymentMode ?? "hosted") === "hosted" ? (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Withdrawal address</span>
          <input
            required
            value={withdrawAddress}
            onChange={(event) => setWithdrawAddress(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      ) : (
        <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <ProvisioningProgress store={store} />
          {store.status === "failed" && (
            <Button
              disabled={isRetryingProvisioning}
              onClick={retryProvisioning}
              size="sm"
              type="button"
              variant="outline"
            >
              <RotateCw />
              {isRetryingProvisioning ? "Retrying..." : "Retry provisioning"}
            </Button>
          )}
          <InfoRow
            label="Merchant wallet"
            value={truncateMiddle(store.merchantPrimaryAddress)}
          />
          <InfoRow
            label="Restore height"
            value={
              store.restoreHeight === undefined
                ? "Not configured"
                : String(store.restoreHeight)
            }
          />
          <InfoRow
            label="Wallet reference"
            value={store.viewOnlyWalletReference ?? "Provisioning"}
          />
        </div>
      )}
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Webhook URL</span>
        <input
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="url"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Success callback URL</span>
        <input
          value={successCallbackUrl}
          onChange={(event) => setSuccessCallbackUrl(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="url"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Cancel callback URL</span>
        <input
          value={cancelCallbackUrl}
          onChange={(event) => setCancelCallbackUrl(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="url"
        />
      </label>
      {status && (
        <p className="rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
          {status}
        </p>
      )}
      <Button disabled={isSaving} type="submit" variant="outline">
        {isSaving ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

function ProvisioningProgress({ store }: { store: DashboardStore }) {
  if ((store.paymentMode ?? "hosted") !== "view_only") {
    return null;
  }

  const progress =
    store.status === "active"
      ? 100
      : Math.max(0, Math.min(100, store.provisioningProgress ?? 0));
  const step = formatProvisioningStep(store.provisioningStep, store.status);

  return (
    <div className="grid gap-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Provisioning</span>
        <span className="font-mono text-muted-foreground text-xs">
          {progress}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">{step}</p>
      <p className="text-muted-foreground text-xs">
        Attempt {store.provisioningAttempts ?? 0} / 3
        {store.nextProvisioningRetryAt && store.status === "failed"
          ? ` · auto retry ${formatDate(store.nextProvisioningRetryAt)}`
          : ""}
      </p>
      {store.provisioningError && (
        <p className="text-destructive text-xs">{store.provisioningError}</p>
      )}
    </div>
  );
}

function PayoutsTab({ payouts }: { payouts: DashboardPayout[] }) {
  const [status, setStatus] = useState<string | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);

  async function collectPayouts() {
    setIsCollecting(true);
    setStatus(null);

    try {
      const response = await fetch("/api/v1/me/payouts/collect", {
        method: "POST",
      });
      const body = (await response.json()) as {
        eligibleCount?: number;
        error?: string;
        existingPayoutCount?: number;
        payoutCount?: number;
        queuedCount?: number;
        skipped?: Array<{ checkoutId: string; reason: string }>;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Failed to collect payouts");
      }

      setStatus(
        `Checked eligible checkouts. Queued ${body.queuedCount ?? 0} payout${
          body.queuedCount === 1 ? "" : "s"
        } from ${body.eligibleCount ?? 0} eligible checkout${
          body.eligibleCount === 1 ? "" : "s"
        }. Existing payouts found: ${body.existingPayoutCount ?? 0}.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to collect payouts",
      );
    } finally {
      setIsCollecting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Payouts</CardTitle>
          <CardDescription>
            Queued, sent, failed, and review payouts.
          </CardDescription>
        </div>
        <Button disabled={isCollecting} onClick={collectPayouts}>
          <RotateCw className={isCollecting ? "animate-spin" : undefined} />
          {isCollecting ? "Collecting..." : "Collect"}
        </Button>
      </CardHeader>
      <CardContent>
        {status && (
          <p className="mb-3 rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
            {status}
          </p>
        )}
        {payouts.length === 0 ? (
          <EmptyState text="No payouts yet. Payouts are created after a checkout is confirmed." />
        ) : (
          <div className="grid gap-3">
            {payouts.map((payout) => (
              <div
                key={payout.id}
                className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-mono text-sm">{payout.id}</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Checkout {payout.checkoutId}
                  </p>
                  {payout.failedReason && (
                    <p className="mt-2 text-amber-700 text-sm dark:text-amber-300">
                      {payout.failedReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <span className="font-medium">
                    {formatAtomic(
                      payout.netPayoutAtomic ?? payout.amountAtomic,
                    )}
                  </span>
                  <StatusBadge status={payout.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WebhooksTab({ attempts }: { attempts: DashboardWebhookAttempt[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks</CardTitle>
        <CardDescription>
          Signed delivery attempts and retry state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {attempts.length === 0 ? (
          <EmptyState text="No webhook attempts yet. Use the webhook test route or confirm a payment." />
        ) : (
          <div className="grid gap-3">
            {attempts.map((attempt) => (
              <div
                key={attempt.id}
                className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-medium">{attempt.event}</p>
                  <p className="mt-1 truncate text-muted-foreground text-sm">
                    {attempt.url}
                  </p>
                  {attempt.lastError && (
                    <p className="mt-2 text-amber-700 text-sm dark:text-amber-300">
                      {attempt.lastError}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <span className="text-muted-foreground text-sm">
                    #{attempt.attemptNumber ?? 1}
                  </span>
                  <StatusBadge status={attempt.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApiKeyTab() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  async function rotateApiKey() {
    setIsRotating(true);
    setStatus(null);
    try {
      const response = await fetch("/api/v1/me/api-key/rotate", {
        method: "POST",
      });
      const body = (await response.json()) as {
        apiKey?: string;
        error?: string;
      };

      if (!response.ok || !body.apiKey) {
        throw new Error(body.error ?? "Failed to rotate API key");
      }

      setApiKey(body.apiKey);
      await copyText(body.apiKey);
      setStatus("New API key created and copied. Store it now.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Failed to rotate key",
      );
    } finally {
      setIsRotating(false);
    }
  }

  async function copyApiKey() {
    if (!apiKey) {
      setStatus("Rotate your key first. Existing raw keys cannot be shown.");
      return;
    }
    try {
      await copyText(apiKey);
      setStatus("API key copied.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Copy failed");
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>API key</CardTitle>
          <CardDescription>
            API keys are only shown once when created or rotated.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <Lock className="size-4 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-sm">
              {apiKey ?? "xmr_live_••••••••••••••••"}
            </code>
            <Button
              disabled={!apiKey}
              onClick={copyApiKey}
              size="icon"
              variant="ghost"
              aria-label="Copy API key"
            >
              <Copy />
            </Button>
          </div>
          {status && (
            <p className="rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
              {status}
            </p>
          )}
          <Button
            disabled={isRotating}
            onClick={rotateApiKey}
            variant="outline"
          >
            <RotateCw className={isRotating ? "animate-spin" : undefined} />
            {isRotating ? "Rotating..." : "Rotate key"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server integration</CardTitle>
          <CardDescription>
            Checkout creation stays server-side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
            <code>{`await fetch("/api/v1/checkouts", {
  method: "POST",
  headers: { Authorization: "Bearer xmr_live_..." },
  body: JSON.stringify({
    storeId,
    amountAtomic: "10000000000"
  })
});`}</code>
          </pre>
        </CardContent>
      </Card>
    </section>
  );
}

async function copyText(value: string) {
  if (!navigator.clipboard) {
    throw new Error("Clipboard is unavailable in this browser");
  }
  await navigator.clipboard.writeText(value);
}

function RiskTab({ config }: { config: DashboardConfig }) {
  const rows = [
    ["Minimum checkout", formatAtomic(config.minCheckoutAmountAtomic)],
    ["Platform fee", `${config.platformFeeBps / 100}%`],
    ["Max total fee", `${config.maxTotalFeeBps / 100}%`],
    ["Payout retries", String(config.payoutMaxFailures)],
    ["Webhook retries", String(config.webhookMaxFailures)],
    ["Fallback confirmations", String(config.requiredConfirmations)],
  ];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Confirmation policy</CardTitle>
            <CardDescription>
              Configured through environment tiers.
            </CardDescription>
          </div>
          <Badge variant="outline">env managed</Badge>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
            <code>
              {config.confirmationTiers ??
                `${config.requiredConfirmations} confirmations for all checkouts`}
            </code>
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operational limits</CardTitle>
          <CardDescription>Current backend safety settings.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-md border border-border p-4">
              <ShieldCheck className="mb-3 size-4 text-muted-foreground" />
              <p className="font-medium text-sm">{label}</p>
              <p className="mt-1 text-muted-foreground text-sm">{value}</p>
            </div>
          ))}
          <div className="rounded-md border border-border p-4">
            <AlertTriangle className="mb-3 size-4 text-muted-foreground" />
            <p className="font-medium text-sm">Max payout</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {config.maxPayoutAtomic
                ? formatAtomic(config.maxPayoutAtomic)
                : "manual policy unset"}
            </p>
          </div>
          <div className="rounded-md border border-border p-4">
            <Clock3 className="mb-3 size-4 text-muted-foreground" />
            <p className="font-medium text-sm">Payout retry delay</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {Math.round(config.payoutRetryDelayMs / 1000)} seconds
            </p>
          </div>
          <div className="rounded-md border border-border p-4">
            <Database className="mb-3 size-4 text-muted-foreground" />
            <p className="font-medium text-sm">Payouts enabled</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {config.payoutsEnabled ? "true" : "false"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-muted-foreground text-sm">
      {text}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function formatPaymentMode(mode?: string) {
  return mode === "view_only" ? "View-only" : "Hosted";
}

function formatSettlementType(settlementType?: string) {
  return settlementType === "direct_to_wallet"
    ? "Direct to wallet"
    : "Platform payout";
}

function formatProvisioningStep(step?: string, status?: string) {
  if (status === "active") {
    return "Ready";
  }
  if (status === "failed") {
    return "Provisioning failed";
  }
  switch (step) {
    case "queued":
      return "Queued for worker";
    case "validating_store":
      return "Validating wallet setup";
    case "decrypting_view_key":
      return "Decrypting view key on worker";
    case "creating_view_only_wallet":
      return "Creating view-only wallet";
    case "saving_wallet_reference":
      return "Saving wallet reference";
    case "ready":
      return "Ready";
    default:
      return "Waiting for worker";
  }
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

function formatCheckoutExpected(checkout: DashboardCheckout) {
  if (checkout.pricingCurrency === "USD" && checkout.amountUsdCents) {
    const rate = checkout.xmrUsdPriceDecimal
      ? ` · $${checkout.xmrUsdPriceDecimal}/XMR`
      : "";
    return `${formatUsdCents(checkout.amountUsdCents)}${rate}`;
  }
  return formatAtomic(checkout.amountAtomic);
}

function formatUsdCents(amountUsdCents: string) {
  const cents = BigInt(amountUsdCents);
  const dollars = cents / BigInt(100);
  const remainder = (cents % BigInt(100)).toString().padStart(2, "0");
  return `$${dollars.toString()}.${remainder}`;
}

function truncateMiddle(value?: string) {
  if (!value) {
    return "Not configured";
  }
  if (value.length <= 22) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}
