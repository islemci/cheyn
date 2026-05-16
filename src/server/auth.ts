import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createApiKey() {
  return `xmr_live_${randomBytes(32).toString("base64url")}`;
}

export function createWebhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length).trim();
}

export function isEqualSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
