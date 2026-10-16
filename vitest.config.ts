import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://ghadi@127.0.0.1:5432/ghadi_test",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      NODE_ENV: "test",
    },
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
