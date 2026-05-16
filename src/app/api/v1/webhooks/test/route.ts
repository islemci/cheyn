import { z } from "zod";
import { requireDeveloper } from "@/server/api-auth";
import { convex } from "@/server/convex-client";
import { ApiError, handleApiError, json, parseJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { deliverWebhook } from "@/server/webhooks";

export const dynamic = "force-dynamic";

const TestWebhookSchema = z.object({
  storeId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const developer = await requireDeveloper(request);
    rateLimit(`webhook-test:${developer.id}`, 10, 60_000);

    const input = await parseJson(request, TestWebhookSchema);
    const store = await convex.query<{
      id: string;
      webhookSecret: string;
      webhookUrl?: string;
    } | null>(convex.refs.getStoreForDeveloper, {
      developerId: developer.id,
      storeId: input.storeId,
    });

    if (!store) {
      throw new ApiError(404, "Store not found");
    }
    if (!store.webhookUrl) {
      throw new ApiError(400, "Store has no webhookUrl configured");
    }

    await deliverWebhook({
      event: "webhook.test",
      payload: {
        event: "webhook.test",
        storeId: store.id,
        test: true,
      },
      secret: store.webhookSecret,
      storeId: store.id,
      url: store.webhookUrl,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
