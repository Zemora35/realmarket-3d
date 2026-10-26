import { defineConfig, devices } from '@playwright/test';

// Gerçek Unity WebGL derlemesinin uçtan uca testi (köprü test komutları ?debug=1 ile açılır).
//   UNITY_BUILD_DIR=unity/RealMarket3D/Builds/WebGL/RealMarket3D npx playwright test -c tests/unity/playwright.config.ts
// Yerelde gerçek GPU ile (Edge + D3D11), CI'da yazılımsal WebGL (SwiftShader) ile çalışır.
const buildDir = process.env.UNITY_BUILD_DIR ?? 'unity/RealMarket3D/Builds/WebGL/RealMarket3D';
const gpu = process.env.RM_GPU === '1';
const launchOptions = gpu
  ? { channel: 'msedge', args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--ignore-gpu-blocklist'] }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

export default defineConfig({
  testDir: '.',
  timeout: 420_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: '../../test-results/unity',
  use: { baseURL: 'http://localhost:5183', launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: [
    { command: 'pnpm --filter @realmarket/api dev', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: true, timeout: 120_000, cwd: '../..' },
    { command: `node tools/site-dev/serve.mjs --port 5183 --unity "${buildDir}"`, url: 'http://localhost:5183', reuseExistingServer: false, timeout: 30_000, cwd: '../..' },
  ],
});
