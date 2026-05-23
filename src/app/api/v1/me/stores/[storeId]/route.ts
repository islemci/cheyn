import { NextResponse } from "next/server";

import { fetchAuthMutation } from "@/lib/auth-server";
import { convex } from "@/server/convex-client";
import { handleApiError, parseJson } from "@/server/http";
import { UpdateStoreSchema } from "@/server/schemas";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params;
    const input = await parseJson(request, UpdateStoreSchema);

    const result = await fetchAuthMutation(
      convex.refs.updateStoreForCurrentUser,
      {
        ...input,
        storeId,
      },
    );

    return NextResponse.json({ storeId: result.storeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params;

    const result = await fetchAuthMutation(
      convex.refs.deleteStoreForCurrentUser,
      {
        now: Date.now(),
        storeId,
      },
    );

    return NextResponse.json({ storeId: result.storeId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error);
  }
}
