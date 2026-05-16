import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

function requirePublicEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value.replace(/\/+$/, "");
}

export const {
  fetchAuthAction,
  fetchAuthMutation,
  fetchAuthQuery,
  getToken,
  handler,
  isAuthenticated,
  preloadAuthQuery,
} = convexBetterAuthNextJs({
  convexSiteUrl: requirePublicEnv("NEXT_PUBLIC_CONVEX_SITE_URL"),
  convexUrl: requirePublicEnv("NEXT_PUBLIC_CONVEX_URL"),
});
