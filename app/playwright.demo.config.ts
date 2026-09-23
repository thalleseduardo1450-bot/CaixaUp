import { defineConfig, devices } from "@playwright/test";

const appUrl = process.env.DEMO_APP_URL ?? "http://127.0.0.1:5173";
const slowMo = Number(process.env.DEMO_SLOW_MO ?? 320);

export default defineConfig({
  testDir: "./tests/demo",
  timeout: 720_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          slowMo,
        },
      },
    },
  ],
  webServer: [
    {
      command:
        "bash -lc 'Recaptcha__Enabled=false Email__Enabled=false dotnet run --project ../API/NETCORE/HORUSPDV-API.csproj --urls http://localhost:5260'",
      url: "http://localhost:5260/swagger/index.html",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "vite --mode development --host 127.0.0.1 --port 5173",
      url: appUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
