import { randomBytes } from "node:crypto";
import DigestFetch from "digest-fetch";
import nodeFetch from "node-fetch";

import { getConfig } from "./config";
import type { WalletClient, WalletTransfer } from "./types";

type JsonRpcResponse<T> = {
  result?: T;
  error?: { code: number; message: string };
};

async function fetchWithDigest(url: string, body: string) {
  const config = getConfig();
  if (!config.MONERO_RPC_USER || !config.MONERO_RPC_PASS) {
    throw new Error("MONERO_RPC_USER and MONERO_RPC_PASS are required");
  }
  const username = config.MONERO_RPC_USER.trim();
  const password = config.MONERO_RPC_PASS.trim();

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.MONERO_RPC_TIMEOUT_MS,
  );
  const client = new DigestFetch(username, password);
  client.getClient = async () => nodeFetch;

  try {
    return await client.fetch(url, {
      body,
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function rpc<T>(
  method: string,
  params: Record<string, unknown> = {},
  options: { retries?: number } = {},
) {
  const config = getConfig();
  if (!config.MONERO_RPC_URL) {
    throw new Error("MONERO_RPC_URL is required");
  }

  const body = JSON.stringify({
    id: "0",
    jsonrpc: "2.0",
    method,
    params,
  });

  const attempts = (options.retries ?? 0) + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await rpcAttempt<T>(method, config.MONERO_RPC_URL, body);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableRpcError(error)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  throw lastError;
}

async function rpcAttempt<T>(method: string, url: string, body: string) {
  const response = await fetchWithDigest(url, body);
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new Error(`Wallet RPC ${method} response body read failed`, {
      cause: error,
    });
  }
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (response.status === 401) {
      throw new Error(
        `Wallet RPC ${method} authentication failed for ${url} as user "${getConfig().MONERO_RPC_USER?.trim() ?? ""}". Check MONERO_RPC_USER and MONERO_RPC_PASS.`,
      );
    }
    throw new Error(
      `Wallet RPC ${method} returned ${response.status} ${contentType}: ${text.slice(
        0,
        200,
      )}`,
    );
  }

  const data = JSON.parse(text) as JsonRpcResponse<T>;

  if (!response.ok || data.error) {
    if (
      method === "generate_from_keys" &&
      data.error?.message.toLowerCase().includes("no wallet dir configured")
    ) {
      throw new Error(
        "Wallet RPC generate_from_keys failed because monero-wallet-rpc was started without --wallet-dir. Configure --wallet-dir on the wallet RPC host and set WALLET_BASE_DIR to that directory.",
      );
    }
    throw new Error(
      data.error?.message ?? `Wallet RPC failed: ${response.status}`,
    );
  }

  if (!data.result) {
    throw new Error(`Wallet RPC ${method} returned no result`);
  }

  return data.result;
}

function isRetryableRpcError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("body read failed") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network timeout") ||
    message.includes("request-timeout")
  );
}

function normalizeAmount(value: unknown) {
  if (typeof value === "number") {
    return Math.trunc(value).toString();
  }
  if (typeof value === "string") {
    return value;
  }
  return "0";
}

export function createRealWalletClient(): WalletClient {
  return {
    async getBalance() {
      const result = await rpc<{ balance: number; unlocked_balance: number }>(
        "get_balance",
        {},
        { retries: getConfig().MONERO_RPC_RETRIES },
      );
      return {
        balanceAtomic: normalizeAmount(result.balance),
        unlockedBalanceAtomic: normalizeAmount(result.unlocked_balance),
      };
    },
    async getAddress() {
      const result = await rpc<{ address: string }>(
        "get_address",
        {},
        { retries: getConfig().MONERO_RPC_RETRIES },
      );
      return { address: result.address };
    },
    async createSubaddress() {
      const result = await rpc<{
        address: string;
        address_index: number;
      }>("create_address", { account_index: 0 });

      return {
        address: result.address,
        majorIndex: 0,
        minorIndex: result.address_index,
      };
    },
    async getTransfers() {
      const result = await rpc<{
        in?: Array<Record<string, unknown>>;
        pool?: Array<Record<string, unknown>>;
      }>(
        "get_transfers",
        { in: true, pool: true },
        { retries: getConfig().MONERO_RPC_RETRIES },
      );

      const transfers = [...(result.in ?? []), ...(result.pool ?? [])];
      return transfers.flatMap((transfer) => {
        const index = transfer.subaddr_index as
          | { major?: number; minor?: number }
          | undefined;
        const txHash = String(transfer.txid ?? transfer.tx_hash ?? "");
        const address =
          typeof transfer.address === "string" ? transfer.address : undefined;
        if (!txHash || (!index && !address)) {
          return [];
        }

        return [
          {
            txHash,
            amountAtomic: normalizeAmount(transfer.amount),
            confirmations: Number(transfer.confirmations ?? 0),
            height:
              typeof transfer.height === "number" ? transfer.height : undefined,
            subaddressIndexMajor: index ? Number(index.major ?? 0) : undefined,
            subaddressIndexMinor: index ? Number(index.minor ?? 0) : undefined,
            address,
          },
        ];
      });
    },
    async transfer(args) {
      const result = await rpc<{ tx_hash: string }>("transfer", {
        destinations: [
          { address: args.address, amount: Number(args.amountAtomic) },
        ],
        priority: 0,
      });
      return { txHash: result.tx_hash };
    },
    async getHeight() {
      const result = await rpc<{ height: number }>(
        "get_height",
        {},
        { retries: getConfig().MONERO_RPC_RETRIES },
      );
      return { height: result.height };
    },
    async openWallet(args) {
      await rpc(
        "open_wallet",
        {
          filename: args.filename,
          password: args.password ?? "",
        },
        { retries: getConfig().MONERO_RPC_RETRIES },
      );
    },
    async closeWallet() {
      await rpc(
        "close_wallet",
        {},
        { retries: getConfig().MONERO_RPC_RETRIES },
      );
    },
    async generateFromKeys(args) {
      const result = await rpc<{ address: string; info?: string }>(
        "generate_from_keys",
        {
          address: args.address,
          autosave_current: true,
          filename: args.filename,
          password: args.password ?? "",
          restore_height: args.restoreHeight,
          ...(args.spendKey ? { spendkey: args.spendKey } : {}),
          viewkey: args.viewKey,
        },
        { retries: getConfig().MONERO_RPC_RETRIES },
      );
      return { address: result.address, info: result.info };
    },
  };
}

export function createMockWalletClient(): WalletClient {
  const subaddresses: Array<{ address: string; minorIndex: number }> = [];
  return {
    async getBalance() {
      return {
        balanceAtomic: "0",
        unlockedBalanceAtomic: "0",
      };
    },
    async getAddress() {
      return { address: "mock_wallet_address" };
    },
    async createSubaddress() {
      const minorIndex = subaddresses.length + 1;
      const address = `mock_subaddress_${minorIndex}`;
      subaddresses.push({ address, minorIndex });
      return { address, majorIndex: 0, minorIndex };
    },
    async getTransfers(): Promise<WalletTransfer[]> {
      return [];
    },
    async transfer() {
      return { txHash: `mock_payout_${randomBytes(8).toString("hex")}` };
    },
    async getHeight() {
      return { height: 0 };
    },
    async openWallet() {},
    async closeWallet() {},
    async generateFromKeys(args) {
      return {
        address: args.address,
        info: "Mock view-only wallet generated",
      };
    },
  };
}

export function createWalletClient() {
  return getConfig().MONERO_WALLET_MODE === "real"
    ? createRealWalletClient()
    : createMockWalletClient();
}
