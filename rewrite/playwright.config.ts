import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: ["acceptance.spec.ts", "goals.acceptance.ts"],
  workers: 1,
  use: { headless: true },
  timeout: 30000,
});
