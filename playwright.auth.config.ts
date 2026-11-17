import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/auth-e2e',
  outputDir: 'test-results-auth',
  fullyParallel: true,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run preview -- --outDir dist-auth-tests --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
  projects: [{ name: 'desktop-auth', use: { ...devices['Desktop Chrome'] } }],
});
