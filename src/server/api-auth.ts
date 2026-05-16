import { hashSecret, isEqualSecret, readBearerToken } from "./auth";
import { getConfig } from "./config";
import { convex } from "./convex-client";
import { ApiError } from "./http";

export type AuthenticatedDeveloper = {
  id: string;
  name: string;
  email: string;
  status: string;
};

export async function requireDeveloper(request: Request) {
  const token = readBearerToken(request);
  if (!token) {
    throw new ApiError(401, "Missing developer API key");
  }

  const developer = await convex.query<AuthenticatedDeveloper | null>(
    convex.refs.getDeveloperByApiKeyHash,
    { apiKeyHash: hashSecret(token) },
  );

  if (!developer || developer.status !== "active") {
    throw new ApiError(401, "Invalid developer API key");
  }

  return developer;
}

export function requireAdmin(request: Request) {
  const config = getConfig();
  if (!config.ADMIN_API_KEY) {
    throw new ApiError(500, "ADMIN_API_KEY is not configured");
  }

  const token = readBearerToken(request);
  if (!token || !isEqualSecret(token, config.ADMIN_API_KEY)) {
    throw new ApiError(401, "Invalid admin API key");
  }
}
