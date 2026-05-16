export type CheckoutStatus =
  | "created"
  | "waiting_for_payment"
  | "seen"
  | "confirming"
  | "confirmed"
  | "payout_pending"
  | "paid_out"
  | "expired"
  | "failed";

export type WalletSubaddress = {
  address: string;
  majorIndex: number;
  minorIndex: number;
};

export type WalletTransfer = {
  txHash: string;
  amountAtomic: string;
  confirmations: number;
  height?: number;
  subaddressIndexMajor: number;
  subaddressIndexMinor: number;
  address?: string;
};

export type WalletClient = {
  getBalance: () => Promise<{
    balanceAtomic: string;
    unlockedBalanceAtomic: string;
  }>;
  getAddress: () => Promise<{ address: string }>;
  createSubaddress: () => Promise<WalletSubaddress>;
  getTransfers: () => Promise<WalletTransfer[]>;
  transfer: (args: {
    address: string;
    amountAtomic: string;
  }) => Promise<{ txHash: string }>;
  getHeight: () => Promise<{ height: number }>;
};
