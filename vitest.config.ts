import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/api/**/*.test.ts", "test/lib/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // The flat per-org rate limit (60 req/min) and Postgres connection
    // pooling both misbehave under heavy parallelism; run files serially.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
