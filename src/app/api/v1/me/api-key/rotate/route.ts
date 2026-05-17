import { fetchAuthMutation } from "@/lib/auth-server";
import { createApiKey, hashSecret } from "@/server/auth";
import { convex } from "@/server/convex-client";
import { handleApiError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const developer = await fetchAuthMutation(
      convex.refs.getOrClaimDeveloperForCurrentUser,
      {},
    );
    const apiKey = createApiKey();

    await fetchAuthMutation(convex.refs.rotateDeveloperApiKey, {
      apiKeyHash: hashSecret(apiKey),
      developerId: developer.id,
    });

    return json({ apiKey, developerId: developer.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("Unauthorized")) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error);
  }
}
