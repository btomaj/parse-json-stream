import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: "./tests/test-reports/vitest-coverage",
    },
  },
});
