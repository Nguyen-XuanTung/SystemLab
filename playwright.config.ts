import { defineConfig, devices } from '@playwright/test';

const localChannel = process.env.CI ? undefined : (process.env.PLAYWRIGHT_CHANNEL || 'chrome');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    channel: localChannel,
  },
  projects: [
    {
      name: localChannel ?? 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: localChannel,
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
