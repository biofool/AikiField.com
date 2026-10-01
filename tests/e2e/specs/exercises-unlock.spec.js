// Signed-in members get every practice free in /games/exercises/.
// Anonymous visitors keep the freemium split (3 free, 12 locked).
// auth-state.php reports the same PHP session login.php establishes.

const { test, expect } = require('@playwright/test');
const { TEST_EMAIL, PASSWORD, browserLogin } = require('../helpers');

test.describe('exercises freemium + member unlock', () => {
  test('anonymous: 3 free, 12 locked, modal links to sign-in', async ({ page }) => {
    await page.goto('/games/exercises/');
    await expect(page.locator('.ex-chip')).toHaveCount(15);
    await expect(page.locator('.ex-chip.locked')).toHaveCount(12);
    await expect(page.locator('#authBadge')).toBeHidden();

    await page.locator('.ex-chip.locked').first().click();
    await expect(page.locator('#lockModal')).toBeVisible();
    await expect(page.locator('#lockModal a[href^="/login.php"]')).toHaveCount(1);
  });

  test('auth-state.php reflects the session', async ({ page, request }) => {
    // Anonymous
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
    await expect(page.locator('#authBadge')).toContainText('all 20 practices unlocked');
    await expect(page.locator('.ex-chip')).toHaveCount(15);
    await expect(page.locator('.ex-chip.locked')).toHaveCount(0);

    // A normally-locked exercise renders its content — no modal.
    await page.locator('.ex-chip').nth(1).click();
    await expect(page.locator('#lockModal')).toHaveCount(0);
    await expect(page.locator('#player h2')).toBeVisible();
    await expect(page.locator('#player .body')).not.toBeEmpty();
  });
});
