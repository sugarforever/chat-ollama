import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    fileParallelism: false,
    include: ["tests/**/*.spec.ts"],
    exclude: ["tests/acceptance.spec.ts"],
    // The Intel macOS runner takes substantially longer to start real Node
    // processes and recover durable sessions than local/arm64 development.
    testTimeout: process.env.CI ? 60000 : 20000,
    expect: { poll: { timeout: process.env.CI ? 10000 : 1000 } },
  },
});
