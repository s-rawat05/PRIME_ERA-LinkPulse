import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each file gets its own worker and therefore its own in-memory Postgres (PGlite).
    isolate: true,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "pglite:memory",
      CACHE_DRIVER: "memory",
      RATE_LIMIT_DISABLED: "1",
      AUTH_SECRET: "test-secret-test-secret-test-secret-123456",
      NEXT_PUBLIC_BASE_URL: "https://lp.test",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      GOOGLE_SAFE_BROWSING_API_KEY: "",
    },
  },
});
