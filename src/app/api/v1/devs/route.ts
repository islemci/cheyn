import { requireAdmin } from "@/server/api-auth";
import { createApiKey, hashSecret } from "@/server/auth";
import { convex } from "@/server/convex-client";
import { handleApiError, json, parseJson } from "@/server/http";
import { CreateDeveloperSchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const input = await parseJson(request, CreateDeveloperSchema);
    const apiKey = createApiKey();
    const result = await convex.mutation<{ developerId: string }>(
      convex.refs.createDeveloper,
      {
        apiKeyHash: hashSecret(apiKey),
        email: input.email,
        name: input.name,
        now: Date.now(),
      },
    );

    return json({ apiKey, developerId: result.developerId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
