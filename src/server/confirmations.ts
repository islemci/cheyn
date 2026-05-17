import type { AppConfig } from "./config";

type ConfirmationTier = {
  maxAmountAtomic?: bigint;
  confirmations: number;
};

function parseTier(part: string): ConfirmationTier {
  const [rawMaxAmount, rawConfirmations] = part.split(":");
  if (!rawMaxAmount || !rawConfirmations) {
    throw new Error(
      `Invalid CONFIRMATION_TIERS entry "${part}". Expected maxAtomic:confirmations or *:confirmations`,
    );
  }

  const confirmations = Number(rawConfirmations);
  if (!Number.isInteger(confirmations) || confirmations < 1) {
    throw new Error(
      `Invalid confirmation count "${rawConfirmations}" in CONFIRMATION_TIERS`,
    );
  }

  if (rawMaxAmount === "*") {
    return { confirmations };
  }

  if (!/^[1-9]\d*$/.test(rawMaxAmount)) {
    throw new Error(
      `Invalid max atomic amount "${rawMaxAmount}" in CONFIRMATION_TIERS`,
    );
  }

  return {
    confirmations,
    maxAmountAtomic: BigInt(rawMaxAmount),
  };
}

export function getRequiredConfirmationsForAmount(
  amountAtomic: string,
  config: Pick<AppConfig, "CONFIRMATION_TIERS" | "REQUIRED_CONFIRMATIONS">,
) {
  if (!config.CONFIRMATION_TIERS) {
    return config.REQUIRED_CONFIRMATIONS;
  }

  const amount = BigInt(amountAtomic);
  const tiers = config.CONFIRMATION_TIERS.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseTier);

  for (const tier of tiers) {
    if (!tier.maxAmountAtomic || amount <= tier.maxAmountAtomic) {
      return tier.confirmations;
    }
  }

  return config.REQUIRED_CONFIRMATIONS;
}
