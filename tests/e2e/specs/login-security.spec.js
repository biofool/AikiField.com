// Sign-in hardening (AF #121): the post-login redirect, login CSRF and the
// ?next[]= crash. Each test fails on the code before the fix.
//
// Redirect values go through the same two layers the product has:
//   1. login.php (af_safe_redirect): signed in it sends a Location header;
//      signed out it bakes window.COACH_LOGIN_REDIRECT into the page.
//   2. coach-login.js (safeRedirect): the last check before the browser leaves.
//
// "Stays on site" is judged the way a browser does it: the WHATWG URL parser
// strips TAB, CR and LF from a URL, so "/<TAB>/evil.example" becomes
// "//evil.example". Node's URL class implements the same parser.

const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  TEST_EMAIL,
  PASSWORD,
  SAME_ORIGIN_HEADERS,
  establishSession,
  clearStubRequests,
} = require('../helpers');

const FALLBACK = '/beta/'; // login.php's default destination

// Values that must collapse to the fallback.
const MUST_FALL_BACK = [
  ['TAB inside the path', '/\t/evil.example'],
  ['TAB then a second slash', '/\t//evil.example'],
  ['leading TAB then //', '\t//evil.example'],
  ['LF', '/\n/evil.example'],
  ['CR', '/\r/evil.example'],
  ['CRLF', '/\r\n/evil.example'],
  ['NUL', '/\0/evil.example'],
  ['space', '/ /evil.example'],
  ['DEL', '/\x7f/evil.example'],
  ['backslash', '/\\evil.example'],
  ['percent-encoded backslash', '/%5Cevil.example'],
  ['double-encoded backslash', '/%255Cevil.example'],
  ['scheme-relative', '//evil.example'],
  ['absolute URL', 'https://evil.example/'],
  ['javascript: URL', 'javascript:alert(1)'],
  ['data: URL', 'data:text/html,x'],
  ['login loop', '/login.php'],
];

// Values that are legitimate on-site paths (or stay on site when a server
// does not decode them); they must never leave the origin.
const STAYS_ON_SITE = [
  ['members page', '/members'],
  ['assessment page', '/beta/assessment.php'],
  ['encoded TAB (literal %09)', '/%09/evil.example'],
  ['double-encoded TAB (%2509)', '/%2509/evil.example'],
  ['encoded LF', '/%0a/evil.example'],
  ['query string', '/games/exercises/?src=li'],
];

const ORIGIN = new URL(BASE_URL).origin;

function nextUrl(value) {
  return `/login.php?next=${encodeURIComponent(value)}`;
}

/** The redirect login.php bakes into a signed-out page. */
async function bakedRedirect(request, value) {
  const resp = await request.get(nextUrl(value));
  expect(resp.status()).toBe(200);
  const html = await resp.text();
  const m = html.match(/window\.COACH_LOGIN_REDIRECT = (.*);/);
  expect(m, 'login.php did not bake COACH_LOGIN_REDIRECT').toBeTruthy();
  return JSON.parse(m[1]);
}

test.beforeEach(async ({ request }) => {
  await clearStubRequests(request);
});

test.describe('?next= redirect, signed in (Location header)', () => {
  for (const [label, value] of MUST_FALL_BACK) {
    test(`${label} falls back to ${FALLBACK}`, async ({ request }) => {
      await establishSession(request);
      const resp = await request.get(nextUrl(value), { maxRedirects: 0 });
      expect(resp.status()).toBe(302);
      expect(resp.headers()['location']).toBe(FALLBACK);
    });
  }

  for (const [label, value] of STAYS_ON_SITE) {
    test(`${label} never leaves the site`, async ({ request }) => {
      await establishSession(request);
      const resp = await request.get(nextUrl(value), { maxRedirects: 0 });
      expect(resp.status()).toBe(302);
      const location = resp.headers()['location'];
      expect(new URL(location, BASE_URL).origin).toBe(ORIGIN);
    });
  }
});

test.describe('?next= redirect, signed out (baked COACH_LOGIN_REDIRECT)', () => {
  for (const [label, value] of MUST_FALL_BACK) {
    test(`${label} falls back to ${FALLBACK}`, async ({ request }) => {
      expect(await bakedRedirect(request, value)).toBe(FALLBACK);
    });
  }

  for (const [label, value] of STAYS_ON_SITE) {
    test(`${label} never leaves the site`, async ({ request }) => {
      const baked = await bakedRedirect(request, value);
      expect(new URL(baked, BASE_URL).origin).toBe(ORIGIN);
    });
  }
});

test.describe('?next[]= (array parameter)', () => {
  test('signed out: the login page renders, no HTTP 500', async ({ request }) => {
    const resp = await request.get('/login.php?next[]=x');
    expect(resp.status()).toBe(200);
    expect(await resp.text()).toContain('coach-login-form');
  });

  test('signed in: redirects to the fallback, no HTTP 500', async ({ request }) => {
    await establishSession(request);
    const resp = await request.get('/login.php?next[]=x&next[]=y', { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
    expect(resp.headers()['location']).toBe(FALLBACK);
  });
});

test.describe('coach-login.js is the last line of defence', () => {
  test('a baked off-site redirect is ignored after sign-in', async ({ page }) => {
    const leaked = [];
    await page.route(/^https?:\/\/evil\.example(\/|$)/, (route) => {
      leaked.push(route.request().url());
      return route.abort();
    });
    // Serve the page as a stale or tampered copy would: the redirect baked into
    // it points off-site. An init script that traps the assignment does this
    // without touching the network (fulfilling the HTML from a route would make
    // Chromium treat the page as another address space and block its scripts).
    await page.addInitScript(() => {
      Object.defineProperty(window, 'COACH_LOGIN_REDIRECT', {
        configurable: true,
        get: () => '/\t/evil.example',
        set: () => {},
      });
    });

    await page.goto('/login.php');
    await page.fill('#coach-email', TEST_EMAIL);
    await page.fill('#coach-password', PASSWORD);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('/login.php'), { timeout: 15_000 }),
      page.click('#coach-login-btn'),
    ]);

    expect(leaked, 'the browser tried to reach the off-site host').toEqual([]);
    expect(new URL(page.url()).origin).toBe(ORIGIN);
    // coach-login.js falls back to its own default.
    expect(new URL(page.url()).pathname).toBe('/members.php');
  });

  test('an off-site ?redirect= is ignored after sign-in', async ({ page }) => {
    const leaked = [];
    await page.route(/^https?:\/\/evil\.example(\/|$)/, (route) => {
      leaked.push(route.request().url());
      return route.abort();
    });
    await page.goto(`/login.php?redirect=${encodeURIComponent('/\t/evil.example')}`);
    await page.fill('#coach-email', TEST_EMAIL);
    await page.fill('#coach-password', PASSWORD);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('/login.php'), { timeout: 15_000 }),
      page.click('#coach-login-btn'),
    ]);
    expect(leaked).toEqual([]);
    expect(new URL(page.url()).origin).toBe(ORIGIN);
  });
});

test.describe('backend-login is same-origin only (login CSRF)', () => {
  const REFUSED = [
    ['a foreign Origin', { Origin: 'https://evil.example' }],
    ['a foreign Origin and cross-site fetch metadata', { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }],
    ['same-site (sibling subdomain) fetch metadata', { 'Sec-Fetch-Site': 'same-site' }],
    ['Origin: null (sandboxed frame)', { Origin: 'null' }],
    ['no Origin and no Sec-Fetch-Site', {}],
    ['cross-site fetch metadata even with a matching Origin', { Origin: BASE_URL, 'Sec-Fetch-Site': 'cross-site' }],
    ['an Origin with another port', { Origin: 'http://0.0.0.0:1' }],
  ];

  for (const [label, headers] of REFUSED) {
    test(`refuses ${label}`, async ({ request }) => {
      const resp = await request.post('/login.php', {
        headers,
        form: { action: 'backend-login', email: TEST_EMAIL, sessionToken: `stub|${TEST_EMAIL}` },
      });
      expect(resp.status()).toBe(403);
      expect(await resp.json()).toEqual({ ok: false });
      // No cookie of any kind is handed to the foreign page's visitor ...
      const cookies = resp.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
      expect(cookies).toEqual([]);
      // ... and the account is not signed in.
      const gated = await request.get('/beta/', { maxRedirects: 0 });
      expect(gated.status()).toBe(302);
      expect(gated.headers()['location']).toContain('/login.php');
    });
  }

  const ACCEPTED = [
    ['a matching Origin', { Origin: BASE_URL }],
    ['same-origin fetch metadata', { 'Sec-Fetch-Site': 'same-origin' }],
    ['both, as a browser sends them', SAME_ORIGIN_HEADERS],
  ];

  for (const [label, headers] of ACCEPTED) {
    test(`accepts ${label}`, async ({ request }) => {
      const result = await establishSession(request, { headers });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true });
    });
  }

  test('array values in the POST body give ok:false, not HTTP 500', async ({ request }) => {
    const resp = await request.post('/login.php', {
      headers: SAME_ORIGIN_HEADERS,
      form: { action: 'backend-login', 'email[]': 'x', 'sessionToken[]': 'y' },
    });
    expect(resp.status()).toBe(200);
    expect(await resp.json()).toEqual({ ok: false });
  });

  test('the sign-in form itself still works (the browser sends the headers)', async ({ page }) => {
    await page.goto('/login.php?next=/beta/');
    await page.fill('#coach-email', TEST_EMAIL);
    await page.fill('#coach-password', PASSWORD);
    await Promise.all([
      page.waitForURL((u) => u.pathname === '/beta/', { timeout: 15_000 }),
      page.click('#coach-login-btn'),
    ]);
  });
});
