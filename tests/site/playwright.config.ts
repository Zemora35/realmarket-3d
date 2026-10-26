import { defineConfig, devices } from '@playwright/test';

// Web sitesi + köprü sözleşmesi testleri. Unity derlemesi yerine tests/site/fixtures/unity altındaki
// test dublörü kullanılır (gerçek Unity derlemesi CI'da GameCI ile ayrıca derlenir).
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5181' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'pnpm --filter @realmarket/api dev', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: true, timeout: 120_000, cwd: '../..' },
    { command: 'node tools/site-dev/serve.mjs --port 5181 --unity tests/site/fixtures/unity', url: 'http://localhost:5181', reuseExistingServer: false, timeout: 30_000, cwd: '../..' },
  ],
});
