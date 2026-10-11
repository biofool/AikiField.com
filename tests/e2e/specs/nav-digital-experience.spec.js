// Primary nav restructure + Digital Experience menu + /members AI chat.
//
//  - Services is a submenu holding Process and Approach.
//  - Digital Experience links to the public /digital-experience/ preview
//    pages (issue #71); the experiences themselves are session-gated PHP
//    behind beta-gate.load.php, same as /beta/ and /members.

const { test, expect } = require('@playwright/test');
const { establishSession, TEST_EMAIL } = require('../helpers');

const DX_LINKS = [
  ['Digital Experience', '/digital-experience/'],
  ['Ride the Lucky Wave', '/digital-experience/lucky-wave.html#v1'],
  ['Ride the Lucky Wave V2', '/digital-experience/lucky-wave.html#v2'],
  ['Twenty Practices', '/digital-experience/practices.html'],
  ['Enter the Unified Field Chat', '/digital-experience/unified-field-chat.html'],
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

  test('Sign Out really signs out (logout POST is not swallowed by the signed-in redirect)', async ({ request }) => {
    expect((await establishSession(request)).body.ok).toBe(true);
    expect((await request.get('/members', { maxRedirects: 0 })).status()).toBe(200);
    await request.post('/login.php', { form: { action: 'logout' }, maxRedirects: 0 });
    const after = await request.get('/members', { maxRedirects: 0 });
    expect([302, 303]).toContain(after.status());
    expect(after.headers()['location']).toMatch(/^\/login\.php\?next=/);
  });
});
