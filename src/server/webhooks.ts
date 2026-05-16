import { createHmac } from "node:crypto";

import { convex } from "./convex-client";

export function signWebhook(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function deliverWebhook(args: {
  checkoutId?: string;
  event: string;
  payload: Record<string, unknown>;
  secret: string;
  storeId: string;
  url?: string;
}) {
  if (!args.url) {
    return;
  }

  const body = JSON.stringify(args.payload);
  const signature = signWebhook(body, args.secret);
  const now = Date.now();

  try {
    const response = await fetch(args.url, {
      body,
      headers: {
        "content-type": "application/json",
        "x-monero-signature": signature,
      },
      method: "POST",
    });
    const responseBody = (await response.text()).slice(0, 1000);

    await convex.mutation(convex.refs.recordWebhookAttempt, {
      checkoutId: args.checkoutId,
      event: args.event,
      now,
      responseBody,
      status: response.ok ? "sent" : "failed",
      statusCode: response.status,
      storeId: args.storeId,
      url: args.url,
    });
  } catch (error) {
    await convex.mutation(convex.refs.recordWebhookAttempt, {
      checkoutId: args.checkoutId,
      error: error instanceof Error ? error.message : "Unknown webhook error",
      event: args.event,
      now,
      status: "failed",
      storeId: args.storeId,
      url: args.url,
    });
  }
}
