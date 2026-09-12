import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 10000 },
  webServer: process.env.SIGNAL_TEST_URL
    ? undefined
    : {
        command: `npm run ${process.env.SIGNAL_TEST_PREVIEW === 'true' ? 'preview' : 'dev'} -- --host 127.0.0.1 --port 4174 --strictPort`,
        url: 'http://127.0.0.1:4174/anthrion-signal/',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
  use: {
    baseURL: process.env.SIGNAL_TEST_URL || 'http://127.0.0.1:4174/anthrion-signal/',
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1050 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 },
    },
  ],
})
