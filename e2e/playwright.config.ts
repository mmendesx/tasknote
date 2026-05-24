import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',

  // Global timeout per test
  timeout: 60_000,

  // Expect timeout for assertions
  expect: { timeout: 10_000 },

  // Run tests sequentially — single-user local app, no parallelism needed
  workers: 1,
  fullyParallel: false,

  use: {
    baseURL: 'http://localhost:5173',
    // Capture traces on failure for easier debugging
    trace: 'on-first-retry',
    // Headless by default; set PWHEADED=1 to debug visually
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
