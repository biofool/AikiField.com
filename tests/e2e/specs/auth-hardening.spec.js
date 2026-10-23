// Auth/session hardening specs — issues #100, #114, #121, #122, #123.
//
// Every route that serves gated content is enumerated (the security-fix rule
// in CLAUDE.md): /for-review/*, /beta/data.php, /games/exercises/ (+?src=li
// and slug routes), plus the login surface itself.
const { test, expect } = require('@playwright/test');
const {
  establishSession, stubToken, stubRequests, clearStubRequests,
  TEST_EMAIL, BASE_URL, STUB_URL,
} = require('../helpers');

const FREE_EMAIL = 'free@example.com'; // tier=free in the stub
const MEMBER_EMAIL = TEST_EMAIL;        // tier=member

test.beforeEach(async ({ request }) => {
  await clearStubRequests(request);
});

test.describe('open-redirect guard (issue #121)', () => {
  // next is percent-decoded by PHP once, so %09 arrives as a literal TAB —
  // the payload the browser then strips to read //evil.com.
  const variants = [
    ['TAB', '/%09/evil.com'],
    ['LF', '/%0a/evil.com'],
    ['CR', '/%0d/evil.com'],
    ['backslash', '/%5Cevil.com'],
    ['scheme-relative', '//evil.com'],
    ['double-encoded backslash', '/%255Cevil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
  ];

  for (const [label, next] of variants) {
    test(`signed-out page does not bake a ${label} next=`, async ({ page }) => {
      await page.goto(`/login.php?next=${next}`);
      const baked = await page.evaluate(() => window.COACH_LOGIN_REDIRECT);
      expect(baked).toBe('/beta/');
    });

    test(`signed-in redirect refuses a ${label} next=`, async ({ request }) => {
      await establishSession(request);
      const resp = await request.get(`/login.php?next=${next}`, { maxRedirects: 0 });
      const loc = resp.headers()['location'] || '';
      expect(loc).not.toContain('evil.com');
      expect(loc).not.toContain('javascript:');
      expect(loc.startsWith('/') && !loc.startsWith('//')).toBe(true);
    });
  }

  test('?next[]=x returns a page, not a 500', async ({ request }) => {
    const resp = await request.get('/login.php?next[]=x', { maxRedirects: 0 });
    expect(resp.status()).toBe(200);
  });
});

test.describe('login CSRF guard (issues #100, #121)', () => {
  test('cross-site backend-login POST is refused and sets no session', async ({ request }) => {
    const resp = await request.post('/login.php', {
      headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
      form: { action: 'backend-login', email: TEST_EMAIL, sessionToken: stubToken(TEST_EMAIL) },
    });
    expect((await resp.json()).ok).toBe(false);
    // And the gate must still see the visitor as anonymous.
    const gated = await request.get('/beta/', { maxRedirects: 0 });
    expect(gated.status()).toBe(302);
    expect(gated.headers()['location']).toContain('/login.php');
  });

  test('backend-login POST with no Origin/Sec-Fetch-Site at all is refused', async ({ request }) => {
    const resp = await request.post('/login.php', {
      form: { action: 'backend-login', email: TEST_EMAIL, sessionToken: stubToken(TEST_EMAIL) },
    });
    expect((await resp.json()).ok).toBe(false);
  });

  test('same-origin backend-login POST still works', async ({ request }) => {
    const { body } = await establishSession(request);
    expect(body.ok).toBe(true);
  });
});

test.describe('sign-out revokes the backend token (issue #123)', () => {
  test('logout calls /v1/auth/logout and the old token stops working', async ({ request }) => {
    expect((await establishSession(request)).body.ok).toBe(true);
    await request.post('/login.php', {
      headers: { Origin: BASE_URL, 'Sec-Fetch-Site': 'same-origin' },
      form: { action: 'logout' },
      maxRedirects: 0,
    });
    // The stub saw the revocation call…
    const { requests } = await stubRequests(request);
    expect(requests.some((r) => r.path === '/v1/auth/logout')).toBe(true);
    // …and the token itself is dead at the backend now.
    const check = await request.post(`${STUB_URL}/v1/auth/check-session`, {
      data: { email: TEST_EMAIL, sessionToken: stubToken(TEST_EMAIL) },
    });
    expect((await check.json()).ok).toBe(false);
  });
});

test.describe('member-tier gate (issue #122)', () => {
  const gated = [
    '/for-review/',
    '/for-review/games-comments?action=list',
    '/for-review/documents/',
    '/beta/data.php?f=questions.json',
  ];

  test('a free session gets 403 on every member-gated route', async ({ request }) => {
    expect((await establishSession(request, { email: FREE_EMAIL })).body.ok).toBe(true);
    for (const path of gated) {
      const resp = await request.get(path, { maxRedirects: 0 });
      expect(resp.status(), path).toBe(403);
    }
  });

  test('a member session still gets 200 on member-gated routes', async ({ request }) => {
    expect((await establishSession(request, { email: MEMBER_EMAIL })).body.ok).toBe(true);
    for (const path of gated) {
      const resp = await request.get(path, { maxRedirects: 0 });
      expect(resp.status(), path).toBe(200);
    }
  });
});

test.describe('exercises free preview (issue #114)', () => {
  const practiceRoutes = ['/games/exercises/?src=li', '/games/exercises/wrist-grab-grounding?src=li'];

  test('anonymous preview ships only the three free practice bodies', async ({ request }) => {
    for (const path of practiceRoutes) {
      const resp = await request.get(path);
      expect(resp.status(), path).toBe(200);
      const html = await resp.text();
      const m = html.match(/const exercises = (\[[\s\S]*?\]);/);
      expect(m, 'exercises array missing').toBeTruthy();
      const ex = JSON.parse(m[1]);
      const withBody = ex.filter((e) => e.body !== undefined).map((e) => e.id).sort((a, b) => a - b);
      expect(withBody, path).toEqual([1, 6, 12]);
    }
  });

  test('signed-in member gets all 15 practice bodies', async ({ request }) => {
    await establishSession(request);
    const resp = await request.get('/games/exercises/');
    const html = await resp.text();
    const m = html.match(/const exercises = (\[[\s\S]*?\]);/);
    const ex = JSON.parse(m[1]);
    expect(ex.filter((e) => e.body !== undefined)).toHaveLength(15);
  });

  test('preview is decided by auth state, not cookie presence (issue #121)', async ({ page }) => {
    // A visitor who touched login.php once (session cookie set, not signed in)
    // must still see the free preview, not a redirect to login.
    await page.goto('/login.php'); // plants the session cookie
    const resp = await page.goto('/games/exercises/?src=li');
    expect(resp.status()).toBe(200);
    const html = await resp.text();
    expect(html).toContain('const exercises');
  });
});

test.describe('locale prefix on gated routes (issue #100)', () => {
  test('/es/for-review/ serves the gated dispatcher, not a 404', async ({ request }) => {
    await establishSession(request);
    const resp = await request.get('/es/for-review/', { maxRedirects: 0 });
    expect(resp.status()).toBe(200);
  });
});

test.describe('LinkedIn funnel (issue #121)', () => {
  test('login.php?src=li renders the LinkedIn button', async ({ page }) => {
    await page.goto('/login.php?src=li');
    await expect(page.locator('#coach-social')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.coach-social-btn')).toHaveText(/LinkedIn/);
  });
});
