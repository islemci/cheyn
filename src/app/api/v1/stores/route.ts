import { requireDeveloper } from "@/server/api-auth";
import { createWebhookSecret } from "@/server/auth";
import { getConfig } from "@/server/config";
import { convex } from "@/server/convex-client";
import { handleApiError, json, parseJson } from "@/server/http";
import { CreateStoreSchema } from "@/server/schemas";
import { encryptPrivateViewKey } from "@/server/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const developer = await requireDeveloper(request);
    const input = await parseJson(request, CreateStoreSchema);
    const webhookSecret = createWebhookSecret();
    const config = getConfig();
    const encryptedPrivateViewKey =
      input.paymentMode === "view_only"
        ? encryptPrivateViewKey(input.privateViewKey)
        : undefined;
    const result = await convex.mutation<{ storeId: string }>(
      convex.refs.createStore,
      {
        developerId: developer.id,
        name: input.name,
        now: Date.now(),
        cancelCallbackUrl: input.cancelCallbackUrl,
        encryptedPrivateViewKey,
        encryptionKeyVersion:
          input.paymentMode === "view_only"
            ? config.VIEW_KEY_ENCRYPTION_KEY_VERSION
            : undefined,
        merchantPrimaryAddress:
          input.paymentMode === "view_only"
            ? input.merchantPrimaryAddress
            : undefined,
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

    return json(
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
    return handleApiError(error);
  }
}
