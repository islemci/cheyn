import { loadEnvConfig } from "@next/env";
import { z } from "zod";

if (!process.env.NEXT_RUNTIME) {
  loadEnvConfig(process.cwd());
}

const optionalNumber = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return fallback;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Expected a number, got ${value}`);
      }
      return parsed;
    });

const EnvSchema = z.object({
  ADMIN_API_KEY: z.string().optional(),
  API_BASE_URL: z.string().url().default("http://localhost:3000"),
  CHECKOUT_EXPIRY_MINUTES: optionalNumber(60),
  CMC_API_KEY: z.string().optional(),
  CMC_PRICE_CACHE_MAX_AGE_MS: optionalNumber(15 * 60 * 1000),
  CMC_PRICE_REFRESH_INTERVAL_MS: optionalNumber(10 * 60 * 1000),
  CONFIRMATION_TIERS: z.string().optional(),
  CONVEX_ADMIN_KEY: z.string().optional(),
  CONVEX_DEPLOY_KEY: z.string().optional(),
  CONVEX_URL: z.string().url().optional(),
  MONERO_RPC_PASS: z.string().optional(),
  MONERO_RPC_URL: z.string().url().optional(),
  MONERO_RPC_USER: z.string().optional(),
  MONERO_WALLET_MODE: z.enum(["real", "mock"]).default("mock"),
  NEXT_PUBLIC_CONVEX_URL: z.string().url().optional(),
  MAX_TOTAL_FEE_BPS: optionalNumber(500),
  MAX_PAYOUT_ATOMIC: z.string().optional(),
  MIN_CHECKOUT_AMOUNT_ATOMIC: z.string().default("0"),
  PAYMENT_UNDERPAY_TOLERANCE_ATOMIC: z.string().default("1000000"),
  PLATFORM_FEE_BPS: optionalNumber(0),
  PAYOUTS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  PAYOUT_NETWORK_FEE_RESERVE_ATOMIC: z.string().default("20000000"),
  PAYOUT_REQUIRED_CONFIRMATIONS: optionalNumber(10),
  PAYOUT_RETRY_DELAY_MS: optionalNumber(5 * 60 * 1000),
  PAYOUT_MAX_FAILURES: optionalNumber(3),
  WEBHOOK_RETRY_DELAY_MS: optionalNumber(60 * 1000),
  WEBHOOK_MAX_FAILURES: optionalNumber(5),
  REQUIRED_CONFIRMATIONS: optionalNumber(10),
  WORKER_POLL_INTERVAL_MS: optionalNumber(30_000),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cachedConfig: AppConfig | undefined;

export function getConfig() {
  cachedConfig ??= EnvSchema.parse(process.env);
  return cachedConfig;
}

export function requireEnv(name: keyof AppConfig) {
  const value = getConfig()[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value);
}

export function getConvexUrl() {
  const config = getConfig();
  const url = config.CONVEX_URL || config.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required");
  }
  return url.replace(/\/+$/, "");
}
