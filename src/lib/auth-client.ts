"use client";

import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

function getAuthBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (typeof window === "undefined") {
    return configured;
  }

  if (!configured) {
    return window.location.origin;
  }

  try {
    const configuredUrl = new URL(configured);
    if (
      window.location.protocol === "https:" &&
      configuredUrl.protocol === "http:" &&
      configuredUrl.hostname === window.location.hostname
    ) {
      return window.location.origin;
    }
  } catch {
    return window.location.origin;
  }

  return configured;
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
  plugins: [convexClient()],
});
