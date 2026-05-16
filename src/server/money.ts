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
  const networkFeeReserve =
    maxReserve > BigInt(0) && configuredReserve > maxReserve
      ? maxReserve
      : configuredReserve;

  return subtractAtomic(
    subtractAtomic(args.amountAtomic, platformFee.toString()),
    networkFeeReserve.toString(),
  );
}

export function atomicToDisplay(amountAtomic: string) {
  const amount = BigInt(amountAtomic);
  const whole = amount / ATOMIC_UNITS_PER_XMR;
  const fractional = amount % ATOMIC_UNITS_PER_XMR;
  const fraction = fractional.toString().padStart(12, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
