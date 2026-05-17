import { NextResponse } from "next/server";

import { fetchAuthMutation } from "@/lib/auth-server";
import { createWebhookSecret } from "@/server/auth";
import { convex } from "@/server/convex-client";
import { handleApiError, parseJson } from "@/server/http";
import { CreateStoreSchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, CreateStoreSchema);
    const webhookSecret = createWebhookSecret();
    const result = await fetchAuthMutation(
      convex.refs.createStoreForCurrentUser,
      {
        name: input.name,
        now: Date.now(),
        webhookSecret,
        webhookUrl: input.webhookUrl,
        withdrawAddress: input.withdrawAddress,
      },
    );

    return NextResponse.json(
      { storeId: result.storeId, webhookSecret },
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
