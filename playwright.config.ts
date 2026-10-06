import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-webkit',
      testMatch: ['**/journey-persistence.e2e.ts', '**/live-flow.e2e.ts'],
      use: { ...devices['iPhone 13'], launchOptions: { executablePath: process.env.PW_WEBKIT_EXECUTABLE_PATH } },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.PW_CHROMIUM_EXECUTABLE_PATH, args: process.env.PW_CHROMIUM_SINGLE_PROCESS === '1' ? ['--single-process', '--no-zygote', '--disable-gpu'] : [] } },
    },
  ],
  webServer: {
    command: 'VITE_CLERK_PUBLISHABLE_KEY= npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
