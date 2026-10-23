import { defineConfig, devices } from '@playwright/test';

// Requer o ambiente local de dev/ rodando (Postgres + PostgREST). Ver dev/README.md.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'], launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
