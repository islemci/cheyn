import { getConfig } from "./config";
import { calculatePayoutAmount } from "./money";

export function calculateConfiguredPayoutBreakdown(amountAtomic: string) {
  const config = getConfig();
  return calculatePayoutAmount({
    amountAtomic,
    maxTotalFeeBps: config.MAX_TOTAL_FEE_BPS,
    networkFeeReserveAtomic: config.PAYOUT_NETWORK_FEE_RESERVE_ATOMIC,
    platformFeeBps: config.PLATFORM_FEE_BPS,
  });
}
