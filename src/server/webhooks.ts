import { createHmac } from "node:crypto";

import { convex } from "./convex-client";

export function signWebhook(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function deliverWebhook(args: {
  attemptId?: string;
  attemptNumber?: number;
  checkoutId?: string;
  event: string;
  maxFailures?: number;
  payload: Record<string, unknown>;
  retryDelayMs?: number;
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
  const attemptNumber = args.attemptNumber ?? 1;

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

    const payload = {
      checkoutId: args.checkoutId,
      deliveredAt: response.ok ? now : undefined,
      error: response.ok ? undefined : `Webhook returned ${response.status}`,
      event: args.event,
      lastError: response.ok
        ? undefined
        : `Webhook returned ${response.status}`,
      now,
      nextRetryAt: response.ok
        ? undefined
        : now + (args.retryDelayMs ?? 60_000) * attemptNumber,
      payload: args.payload,
      responseBody,
      secret: args.secret,
      status: response.ok ? "sent" : "failed",
      statusCode: response.status,
      storeId: args.storeId,
      url: args.url,
      attemptNumber,
    };

    if (args.attemptId) {
      await convex.mutation(convex.refs.updateWebhookAttempt, {
        attemptId: args.attemptId,
        attemptNumber,
        deliveredAt: payload.deliveredAt,
        error: payload.error,
        lastError: payload.lastError,
        nextRetryAt: payload.nextRetryAt,
        responseBody,
        status: payload.status,
        statusCode: response.status,
      });
    } else {
      await convex.mutation(convex.refs.recordWebhookAttempt, payload);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown webhook error";
    const payload = {
      checkoutId: args.checkoutId,
      error: message,
      event: args.event,
      lastError: message,
      now,
      nextRetryAt: now + (args.retryDelayMs ?? 60_000) * attemptNumber,
      payload: args.payload,
      secret: args.secret,
      status: "failed",
      storeId: args.storeId,
      url: args.url,
      attemptNumber,
    };

    if (args.attemptId) {
      await convex.mutation(convex.refs.updateWebhookAttempt, {
        attemptId: args.attemptId,
        attemptNumber,
        error: message,
        lastError: message,
        nextRetryAt:
          attemptNumber >= (args.maxFailures ?? 5)
            ? undefined
            : payload.nextRetryAt,
        status: "failed",
      });
    } else {
      await convex.mutation(convex.refs.recordWebhookAttempt, payload);
    }
  }
}
