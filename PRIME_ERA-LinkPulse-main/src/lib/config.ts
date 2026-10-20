/** Central place for environment-driven configuration. Server-only values are never exported to the client. */
export const config = {
  get baseUrl() {
    // On Vercel, fall back to the project's production domain when no explicit base URL is set.
    const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
    const raw = process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || vercelProd || "http://localhost:3000";
    return raw.replace(/\/+$/, "");
  },
  get secret() {
    const s = process.env.AUTH_SECRET;
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("AUTH_SECRET must be set to at least 32 characters in production");
      }
      return "dev-only-insecure-secret-change-me-0123456789";
    }
    return s;
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get upstash() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? { url, token } : null;
  },
  get safeBrowsingKey() {
    return process.env.GOOGLE_SAFE_BROWSING_API_KEY || null;
  },
  get cronSecret() {
    return process.env.CRON_SECRET || null;
  },
};

export function shortUrl(code: string) {
  return `${config.baseUrl}/${code}`;
}

export function shortHost() {
  try {
    return new URL(config.baseUrl).host;
  } catch {
    return "localhost:3000";
  }
}
