import { notFound } from "next/navigation";

import { DashboardView } from "../dashboard-view";

const tabs = [
  "overview",
  "stores",
  "checkout",
  "payouts",
  "webhooks",
  "api-key",
  "risk",
] as const;

type DashboardTab = (typeof tabs)[number];

function isDashboardTab(value: string): value is DashboardTab {
  return tabs.includes(value as DashboardTab);
}

export default async function DashboardTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  if (!isDashboardTab(tab)) {
    notFound();
  }

  return <DashboardView activeTab={tab} />;
}
