import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
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
    url: 'http://127.0.0.1:5173',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
