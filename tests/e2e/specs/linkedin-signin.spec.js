// LinkedIn sign-in, end to end through the proxy (AF #121 item 5; AF #105 is
// the production switch-on).
//
// Until now nothing in this suite mentioned ?src=li, oauth_code or LinkedIn,
// so the whole funnel was untested. The stub backend now implements the AIR
// contract:
//   GET  /v1/auth/providers              -> the provider list (LinkedIn only)
//   GET  /v1/auth/linkedin/authorize     -> 302 to the callback, sets oauth_nonce
//   GET  /v1/auth/linkedin/callback      -> 302 to login.php?oauth_code=<otc>
//   POST /v1/auth/oauth/exchange?otc=    -> session token (410 when bad)
// The nonce cookie is the state binding from AIR#941: authorize sets it, the
// proxy must relay it, and the callback must get exactly that cookie back.

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  STUB_URL,
  stubRequests,
  clearStubRequests,
} = require('../helpers');

const LINKEDIN_BUTTON = 'button.coach-social-btn[data-provider="linkedin"]';

async function stubSwitch(request, name, body) {
  const resp = await request.post(`${STUB_URL}/__stub/${name}`, { data: body });
  expect(resp.ok(), `stub switch ${name} failed`).toBe(true);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__stub/reset`);
  await clearStubRequests(request);
});

test.afterEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__stub/reset`);
});

test.describe('the LinkedIn button', () => {
  test('?src=li shows "Continue with LinkedIn"', async ({ page }) => {
    await page.goto('/login.php?src=li');
    const button = page.locator(LINKEDIN_BUTTON);
    await expect(button).toBeVisible();
    await expect(button).toContainText('Continue with LinkedIn');
    // The normal form is still there.
    await expect(page.locator('#coach-login-form')).toBeVisible();
  });

  test('without ?src=li the button is not offered', async ({ page }) => {
    await page.goto('/login.php');
    await expect(page.locator('#coach-login-form')).toBeVisible();
    await expect(page.locator('.coach-social-btn')).toHaveCount(0);
  });

  test('a backend without LinkedIn settings (AF #105) shows no button and the form still works', async ({ page, request }) => {
    await stubSwitch(request, 'providers', { linkedin: false });
    await page.goto('/login.php?src=li');
    await expect(page.locator('#coach-login-form')).toBeVisible();
    await expect(page.locator('.coach-social-btn')).toHaveCount(0);
  });

  test('the authorize URL answers 503 through the proxy when LinkedIn is not configured', async ({ request }) => {
    await stubSwitch(request, 'providers', { linkedin: false });
    const resp = await request.get('/coach-api/v1/auth/linkedin/authorize?src=li', { maxRedirects: 0 });
    expect(resp.status()).toBe(503);
  });
});

test.describe('the sign-in flow', () => {
  test('LinkedIn button -> callback -> one-time code -> member session', async ({ page }) => {
    await page.goto('/login.php?src=li&next=/digital-experience/');
    await page.locator(LINKEDIN_BUTTON).click();
    await page.waitForURL((u) => u.pathname.startsWith('/digital-experience'), { timeout: 20_000 });

    // The PHP session exists: a gated, free-tier-friendly page answers 200.
    const resp = await page.request.get('/members', { maxRedirects: 0 });
    expect(resp.status()).toBe(200);
  });

  test('the proxy relays the nonce cookie out and back, and nothing else', async ({ page, request }) => {
    await stubSwitch(request, 'oauth/require-nonce', { on: true });
    await page.goto('/login.php?src=li&next=/digital-experience/');
    await page.locator(LINKEDIN_BUTTON).click();
    await page.waitForURL((u) => u.pathname.startsWith('/digital-experience'), { timeout: 20_000 });

    const log = await stubRequests(request);
    const authorize = log.requests.find((r) => r.path === '/v1/auth/linkedin/authorize');
    const callback = log.requests.find((r) => r.path === '/v1/auth/linkedin/callback');
    expect(authorize, 'authorize never reached the backend').toBeTruthy();
    expect(callback, 'callback never reached the backend').toBeTruthy();
    // The callback carried the nonce cookie (so the binding can pass) ...
    expect(callback.cookieNames.split(',')).toContain('oauth_nonce');
    // ... and ONLY that cookie: the PHP session id must not reach the backend.
    expect(callback.cookieNames.split(',').filter(Boolean)).toEqual(['oauth_nonce']);
    // The authorize request itself carries no cookies.
    expect(authorize.cookieNames).toBe('');
  });

  test('a callback from a browser without the nonce cookie is refused', async ({ page, request }) => {
    await stubSwitch(request, 'oauth/require-nonce', { on: true });
    // Model the attack: the callback link was minted in ANOTHER browser, so this
    // browser never received the nonce cookie. Drop the Set-Cookie from the
    // authorize response; every later request is exactly what a victim sends.
    await page.route('**/coach-api/v1/auth/linkedin/authorize*', async (route) => {
      const resp = await route.fetch({ maxRedirects: 0 });
      // route.fetch() shares the context's cookie jar, so it stores the nonce
      // cookie itself; clear the jar and strip the header from the response.
      await page.context().clearCookies();
      const headers = { ...resp.headers() };
      delete headers['set-cookie'];
      await route.fulfill({ status: resp.status(), headers, body: '' });
    });
    await page.goto('/login.php?src=li&next=/digital-experience/');
    await page.locator(LINKEDIN_BUTTON).click();

    // The login page we start on already matches /login.php, so wait on the
    // message the callback redirect produces rather than on the URL.
    await expect(page.locator('#coach-login-status')).toContainText(/could not be verified/i, { timeout: 20_000 });
    const resp = await page.request.get('/members', { maxRedirects: 0 });
    expect(resp.status(), 'the browser must not be signed in').toBe(302);
  });

  test('cancelling at LinkedIn returns to the login page with a plain message', async ({ page }) => {
    await page.goto('/coach-api/v1/auth/linkedin/authorize?src=li&stub_cancel=1');
    await page.waitForURL((u) => u.pathname.endsWith('/login.php'), { timeout: 20_000 });
    await expect(page.locator('#coach-login-status')).toContainText(/cancelled/i);
    await expect(page.locator('#coach-login-form')).toBeVisible();
  });

  test('a used or invalid one-time code shows an error and signs nobody in', async ({ page }) => {
    await page.goto('/login.php?oauth_code=otc_not_a_real_code');
    await expect(page.locator('#coach-login-status')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#coach-login-status')).toContainText(/fail|invalid|expired/i);
    const resp = await page.request.get('/members', { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
  });

  test('the proxy only forwards the nonce cookie to callback routes', async ({ request }) => {
    // A browser-less request that carries a nonce cookie and the PHP session cookie.
    await request.get('/coach-api/v1/auth/providers', {
      headers: { Cookie: 'oauth_nonce=abcdefabcdefabcdefabcdef; PHPSESSID=secret-session-id' },
    });
    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/providers');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.cookieNames).toBe('');
  });

  test('a malformed nonce cookie is not forwarded to the callback', async ({ request }) => {
    await request.get('/coach-api/v1/auth/linkedin/callback?code=x&state=y', {
      headers: { Cookie: 'oauth_nonce=bad value; PHPSESSID=secret-session-id' },
      maxRedirects: 0,
    });
    const log = await stubRequests(request);
    const hit = log.requests.find((r) => r.path === '/v1/auth/linkedin/callback');
    expect(hit, 'stub backend was not contacted').toBeTruthy();
    expect(hit.cookieNames).toBe('');
  });
});

test('BASE_URL sanity: the stub knows where the site lives', async ({ request }) => {
  // The stub builds the callback and landing URLs from QA_STUB_APP_ORIGIN
  // (AIR reads them from Settings). A mismatch would make every flow above
  // fail with a confusing redirect, so check it directly.
  const resp = await request.get('/coach-api/v1/auth/linkedin/authorize?src=li', { maxRedirects: 0 });
  expect(resp.status()).toBe(302);
  expect(resp.headers()['location']).toContain(`${BASE_URL}/coach-api/v1/auth/linkedin/callback`);
});
