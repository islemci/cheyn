import { NextResponse } from "next/server";

import { fetchAuthMutation } from "@/lib/auth-server";
import { createWebhookSecret } from "@/server/auth";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { handleApiError, parseJson } from "@/server/http";
import { CreateStoreSchema } from "@/server/schemas";
import { encryptPrivateViewKey } from "@/server/security";

export const dynamic = "force-dynamic";

type CurrentDeveloper = {
  id: string;
};

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, CreateStoreSchema);
    const webhookSecret = createWebhookSecret();
    const config = getConfig();
    const developer = (await fetchAuthMutation(
      convex.refs.getOrClaimDeveloperForCurrentUser,
      {},
    )) as CurrentDeveloper;
    const result = await convex.mutation<{ storeId: string }>(
      convex.refs.createStore,
      {
        cancelCallbackUrl: input.cancelCallbackUrl,
        developerId: developer.id,
        encryptedPrivateViewKey:
          input.paymentMode === "view_only"
            ? encryptPrivateViewKey(input.privateViewKey)
            : undefined,
        encryptionKeyVersion:
          input.paymentMode === "view_only"
            ? config.VIEW_KEY_ENCRYPTION_KEY_VERSION
            : undefined,
        merchantPrimaryAddress:
          input.paymentMode === "view_only"
            ? input.merchantPrimaryAddress
            : undefined,
        name: input.name,
        now: Date.now(),
        paymentMode: input.paymentMode,
        restoreHeight:
          input.paymentMode === "view_only" ? input.restoreHeight : undefined,
        status: input.paymentMode === "view_only" ? "provisioning" : "active",
        successCallbackUrl: input.successCallbackUrl,
        webhookSecret,
        webhookUrl: input.webhookUrl,
        withdrawAddress:
          input.paymentMode === "hosted" ? input.withdrawAddress : undefined,
      },
    );

    return NextResponse.json(
      {
        paymentMode: input.paymentMode,
        settlementType:
          input.paymentMode === "view_only"
            ? "direct_to_wallet"
            : "platform_payout",
        storeId: result.storeId,
        status: input.paymentMode === "view_only" ? "provisioning" : "active",
        webhookSecret,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error);
  }
}
