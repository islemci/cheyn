const ATOMIC_UNITS_PER_XMR = BigInt("1000000000000");

export function assertAtomicAmount(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("amountAtomic must be a positive integer string");
  }
  return value;
}

export function addAtomicAmounts(values: string[]) {
  return values
    .reduce((sum, value) => sum + BigInt(value), BigInt(0))
    .toString();
}

export function isAtLeastAtomic(value: string, minimum: string) {
  return BigInt(value) >= BigInt(minimum);
}

export function isAtLeastAtomicWithTolerance(args: {
  minimum: string;
  toleranceAtomic: string;
  value: string;
}) {
  const value = BigInt(args.value);
  const minimum = BigInt(args.minimum);
  const tolerance = BigInt(args.toleranceAtomic);
  return value >= minimum || minimum - value <= tolerance;
}

export function subtractFee(amountAtomic: string, feeBps: number) {
  const amount = BigInt(amountAtomic);
  const fee = (amount * BigInt(feeBps)) / BigInt(10_000);
  return (amount - fee).toString();
}

function subtractAtomic(amountAtomic: string, subtractAtomic: string) {
  const amount = BigInt(amountAtomic);
  const subtract = BigInt(subtractAtomic);
  const result = amount - subtract;
  if (result <= BigInt(0)) {
    throw new Error("Payout amount is too small after fee reserve");
  }
  return result.toString();
}

export function calculatePayoutAmount(args: {
  amountAtomic: string;
  maxTotalFeeBps: number;
  networkFeeReserveAtomic: string;
  platformFeeBps: number;
}) {
  const amount = BigInt(args.amountAtomic);
  const platformFee = (amount * BigInt(args.platformFeeBps)) / BigInt(10_000);
  const maxTotalFee = (amount * BigInt(args.maxTotalFeeBps)) / BigInt(10_000);
  const maxReserve = maxTotalFee - platformFee;
  const configuredReserve = BigInt(args.networkFeeReserveAtomic);
  const cappedReserve = maxReserve > BigInt(0) ? maxReserve : BigInt(0);
  const networkFeeReserve =
    configuredReserve > cappedReserve ? cappedReserve : configuredReserve;
  const netPayoutAtomic = subtractAtomic(
    subtractAtomic(args.amountAtomic, platformFee.toString()),
    networkFeeReserve.toString(),
  );

  return {
    grossAmountAtomic: args.amountAtomic,
    maxTotalFeeBps: args.maxTotalFeeBps,
    netPayoutAtomic,
    networkReserveAtomic: networkFeeReserve.toString(),
    platformFeeAtomic: platformFee.toString(),
    platformFeeBps: args.platformFeeBps,
  };
}

export function calculateLegacyPayoutAmount(args: {
  amountAtomic: string;
  maxTotalFeeBps: number;
  networkFeeReserveAtomic: string;
  platformFeeBps: number;
}) {
  return calculatePayoutAmount(args).netPayoutAtomic;
}

export function atomicToDisplay(amountAtomic: string) {
  const amount = BigInt(amountAtomic);
  const whole = amount / ATOMIC_UNITS_PER_XMR;
  const fractional = amount % ATOMIC_UNITS_PER_XMR;
  const fraction = fractional.toString().padStart(12, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function usdCentsToAtomic(args: {
  amountUsdCents: string;
  xmrUsdPriceMicro: string;
}) {
  if (!/^[1-9]\d*$/.test(args.amountUsdCents)) {
    throw new Error("amountUsdCents must be a positive integer string");
  }
  if (!/^[1-9]\d*$/.test(args.xmrUsdPriceMicro)) {
    throw new Error("xmrUsdPriceMicro must be a positive integer string");
  }

  const usdMicro = BigInt(args.amountUsdCents) * BigInt(10_000);
  const priceMicro = BigInt(args.xmrUsdPriceMicro);
  const numerator = usdMicro * ATOMIC_UNITS_PER_XMR;

  return ((numerator + priceMicro - BigInt(1)) / priceMicro).toString();
}

export function usdDisplayToCents(amount: string) {
  if (!/^[1-9]\d*(\.\d{1,2})?$/.test(amount)) {
    throw new Error(
      "USD amount must be a positive decimal string with up to 2 decimals",
    );
  }

  const [dollars, cents = ""] = amount.split(".");
  return (
    BigInt(dollars) * BigInt(100) +
    BigInt(cents.padEnd(2, "0"))
  ).toString();
}
