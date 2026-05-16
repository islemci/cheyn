import { requireAdmin } from "@/server/api-auth";
import { convex } from "@/server/convex-client";
import { handleApiError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    requireAdmin(request);
    const { attemptId } = await context.params;
    await convex.mutation(convex.refs.retryWebhookAttempt, { attemptId });
    return json({ attemptId, ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
