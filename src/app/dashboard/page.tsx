import { DashboardConsole } from "@/components/dashboard/dashboard-console";
import { Button } from "@/components/ui/button";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";

export default async function DashboardPage() {
  try {
    await fetchAuthMutation(convex.refs.getOrClaimDeveloperForCurrentUser, {});
    const data = await fetchAuthQuery(
      convex.refs.getDashboardForCurrentUser,
      {},
    );
    const config = getConfig();

    return (
      <DashboardConsole
        config={{
          confirmationTiers: config.CONFIRMATION_TIERS,
          maxPayoutAtomic: config.MAX_PAYOUT_ATOMIC,
          maxTotalFeeBps: config.MAX_TOTAL_FEE_BPS,
          minCheckoutAmountAtomic: config.MIN_CHECKOUT_AMOUNT_ATOMIC,
          payoutMaxFailures: config.PAYOUT_MAX_FAILURES,
          payoutRetryDelayMs: config.PAYOUT_RETRY_DELAY_MS,
          payoutsEnabled: config.PAYOUTS_ENABLED,
          platformFeeBps: config.PLATFORM_FEE_BPS,
          requiredConfirmations: config.REQUIRED_CONFIRMATIONS,
          webhookMaxFailures: config.WEBHOOK_MAX_FAILURES,
          webhookRetryDelayMs: config.WEBHOOK_RETRY_DELAY_MS,
        }}
        data={data}
      />
    );
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
          <p className="font-semibold text-xl">Sign in required</p>
          <p className="mt-2 text-muted-foreground text-sm">
            The dashboard reads your developer record from Convex through Better
            Auth. Sign in first, then reload this page.
          </p>
          <div className="mt-5 flex gap-3">
            <Button asChild>
              <a href="/sign-in">Sign in</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/sign-up">Create account</a>
            </Button>
          </div>
        </div>
      </main>
    );
  }
}
