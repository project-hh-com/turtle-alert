import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib.js", "lib/posture-detector.js"],
      exclude: ["node_modules/**", "dist/**", "lib/posture-capture.js"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    env: {
      NODE_ENV: "test",
      TURTLE_IMAGESNAP_PATH: "/nonexistent/imagesnap-test-binary",
    },
  },
});
