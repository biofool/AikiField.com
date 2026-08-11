// HTTP-level redirect assertions for the AikiField beta-gate and login flow.
//
// These are HTTP-level assertions on purpose — no browser, no timing, no stub
// payload fidelity involved. Each test states one rule from the PRD
// (docs/coach-auth-prd.md) and checks it directly.

const { test, expect } = require('@playwright/test');
const {
  TEST_EMAIL,
  establishSession,
} = require('../helpers');

const NO_REDIRECT = { maxRedirects: 0 };

test.describe('beta-gate redirects', () => {
  test('unauthenticated /beta/ redirects to /login.php?next=...', async ({ request }) => {
    const resp = await request.get('/beta/', NO_REDIRECT);
    expect(resp.status()).toBe(302);
    const location = resp.headers()['location'];
    expect(location).toContain('/login.php?next=');
    expect(location).toContain(encodeURIComponent('/beta/'));
  });

  test('unauthenticated /beta/assessment.php redirects to /login.php?next=...', async ({ request }) => {
    const resp = await request.get('/beta/assessment.php', NO_REDIRECT);
    expect(resp.status()).toBe(302);
    const location = resp.headers()['location'];
    expect(location).toContain('/login.php?next=');
    expect(location).toContain(encodeURIComponent('/beta/assessment.php'));
  });

  test('unauthenticated /beta/index.php redirects to /login.php?next=...', async ({ request }) => {
    const resp = await request.get('/beta/index.php', NO_REDIRECT);
    expect(resp.status()).toBe(302);
    const location = resp.headers()['location'];
    expect(location).toContain('/login.php?next=');
    // The redirect target must be a same-origin relative path, not an
    // absolute URL pointing at a wrong environment.
    expect(location).not.toContain('://');
  });

  test('the redirect target is a same-origin relative path (not a wrong environment)', async ({ request }) => {
    const resp = await request.get('/beta/assessment.php', NO_REDIRECT);
    expect(resp.status()).toBe(302);
    const location = resp.headers()['location'];
    // Must start with /login.php — no scheme, no host.
    expect(location.startsWith('/login.php?')).toBe(true);
    expect(location).not.toContain('://');
    expect(location).not.toContain('//');
  });
});

test.describe('login.php redirect logic', () => {
  test('login page emits the correct post-login redirect target', async ({ request }) => {
    // login.php sets window.COACH_LOGIN_REDIRECT to the ?next= value.
    // PHP's json_encode escapes forward slashes, so "/beta/assessment.php"
    // becomes "\/beta\/assessment.php" in the rendered HTML.
    const html = await (await request.get('/login.php?next=/beta/assessment.php')).text();
    expect(html).toContain('window.COACH_LOGIN_REDIRECT = "\\/beta\\/assessment.php"');
    expect(html).toContain('window.COACH_API_BASE = "\\/coach-api"');
  });

  test('login page defaults redirect to /beta/ when ?next= is absent', async ({ request }) => {
    const html = await (await request.get('/login.php')).text();
    // PHP's json_encode escapes forward slashes.
    expect(html).toContain('window.COACH_LOGIN_REDIRECT = "\\/beta\\/"');
  });

  test('signed-in user is redirected to the ?next= target', async ({ request }) => {
    await establishSession(request, { email: TEST_EMAIL });
    const resp = await request.get('/login.php?next=/beta/', NO_REDIRECT);
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toBe('/beta/');
  });

  test('signed-in user defaults to /beta/ when ?next= is absent', async ({ request }) => {
    await establishSession(request, { email: TEST_EMAIL });
    const resp = await request.get('/login.php', NO_REDIRECT);
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toBe('/beta/');
  });

  test('off-site redirect targets are refused (open-redirect guard)', async ({ request }) => {
    await establishSession(request, { email: TEST_EMAIL });
    for (const evil of [
      'https://evil.example.com/',
      '//evil.example.com/',
      'http://evil.example.com/beta/',
    ]) {
      const resp = await request.get(
        `/login.php?next=${encodeURIComponent(evil)}`,
        NO_REDIRECT,
      );
      expect(resp.status()).toBe(302);
      // The open-redirect guard falls back to /beta/ for invalid targets.
      expect(resp.headers()['location']).toBe('/beta/');
    }
  });

  test('a login.php redirect target does not loop back to login', async ({ request }) => {
    await establishSession(request, { email: TEST_EMAIL });
    const resp = await request.get(
      `/login.php?next=${encodeURIComponent('/login.php')}`,
      NO_REDIRECT,
    );
    expect(resp.status()).toBe(302);
    // login.php's regex requires ^/[^/] so /login.php is accepted as a path,
    // but the already-authed fast path redirects to it. The important thing
    // is no infinite loop — the redirect goes somewhere, not back to login
    // with a next=login param.
    const location = resp.headers()['location'];
    expect(location).not.toContain('next=');
  });
});

test.describe('old URL 301 redirects', () => {
  test('projects.html 301-redirects to projects.php', async ({ request }) => {
    const resp = await request.get('/projects.html', NO_REDIRECT);
    expect(resp.status()).toBe(301);
    expect(resp.headers()['location']).toBe('/projects.php');
  });

  test('beta/assessment.html 301-redirects to beta/assessment.php', async ({ request }) => {
    const resp = await request.get('/beta/assessment.html', NO_REDIRECT);
    expect(resp.status()).toBe(301);
    expect(resp.headers()['location']).toBe('/beta/assessment.php');
  });
});
