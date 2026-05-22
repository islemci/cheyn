import { getConfig } from "./config";
import { decryptPrivateViewKey } from "./security";
import type { PaymentMode, SettlementType, WalletClient } from "./types";
import { createWalletClient } from "./wallet-rpc";

export type StoreWalletContext = {
  encryptedPrivateViewKey?: string;
  id: string;
  merchantPrimaryAddress?: string;
  mode: PaymentMode;
  restoreHeight?: number;
  viewOnlyWalletReference?: string;
};

export type WalletContext = {
  id: string;
  mode: PaymentMode;
  walletReference: string;
};

let walletQueue: Promise<unknown> = Promise.resolve();

function enqueueWalletOperation<T>(operation: () => Promise<T>) {
  const run = walletQueue.then(operation, operation);
  walletQueue = run.catch(() => undefined);
  return run;
}

export function settlementTypeForMode(mode: PaymentMode): SettlementType {
  return mode === "view_only" ? "direct_to_wallet" : "platform_payout";
}

function hostedWalletReference() {
  return getConfig().WALLET_HOSTED_NAME;
}

function viewOnlyWalletReference(storeId: string) {
  return `view-only/store_${storeId}/wallet`;
}

export class HostedWalletBackend {
  constructor(private readonly wallet: WalletClient = createWalletClient()) {}

  async createPaymentAddress() {
    return enqueueWalletOperation(async () => {
      await this.openHostedWallet();
      return this.wallet.createSubaddress();
    });
  }

  async scanIncomingTransfers() {
    return enqueueWalletOperation(async () => {
      await this.openHostedWallet();
      return this.wallet.getTransfers();
    });
  }

  async sendPayout(args: { address: string; amountAtomic: string }) {
    return enqueueWalletOperation(async () => {
      await this.openHostedWallet();
      return this.wallet.transfer(args);
    });
  }

  private async openHostedWallet() {
    await this.wallet.openWallet({
      filename: hostedWalletReference(),
      password: getConfig().WALLET_HOSTED_PASSWORD,
    });
  }
}

export class ViewOnlyWalletBackend {
  constructor(private readonly wallet: WalletClient = createWalletClient()) {}

  async createWallet(args: {
    merchantPrimaryAddress: string;
    privateViewKey: string;
    restoreHeight: number;
    walletReference: string;
  }) {
    return enqueueWalletOperation(() =>
      this.wallet.generateFromKeys({
        address: args.merchantPrimaryAddress,
        filename: args.walletReference,
        restoreHeight: args.restoreHeight,
        viewKey: args.privateViewKey,
      }),
    );
  }

  async createPaymentAddress(context: WalletContext) {
    return enqueueWalletOperation(async () => {
      await this.wallet.openWallet({ filename: context.walletReference });
      return this.wallet.createSubaddress();
    });
  }

  async scanIncomingTransfers(context: WalletContext) {
    return enqueueWalletOperation(async () => {
      await this.wallet.openWallet({ filename: context.walletReference });
      return this.wallet.getTransfers();
    });
  }
}

export class WalletManager {
  private readonly hosted = new HostedWalletBackend();
  private readonly viewOnly = new ViewOnlyWalletBackend();

  resolveWalletContext(store: StoreWalletContext): WalletContext {
    if (store.mode === "view_only") {
      const walletReference =
        store.viewOnlyWalletReference ?? viewOnlyWalletReference(store.id);
      return {
        id: walletReference,
        mode: "view_only",
        walletReference,
      };
    }

    return {
      id: hostedWalletReference(),
      mode: "hosted",
      walletReference: hostedWalletReference(),
    };
  }

  async createViewOnlyWallet(args: {
    merchantPrimaryAddress: string;
    privateViewKey: string;
    restoreHeight: number;
    storeId: string;
  }) {
    const walletReference = viewOnlyWalletReference(args.storeId);
    await this.viewOnly.createWallet({
      merchantPrimaryAddress: args.merchantPrimaryAddress,
      privateViewKey: args.privateViewKey,
      restoreHeight: args.restoreHeight,
      walletReference,
    });
    return walletReference;
  }

  async createPaymentAddress(store: StoreWalletContext) {
    const context = this.resolveWalletContext(store);
    if (context.mode === "view_only") {
      return this.viewOnly.createPaymentAddress(context);
    }
    return this.hosted.createPaymentAddress();
  }

  async scanIncomingTransfers(store: StoreWalletContext) {
    const context = this.resolveWalletContext(store);
    if (context.mode === "view_only") {
      return this.viewOnly.scanIncomingTransfers(context);
    }
    return this.hosted.scanIncomingTransfers();
  }

  async scanHostedTransfers() {
    return this.hosted.scanIncomingTransfers();
  }

  async sendPayout(args: { address: string; amountAtomic: string }) {
    return this.hosted.sendPayout(args);
  }

  decryptStoreViewKey(store: StoreWalletContext) {
    if (!store.encryptedPrivateViewKey) {
      throw new Error("Store has no encrypted private view key");
    }
    return decryptPrivateViewKey(store.encryptedPrivateViewKey);
  }
}

export function createWalletManager() {
  return new WalletManager();
}
