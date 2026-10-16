// /games/exercises/ is members-only (issue #71): anonymous visitors are
// redirected to /login.php?next=… before the app loads — the freemium split
// (3 free, 12 locked) no longer exists because the app itself is gated.
// Signed-in members get every practice unlocked; auth-state.php still
// reports the same PHP session login.php establishes (AF_GATE_NO_REDIRECT).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { TEST_EMAIL, PASSWORD, browserLogin } = require('../helpers');

// Counts on the page come from the data (issue #112), so the spec does too.
const PRACTICE_COUNT = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'exercises', 'practices.json'), 'utf8')
).practices.length;

test.describe('exercises gate (issue #71)', () => {
  test('anonymous: redirected to the blind login with ?next=', async ({ page }) => {
    await page.goto('/games/exercises/');
    await expect(page).toHaveURL(/\/login\.php\?next=/);
  });

  test('anonymous deep link: ?next= preserves the practice slug', async ({ request }) => {
    const resp = await request.get('/games/exercises/wrist-grab-grounding', { maxRedirects: 0 });
    expect([302, 303]).toContain(resp.status());
    expect(resp.headers()['location']).toBe(
      '/login.php?next=' + encodeURIComponent('/games/exercises/wrist-grab-grounding')
    );
  });

  test('auth-state.php reflects the session', async ({ page, request }) => {
    // Anonymous — public JSON endpoint, no redirect
    const anon = await request.get('/games/exercises/auth-state.php');
    expect(await anon.json()).toEqual({ authed: false });
    expect(anon.headers()['cache-control']).toContain('no-store');

    // Signed in via the real browser login flow
    await browserLogin(page, { email: TEST_EMAIL, password: PASSWORD, next: '/games/exercises/' });
    const authed = await page.evaluate(() =>
      fetch('auth-state.php', { credentials: 'same-origin' }).then((r) => r.json())
    );
    expect(authed).toEqual({ authed: true });
  });

  test('signed-in: all exercises unlocked with badge', async ({ page }) => {
    await browserLogin(page, { email: TEST_EMAIL, password: PASSWORD, next: '/games/exercises/' });

    await expect(page.locator('#authBadge')).toBeVisible();
    await expect(page.locator('#authBadge')).toContainText(`all ${PRACTICE_COUNT} practices unlocked`);
    await expect(page.locator('.ex-chip')).toHaveCount(PRACTICE_COUNT);
    await expect(page.locator('.ex-chip.locked')).toHaveCount(0);

    // A normally-locked exercise renders its content — no modal.
    await page.locator('.ex-chip').nth(1).click();
    await expect(page.locator('#lockModal')).toHaveCount(0);
    await expect(page.locator('#player h2')).toBeVisible();
    await expect(page.locator('#player .body')).not.toBeEmpty();
  });

  test('signed-in: Invisible Partner toggle has a clean label and an accessible explanation', async ({ page }) => {
    await browserLogin(page, { email: TEST_EMAIL, password: PASSWORD, next: '/games/exercises/' });
    await page.locator('.ex-chip', { hasText: 'Wrist Grab' }).click();
    const invB = page.locator('#invB');
    await expect(invB).toHaveText('Invisible Partner');
    await expect(invB).toHaveAttribute('title', 'Invisible partner means practicing by yourself.');
    await expect(invB).toHaveAttribute('aria-describedby', 'invB-desc');
    await expect(page.locator('#invB-desc')).toHaveText('Invisible partner means practicing by yourself.');
  });
});
