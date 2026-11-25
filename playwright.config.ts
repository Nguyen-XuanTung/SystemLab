import { defineConfig, devices } from '@playwright/test';
import { PORTS, resolvePort } from './scripts/ports';

const localChannel = process.env.CI ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const e2ePort = resolvePort('SYSTEMLAB_E2E_PORT', PORTS.e2ePort);
const baseURL = `http://${PORTS.host}:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
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
    command: `npm run preview -- --host ${PORTS.host} --port ${e2ePort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
