import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import fetch from "node-fetch";

import { getConfig } from "./config";
import type { WalletClient, WalletTransfer } from "./types";

type JsonRpcResponse<T> = {
  result?: T;
  error?: { code: number; message: string };
};

type DigestChallenge = {
  algorithm?: string;
  nonce: string;
  opaque?: string;
  qop?: string;
  realm: string;
};

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function parseDigestChallenge(header: string | null): DigestChallenge {
  if (!header) {
    throw new Error("Wallet RPC did not return a Digest challenge");
  }

  const digestHeader = header
    .split(/,\s*Digest\s+/)[0]
    ?.replace(/^Digest\s+/i, "");
  const parts = Object.fromEntries(
    [...digestHeader.matchAll(/([a-zA-Z0-9_-]+)=("[^"]*"|[^,]*)/g)].map(
      ([, key, value]) => [key, value.replace(/^"|"$/g, "")],
    ),
  );

  if (!parts.realm || !parts.nonce) {
    throw new Error(`Invalid wallet RPC Digest challenge: ${header}`);
  }

  return parts as DigestChallenge;
}

function createDigestAuthorization(args: {
  challenge: DigestChallenge;
  password: string;
  url: URL;
  username: string;
}) {
  const method = "POST";
  const uri = `${args.url.pathname}${args.url.search}`;
  const qop = args.challenge.qop?.split(",")[0] ?? "auth";
  const nc = "00000001";
  const cnonce = Buffer.from(randomBytes(24).toString("hex")).toString(
    "base64",
  );
  const ha1 = md5(`${args.username}:${args.challenge.realm}:${args.password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = md5(
    `${ha1}:${args.challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`,
  );

  const fields = [
    `username="${args.username}"`,
    `realm="${args.challenge.realm}"`,
    `nonce="${args.challenge.nonce}"`,
    `uri="${uri}"`,
    `cnonce="${cnonce}"`,
    `nc=${nc}`,
    `qop=${qop}`,
    `response="${response}"`,
    `algorithm=${args.challenge.algorithm ?? "MD5"}`,
  ];

  if (args.challenge.opaque) {
    fields.push(`opaque="${args.challenge.opaque}"`);
  }

  return `Digest ${fields.join(", ")}`;
}

async function fetchWithDigest(url: string, body: string) {
  const config = getConfig();
  if (!config.MONERO_RPC_USER || !config.MONERO_RPC_PASS) {
    throw new Error("MONERO_RPC_USER and MONERO_RPC_PASS are required");
  }

  const parsedUrl = new URL(url);
  const agent =
    parsedUrl.protocol === "https:"
      ? new https.Agent({ keepAlive: true, maxSockets: 1 })
      : new http.Agent({ keepAlive: true, maxSockets: 1 });

  const first = await fetch(url, {
    agent,
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await first.text();

  const challenge = parseDigestChallenge(first.headers.get("www-authenticate"));
  const authorization = createDigestAuthorization({
    challenge,
    password: config.MONERO_RPC_PASS,
    url: parsedUrl,
    username: config.MONERO_RPC_USER,
  });

  const response = await fetch(url, {
    agent,
    body,
    headers: {
      authorization,
      "content-type": "application/json",
    },
    method: "POST",
  });
  agent.destroy();

  return response;
}

async function rpc<T>(method: string, params: Record<string, unknown> = {}) {
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

  const response = await fetchWithDigest(config.MONERO_RPC_URL, body);
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Wallet RPC ${method} returned ${response.status} ${contentType}: ${text.slice(
        0,
        200,
      )}`,
    );
  }

  const data = JSON.parse(text) as JsonRpcResponse<T>;

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message ?? `Wallet RPC failed: ${response.status}`,
    );
  }

  if (!data.result) {
    throw new Error(`Wallet RPC ${method} returned no result`);
  }

  return data.result;
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
      );
      return {
        balanceAtomic: normalizeAmount(result.balance),
        unlockedBalanceAtomic: normalizeAmount(result.unlocked_balance),
      };
    },
    async getAddress() {
      const result = await rpc<{ address: string }>("get_address");
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
      }>("get_transfers", { in: true, pool: true });

      const transfers = [...(result.in ?? []), ...(result.pool ?? [])];
      return transfers.flatMap((transfer) => {
        const index = transfer.subaddr_index as
          | { major?: number; minor?: number }
          | undefined;
        const txHash = String(transfer.txid ?? transfer.tx_hash ?? "");
        if (!index || !txHash) {
          return [];
        }

        return [
          {
            txHash,
            amountAtomic: normalizeAmount(transfer.amount),
            confirmations: Number(transfer.confirmations ?? 0),
            height:
              typeof transfer.height === "number" ? transfer.height : undefined,
            subaddressIndexMajor: Number(index.major ?? 0),
            subaddressIndexMinor: Number(index.minor ?? 0),
            address:
              typeof transfer.address === "string"
                ? transfer.address
                : undefined,
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
      const result = await rpc<{ height: number }>("get_height");
      return { height: result.height };
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
  };
}

export function createWalletClient() {
  return getConfig().MONERO_WALLET_MODE === "real"
    ? createRealWalletClient()
    : createMockWalletClient();
}
