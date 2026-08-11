// Browser-level tests for the AikiField login page and auth flow.
//
// These exercise the real coach-login.js → coach-proxy.php → stub backend →
// login.php session-establishment chain, the way a user experiences it.

const { test, expect } = require('@playwright/test');
const {
  TEST_EMAIL,
  PASSWORD,
  browserLogin,
  establishSession,
  clearStubRequests,
} = require('../helpers');

test.beforeEach(async ({ request }) => {
  await clearStubRequests(request);
});

test.describe('login page rendering', () => {
  test('/login.php renders with the login form', async ({ page }) => {
    await page.goto('/login.php');
    await expect(page.locator('#coach-login-form')).toBeVisible();
    await expect(page.locator('#coach-login-btn')).toBeVisible();
  });

  test('login form has email and password fields', async ({ page }) => {
    await page.goto('/login.php');
    await expect(page.locator('#coach-email')).toBeVisible();
    await expect(page.locator('#coach-password')).toBeVisible();
    expect(await page.locator('#coach-email').getAttribute('type')).toBe('text');
    expect(await page.locator('#coach-password').getAttribute('type')).toBe('password');
  });

  test('login page has the correct title', async ({ page }) => {
    await page.goto('/login.php');
    await expect(page).toHaveTitle(/Sign in.*AikiField/);
  });

  test('login page loads coach-login.js', async ({ page }) => {
    await page.goto('/login.php');
    const jsLoaded = await page.locator('script[src="coach-login.js"]').count();
    expect(jsLoaded).toBeGreaterThan(0);
  });

  test('login page is noindex,nofollow (blind URL)', async ({ page }) => {
    await page.goto('/login.php');
    const robotsMeta = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robotsMeta).toContain('noindex');
    expect(robotsMeta).toContain('nofollow');
  });
});

test.describe('login form submission', () => {
  test('successful login redirects to the gated content', async ({ page }) => {
    const landed = await browserLogin(page, { email: TEST_EMAIL, password: PASSWORD, next: '/beta/' });
    expect(landed).toBe('/beta/');
  });

  test('successful login with ?next= redirects to the requested page', async ({ page }) => {
    // /beta/assessment.php is a gated page — after login the browser should
    // land there, not on the default /beta/.
    const landed = await browserLogin(page, {
      email: TEST_EMAIL,
      password: PASSWORD,
      next: '/beta/assessment.php',
    });
    expect(landed).toBe('/beta/assessment.php');
  });

  test('bad credentials show an error message', async ({ page }) => {
    await page.goto('/login.php');
    await page.fill('#coach-email', TEST_EMAIL);
    await page.fill('#coach-password', 'wrongpassword');
    await page.click('#coach-login-btn');

    // coach-login.js shows the error in #coach-login-status.
    await expect(page.locator('#coach-login-status')).toBeVisible({ timeout: 10_000 });
    const statusText = await page.locator('#coach-login-status').textContent();
    expect(statusText.toLowerCase()).toMatch(/invalid|error|incorrect/);
  });

  test('login with unknown email shows an error', async ({ page }) => {
    await page.goto('/login.php');
    await page.fill('#coach-email', 'nobody@example.com');
    await page.fill('#coach-password', PASSWORD);
    await page.click('#coach-login-btn');

    await expect(page.locator('#coach-login-status')).toBeVisible({ timeout: 10_000 });
    const statusText = await page.locator('#coach-login-status').textContent();
    expect(statusText.toLowerCase()).toMatch(/invalid|error|incorrect/);
  });
});

test.describe('session establishment', () => {
  test('establishSession creates a valid PHP session', async ({ request }) => {
    const result = await establishSession(request, { email: TEST_EMAIL });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
  });

  test('after session establishment, /beta/ is accessible (no redirect)', async ({ request }) => {
    await establishSession(request, { email: TEST_EMAIL });
    const resp = await request.get('/beta/', { maxRedirects: 0 });
    expect(resp.status()).toBe(200);
  });

  test('after session establishment, /login.php redirects to /beta/', async ({ request }) => {
    await establishSession(request, { email: TEST_EMAIL });
    const resp = await request.get('/login.php', { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toBe('/beta/');
  });
});
