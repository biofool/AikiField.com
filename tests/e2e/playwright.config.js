// Playwright config for the AikiField.com e2e suite.
//
// Starts two PHP servers:
//   8201  stub backend (canned auth responses)
//   8200  the AikiField.com site itself, with COACH_CONFIG_FILE pointing
//         the coach-config loader at tests/e2e/config.test.php so
//         coach-proxy.php and login.php forward to the stub on 8201.
//
// Run with:  bash tests/e2e/run.sh
// or:        cd tests/e2e && npx playwright test

const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const E2E_DIR = __dirname;
const WEB_ROOT = path.resolve(E2E_DIR, '..', '..');

const APP_PORT = Number(process.env.AF_E2E_APP_PORT || 8200);
const STUB_PORT = Number(process.env.AF_E2E_STUB_PORT || 8201);

// Must match COACH_PROXY_SECRET in config.test.php.
const PROXY_SECRET = 'test-proxy-secret';

const BASE_URL = `http://0.0.0.0:${APP_PORT}`;

function stubServer(port) {
  return {
    command: `php -S 0.0.0.0:${port} ${path.join(E2E_DIR, 'stub-backend.php')}`,
    url: `http://0.0.0.0:${port}/__stub/health`,
    cwd: E2E_DIR,
    env: {
      QA_STUB_PROXY_SECRET: PROXY_SECRET,
      QA_STUB_LOG: path.join(E2E_DIR, '.stub-aikifield.jsonl'),
    },
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 30_000,
  };
}

module.exports = defineConfig({
  testDir: path.join(E2E_DIR, 'specs'),
  // The suite shares a single-process PHP server and one session store per
  // browser context; serialising keeps failures readable and reproducible.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The e2e servers are plain HTTP.
    ignoreHTTPSErrors: true,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    stubServer(STUB_PORT),
    {
      command: `php -S 0.0.0.0:${APP_PORT} -t ${WEB_ROOT} ${path.join(E2E_DIR, 'router.php')}`,
      url: `${BASE_URL}/login.php`,
      cwd: WEB_ROOT,
      env: {
        COACH_CONFIG_FILE: path.join(E2E_DIR, 'config.test.php'),
        // php -S is single threaded; login.php holds the session lock across
        // a blocking curl to the backend, so concurrent requests would
        // serialise into timeouts with one worker.
        PHP_CLI_SERVER_WORKERS: '4',
      },
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 30_000,
    },
  ],
});
