import { convex } from "@/server/convex-client";
import { json } from "@/server/http";
import { createWalletClient } from "@/server/wallet-rpc";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = createWalletClient();
  const [convexResult, walletResult] = await Promise.allSettled([
    convex.query(convex.refs.listOpenCheckouts, {}),
    wallet.getHeight(),
  ]);

  const convexOk = convexResult.status === "fulfilled";
  const walletOk = walletResult.status === "fulfilled";

  return json(
    {
      convex: convexOk ? "ok" : "error",
      convexError:
        convexResult.status === "rejected"
          ? readableError(convexResult.reason)
          : undefined,
      ok: convexOk && walletOk,
      walletRpc: walletOk ? "ok" : "error",
      walletRpcError:
        walletResult.status === "rejected"
          ? readableError(walletResult.reason)
          : undefined,
    },
    { status: convexOk && walletOk ? 200 : 503 },
  );
}

function readableError(error: unknown) {
  if (error instanceof Error) {
    const details = Object.fromEntries(
      Object.entries(error as Error & Record<string, unknown>).filter(
        ([, value]) => value !== undefined,
      ),
    );

    return {
      details,
      message: error.message || error.name,
      name: error.name,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    };
  }
  return String(error);
}
