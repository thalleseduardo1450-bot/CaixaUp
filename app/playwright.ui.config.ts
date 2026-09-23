import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  webServer: process.env.UI_APP_URL ? undefined : {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: process.env.UI_APP_URL || "http://127.0.0.1:5178",
    viewport: { width: 1024, height: 768 },
    screenshot: "only-on-failure",
  },
});
