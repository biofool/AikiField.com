// Primary nav restructure + Digital Experience menu + /members AI chat.
//
//  - Services is a submenu holding Process and Approach.
//  - Digital Experience links to the public /digital-experience/ preview
//    pages for Lucky Wave and Verbal Aikido (issue #71); Twenty Practices
//    and the Unified Field Chat link straight to the gated apps
//    (/games/exercises/, /members) — issue #106 removed the intermediate
//    preview pages from the user flow (their old URLs 301).

const { test, expect } = require('@playwright/test');
const { establishSession, TEST_EMAIL, SAME_ORIGIN_HEADERS } = require('../helpers');

const DX_LINKS = [
  ['Digital Experience', '/digital-experience/'],
  ['Ride the Lucky Wave', '/digital-experience/lucky-wave.html#v1'],
  ['Ride the Lucky Wave V2', '/digital-experience/lucky-wave.html#v2'],
  ['Twenty Practices', '/games/exercises/'],
  ['Enter the Unified Field Chat', '/members'],
];

test.describe('primary nav submenus', () => {
  test('Process and Approach live under Services, not at the top level', async ({ page }) => {
    await page.goto('/index.html');
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav.locator(':scope > a[href="process.html"]')).toHaveCount(0);
    await expect(nav.locator(':scope > a[href="approach.html"]')).toHaveCount(0);

    const toggle = nav.locator('button[aria-controls="af-nav-sub-services"]');
    const submenu = page.locator('#af-nav-sub-services');
    await expect(submenu).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(submenu.getByRole('link', { name: 'Process' })).toBeVisible();
    await expect(submenu.getByRole('link', { name: 'Approach' })).toBeVisible();

    // Escape closes and returns focus to the toggle.
    await submenu.getByRole('link', { name: 'Process' }).focus();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('on process.html the Services parent is marked active', async ({ page }) => {
    await page.goto('/process.html');
    await expect(page.locator('nav[aria-label="Primary"] a[href="services.html"]')).toHaveClass(/af-nav__link--active/);
    await expect(page.locator('#af-nav-sub-services a[aria-current="page"]')).toHaveAttribute('href', 'process.html');
  });

  test('Digital Experience column lists the released games and the Unified Field Chat', async ({ page }) => {
    await page.goto('/index.html');
    const btn = page.locator('button[aria-controls="af-nav-sub-uf"]');
    await btn.click();
    const menu = page.locator('#af-nav-sub-uf');
    for (const [name, href] of DX_LINKS) {
      await expect(menu.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }
    // The open menu stays inside the viewport (fixed/absolute audit).
    const box = await menu.boundingBox();
    const vw = page.viewportSize().width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
  });

  test('mobile: submenu opens inline and nothing overflows horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');
    await page.locator('label[for="af-nav-check"]').click();
    await page.locator('button[aria-controls="af-nav-sub-uf"]').click();
    await expect(page.locator('#af-nav-sub-uf').getByRole('link', { name: 'Enter the Unified Field Chat' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('Digital Experience auth-aware actions', () => {
  const PAGES = [
    ['/digital-experience/lucky-wave.html', [
      ['/games/lucky-wave/RideTheLuckyWaveV1-legacy.php', 'Sign in to play V1', 'Play V1'],
      ['/games/lucky-wave/RideTheLuckyWaveV2.php', 'Sign in to play V2', 'Play V2'],
    ]],
    ['/digital-experience/verbal-aikido.html', [
      ['/for-review/games/verbal-aikido/', 'Sign in to play', 'Play Verbal Aikido'],
    ]],
  ];

  for (const [pagePath, actions] of PAGES) {
    test(`anonymous: ${pagePath} keeps sign-in actions and return destinations`, async ({ page }) => {
      await page.goto(pagePath);
      for (const [href, signedOutLabel] of actions) {
        const action = page.locator(`a[href="${href}"]`);
        await expect(action).toHaveText(signedOutLabel);
      }
      const login = page.locator('[data-auth-hide] a[href^="/login.php?next="]');
      await expect(login).toBeVisible();
      expect(new URL(await login.getAttribute('href'), page.url()).searchParams.get('next')).toBe(actions[0][0]);
    });

    test(`authenticated: ${pagePath} shows action labels and hides sign-in callout`, async ({ page }) => {
      expect((await establishSession(page.request)).body.ok).toBe(true);
      await page.goto(pagePath);
      for (const [href, , signedInLabel] of actions) {
        await expect(page.locator(`a[href="${href}"]`)).toHaveText(signedInLabel);
      }
      await expect(page.locator('[data-auth-hide]')).toBeHidden();
    });
  }

  test('authenticated hub removes sign-in guidance and callout', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/digital-experience/');
    await expect(page.locator('[data-auth-label="Choose an experience below."]')).toHaveText('Choose an experience below.');
    await expect(page.locator('[data-auth-hide]')).toBeHidden();
  });
});

test.describe('games require a session (issue #71)', () => {
  const GATED = [
    ['/games/lucky-wave/RideTheLuckyWaveV1-legacy.html', '/games/lucky-wave/RideTheLuckyWaveV1-legacy.php'],
    ['/games/lucky-wave/RideTheLuckyWaveV2.html', '/games/lucky-wave/RideTheLuckyWaveV2.php'],
    ['/for-review/games/verbal-aikido/', null],
    ['/games/exercises/', null],
    ['/games/exercises/wrist-grab-grounding', null],
  ];
  for (const [path, htmlRedirect] of GATED) {
    test(`${path} redirects signed-out visitors to login`, async ({ request }) => {
      if (htmlRedirect) {
        // Old .html URL 301s to the gated .php entry point first.
        const moved = await request.get(path, { maxRedirects: 0 });
        expect(moved.status()).toBe(301);
        expect(moved.headers()['location']).toBe(htmlRedirect);
      }
      const resp = await request.get(htmlRedirect || path, { maxRedirects: 0 });
      expect([302, 303]).toContain(resp.status());
      expect(resp.headers()['location']).toBe('/login.php?next=' + encodeURIComponent(htmlRedirect || path));
    });
  }

  test('old Verbal Aikido game URL redirects to the review area', async ({ request }) => {
    const resp = await request.get('/games/verbal-aikido/', { maxRedirects: 0 });
    expect(resp.status()).toBe(301);
    expect(resp.headers()['location']).toBe('/for-review/games/verbal-aikido/');
  });
});

test.describe('/members AI chat', () => {
  test('signed out: redirects to the blind login with ?next=/members', async ({ request }) => {
    const resp = await request.get('/members', { maxRedirects: 0 });
    expect([302, 303]).toContain(resp.status());
    expect(resp.headers()['location']).toBe('/login.php?next=' + encodeURIComponent('/members'));
  });

  test('signed in: renders the chat with the PHP session injected', async ({ page }) => {
    const { body } = await establishSession(page.request);
    expect(body.ok).toBe(true);
    await page.goto('/members');
    await expect(page.locator('#coach-chat-form')).toBeVisible();
    await expect(page.locator('#coach-chat-input')).toBeVisible();
    const email = await page.evaluate(() => window.QA_SESSION && window.QA_SESSION.email);
    expect(email).toBe(TEST_EMAIL);
  });

  test('signed in: a visible Sign out button in the chat bar signs out', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/members');
    const signOut = page.locator('#coach-logout-bar');
    await expect(signOut).toBeVisible();
    await signOut.click();
    await page.waitForURL(/\/login\.php\?next=/);
    const after = await page.request.get('/members', { maxRedirects: 0 });
    expect([302, 303]).toContain(after.status());
  });

  test('source chips never expose internal IDs — issue #106', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/members');
    await page.locator('#coach-chat-input').fill('show me sources');
    await page.locator('#coach-chat-form').evaluate((f) => f.requestSubmit());

    const chips = page.locator('.coach-source-chip');
    await expect(chips).toHaveCount(4);
    await expect(chips.nth(0)).toHaveText('Corpus note');
    await expect(chips.nth(1)).toHaveText('Blending practice');
    // Bare YouTube ID resolves to the verified English title.
    await expect(chips.nth(2)).toHaveText('Character, Qualities & Archetypes');
    // Opaque hash title on a video source falls back to YT.
    await expect(chips.nth(3)).toHaveText('YT');

    // The ID itself never reaches the user-facing message DOM.
    const msgText = await page.locator('.coach-msg-ai').last().innerText();
    expect(msgText).not.toContain('2MU3b6LUi6Y');
    expect(msgText).not.toContain('a1b2c3d4e5f6a1b2c3d4');
    expect(msgText).not.toContain('notes/x.md');

    // Both YouTube sources still render their embedded players.
    const frames = page.locator('iframe[src*="youtube-nocookie.com/embed/"]');
    await expect(frames).toHaveCount(3);
    await expect(page.locator('iframe[src*="embed/stubVideo01"]')).toHaveCount(1);
    await expect(page.locator('iframe[src*="embed/2MU3b6LUi6Y"]')).toHaveCount(1);
    await expect(page.locator('iframe[src*="embed/stubVideo02"]')).toHaveCount(1);
  });

  test('Sign Out really signs out (logout POST is not swallowed by the signed-in redirect)', async ({ request }) => {
    expect((await establishSession(request)).body.ok).toBe(true);
    expect((await request.get('/members', { maxRedirects: 0 })).status()).toBe(200);
    await request.post('/login.php', { headers: SAME_ORIGIN_HEADERS, form: { action: 'logout' }, maxRedirects: 0 });
    const after = await request.get('/members', { maxRedirects: 0 });
    expect([302, 303]).toContain(after.status());
    expect(after.headers()['location']).toMatch(/^\/login\.php\?next=/);
  });
});
