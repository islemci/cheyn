import { requireDeveloper } from "@/server/api-auth";
import { createWebhookSecret } from "@/server/auth";
import { convex } from "@/server/convex-client";
import { handleApiError, json, parseJson } from "@/server/http";
import { CreateStoreSchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const developer = await requireDeveloper(request);
    const input = await parseJson(request, CreateStoreSchema);
    const webhookSecret = createWebhookSecret();
    const result = await convex.mutation<{ storeId: string }>(
      convex.refs.createStore,
      {
        developerId: developer.id,
        name: input.name,
        now: Date.now(),
        cancelCallbackUrl: input.cancelCallbackUrl,
        successCallbackUrl: input.successCallbackUrl,
        webhookSecret,
        webhookUrl: input.webhookUrl,
        withdrawAddress: input.withdrawAddress,
      },
    );

    return json({ storeId: result.storeId, webhookSecret }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
