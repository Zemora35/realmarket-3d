import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // Başsız tarayıcı WebGL'i yazılımla (SwiftShader) çizer; 3D sahne yavaş olduğundan süre geniş tutulur.
  timeout: 480_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  // `pnpm dev` zaten çalışıyorsa yeniden kullanılır.
  webServer: [
    { command: 'pnpm --filter @realmarket/api dev', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @realmarket/web dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @realmarket/admin dev', url: 'http://localhost:5174', reuseExistingServer: true, timeout: 120_000 },
  ],
});
