export type CheckoutStatus =
  | "created"
  | "waiting_for_payment"
  | "seen"
  | "confirming"
  | "confirmed"
  | "settled"
  | "expired"
  | "failed"
  | "manual_review";

export type PaymentMode = "hosted" | "view_only";

export type SettlementType = "platform_payout" | "direct_to_wallet";

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
  subaddressIndexMajor?: number;
  subaddressIndexMinor?: number;
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
  openWallet: (args: { filename: string; password?: string }) => Promise<void>;
  closeWallet: () => Promise<void>;
  generateFromKeys: (args: {
    address: string;
    filename: string;
    password?: string;
    restoreHeight: number;
    spendKey?: string;
    viewKey: string;
  }) => Promise<{ address: string; info?: string }>;
};
