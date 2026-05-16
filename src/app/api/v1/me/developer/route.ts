import { NextResponse } from "next/server";

import { fetchAuthMutation } from "@/lib/auth-server";
import { convex } from "@/server/convex-client";
import { handleApiError } from "@/server/http";

export async function GET() {
  try {
    const developer = await fetchAuthMutation(
      convex.refs.getOrClaimDeveloperForCurrentUser,
      {},
    );

    return NextResponse.json({ developer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleApiError(error);
  }
}
