import { requireAdmin } from "@/server/api-auth";
import { createApiKey, hashSecret } from "@/server/auth";
import { convex } from "@/server/convex-client";
import { handleApiError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ developerId: string }> },
) {
  try {
    requireAdmin(request);
    const { developerId } = await context.params;
    const apiKey = createApiKey();

    await convex.mutation(convex.refs.rotateDeveloperApiKey, {
      apiKeyHash: hashSecret(apiKey),
      developerId,
    });

    return json({ apiKey, developerId });
  } catch (error) {
    return handleApiError(error);
  }
}
