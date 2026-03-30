import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'https://localhost:444',
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'https://localhost:444',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
