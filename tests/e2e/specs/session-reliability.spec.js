// Session reliability (AF #123): a slow backend must not sign members out,
// and signing out must end the session at the backend too.
//
// tests/e2e/config.test.php shortens the timings so these run in seconds:
//   COACH_SESSION_REVALIDATE_SECONDS = 2   (production: 6 hours)
//   COACH_SESSION_CHECK_TIMEOUT      = 2   (production: 35 seconds)
//   COACH_SESSION_UNKNOWN_GRACE      = 5   (production: 6 hours)
// The stub's check-session can be delayed to model a cold Cloud Run start.

const { test, expect } = require('@playwright/test');
const {
  STUB_URL,
  TEST_EMAIL,
  SAME_ORIGIN_HEADERS,
  establishSession,
  currentStubToken,
  stubRequests,
  clearStubRequests,
} = require('../helpers');

// PHP compares whole seconds (time()), so "due" means at least 3 s have passed
// for a 2 s interval. The grace runs from the last successful check: 2 s + 5 s.
// A check that times out takes 2 s itself, so a session that is 3.3 s old when
// the backend stalls is 5.3 s old when the gate decides: inside the 7 s limit.
// Waiting 7.6 s puts the decision (9.6 s) past it. The margins keep integer
// rounding from ever making a test flaky.
const DUE_AFTER_MS = 3300;
const PAST_GRACE_MS = 7600;
const SLOW_BUT_ANSWERS_MS = 1000;   // under the 2 s check timeout
const COLD_START_MS = 3500;         // over it

async function stubDelay(request, ms) {
  const resp = await request.post(`${STUB_URL}/__stub/check-session-delay`, { data: { ms } });
  expect(resp.ok()).toBe(true);
}

/** Does the stub backend still accept this token? Asked directly, not through the site. */
async function tokenValid(request, token, email = TEST_EMAIL) {
  const resp = await request.post(`${STUB_URL}/v1/auth/check-session`, {
    data: { email, sessionToken: token },
  });
  return (await resp.json()).ok === true;
}

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__stub/reset`);
  await clearStubRequests(request);
});

test.afterEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__stub/reset`);
});

test.describe('revalidation against a slow backend', () => {
  test('a due check that the backend answers slowly keeps the session', async ({ request }) => {
    await establishSession(request);
    await new Promise((r) => setTimeout(r, DUE_AFTER_MS)); // the check is now due
    await stubDelay(request, SLOW_BUT_ANSWERS_MS); // slower than usual, faster than the timeout
    const resp = await request.get('/beta/', { maxRedirects: 0 });
    expect(resp.status()).toBe(200);
    const log = await stubRequests(request);
    expect(log.requests.filter((r) => r.path === '/v1/auth/check-session').length).toBeGreaterThan(1);
  });

  test('a backend slower than the timeout (cold start) does not sign the member out', async ({ request }) => {
    await establishSession(request);
    await new Promise((r) => setTimeout(r, DUE_AFTER_MS));
    await stubDelay(request, COLD_START_MS); // longer than COACH_SESSION_CHECK_TIMEOUT (2 s)
    const resp = await request.get('/beta/', { maxRedirects: 0 });
    // Before the fix: 302 to /login.php, session destroyed, cookie useless.
    expect(resp.status()).toBe(200);
    // The backend recovers; the very same cookie still works.
    await stubDelay(request, 0);
    await new Promise((r) => setTimeout(r, COLD_START_MS)); // let the stub finish the slow call
    const again = await request.get('/beta/', { maxRedirects: 0 });
    expect(again.status()).toBe(200);
  });

  test('after an outage longer than the grace period the member is signed out, with a message', async ({ request }) => {
    await establishSession(request);
    await new Promise((r) => setTimeout(r, PAST_GRACE_MS));
    await stubDelay(request, COLD_START_MS);
    const resp = await request.get('/beta/', { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toContain('error=session_expired');
  });

  test('a backend that says the session is invalid signs the member out, with a message', async ({ request }) => {
    await establishSession(request);
    await request.post(`${STUB_URL}/v1/auth/logout`, {
      data: { email: TEST_EMAIL, sessionToken: await currentStubToken(request, TEST_EMAIL) },
    });
    await new Promise((r) => setTimeout(r, DUE_AFTER_MS));
    const resp = await request.get('/beta/', { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toContain('error=session_expired');
  });

  test('the login page explains an expired session', async ({ page }) => {
    await page.goto('/login.php?error=session_expired&next=/beta/');
    await expect(page.locator('#coach-login-status')).toContainText(/session has expired/i);
  });
});

test.describe('signing out', () => {
  test('logout revokes the token at the backend and ends the PHP session', async ({ request }) => {
    await establishSession(request);
    const token = await currentStubToken(request, TEST_EMAIL);
    expect(await tokenValid(request, token)).toBe(true);

    const resp = await request.post('/login.php', {
      headers: SAME_ORIGIN_HEADERS,
      form: { action: 'logout' },
      maxRedirects: 0,
    });
    expect(resp.status()).toBe(302);

    const log = await stubRequests(request);
    expect(log.requests.some((r) => r.method === 'POST' && r.path === '/v1/auth/logout')).toBe(true);
    expect(await tokenValid(request, token), 'the backend token must be dead after sign-out').toBe(false);
    const gated = await request.get('/beta/', { maxRedirects: 0 });
    expect(gated.status()).toBe(302);
  });

  test('a cross-site logout is refused and the session survives', async ({ request }) => {
    await establishSession(request);
    const token = await currentStubToken(request, TEST_EMAIL);
    const resp = await request.post('/login.php', {
      headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
      form: { action: 'logout' },
      maxRedirects: 0,
    });
    expect(resp.status()).toBe(403);
    expect(await tokenValid(request, token)).toBe(true);
    expect((await request.get('/beta/', { maxRedirects: 0 })).status()).toBe(200);
  });

  test('if the backend cannot revoke the token, the PHP session still ends', async ({ request }) => {
    await establishSession(request);
    // Take the backend away: the logout call fails.
    await request.post(`${STUB_URL}/__stub/logout-fails`, { data: { on: true } });
    const resp = await request.post('/login.php', {
      headers: SAME_ORIGIN_HEADERS,
      form: { action: 'logout' },
      maxRedirects: 0,
    });
    expect(resp.status()).toBe(302);
    const gated = await request.get('/beta/', { maxRedirects: 0 });
    expect(gated.status()).toBe(302);
  });
});

test.describe('the Sign Out button on /members', () => {
  test('signs the member out and the old token stops working', async ({ page, request }) => {
    await establishSession(page.request);
    const token = await currentStubToken(request, TEST_EMAIL);
    await page.goto('/members');
    const button = page.locator('#coach-logout-bar');
    await expect(button).toBeVisible();
    await Promise.all([
      page.waitForURL((u) => u.pathname.endsWith('/login.php'), { timeout: 15_000 }),
      button.click(),
    ]);
    expect(await tokenValid(request, token)).toBe(false);
  });

  test('when the server cannot sign out, the member is told and stays put (no silent bounce back in)', async ({ page, request }) => {
    await establishSession(page.request);
    const token = await currentStubToken(request, TEST_EMAIL);
    await page.goto('/members');
    await page.route('**/login.php', (route) => (
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
        : route.continue()
    ));
    await page.locator('#coach-logout-bar').click();
    await expect(page.locator('#coach-toast-msg')).toContainText(/Sign-out did not go through/i);
    expect(new URL(page.url()).pathname).toBe('/members');
    expect(await tokenValid(request, token), 'nothing was revoked').toBe(true);
  });
});
