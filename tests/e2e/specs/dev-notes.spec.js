// Issue #112: no developer notes, internal pricing, route strings or
// mismatched counts may appear on player-facing games pages.
//
// These assertions are deliberately dumb string checks — if "$", "rev
// share", "FROM YOUR PDF", "AUTO-LOADED", "Completed IDs" or a route
// string ever comes back on /games/, /games/exercises/ or /games/terms/,
// this spec goes red.

const { test, expect } = require('@playwright/test');
const { establishSession, TEST_EMAIL, PASSWORD, browserLogin } = require('../helpers');

const FORBIDDEN = [
  /\$\d/,                 // pricing (CREATOR $12/mo, DOJO $49/mo)
  /rev share/i,
  /FROM YOUR PDF/i,
  /AUTO-LOADED/i,
  /Completed IDs/i,
  /Lead Magnet/i,
  /Route:\s*\/games\//i,  // dev route strings on the hub cards
  /FREEMIUM MODEL/i,
  /deep links/i,
  /15\+5/,                // stale count that disagreed with the 15 listed
];

for (const path of ['/games/', '/games/terms/', '/games/privacy/']) {
  test(`${path} shows no dev notes or internal copy`, async ({ page }) => {
    await page.goto(path);
    const text = await page.locator('body').innerText();
    for (const re of FORBIDDEN) {
      expect(text, `forbidden pattern ${re} on ${path}`).not.toMatch(re);
    }
  });
}

test('/games/exercises/ (signed in) shows no dev notes or internal copy', async ({ page }) => {
  await browserLogin(page, { email: TEST_EMAIL, password: PASSWORD, next: '/games/exercises/' });
  await expect(page.locator('#authBadge')).toBeVisible();
  await expect(page.locator('.ex-chip').first()).toBeVisible();
  const text = await page.locator('body').innerText();
  for (const re of FORBIDDEN) {
    expect(text, `forbidden pattern ${re} on /games/exercises/`).not.toMatch(re);
  }
});

test('visible counts match the listed items', async ({ page }) => {
  await browserLogin(page, { email: TEST_EMAIL, password: PASSWORD, next: '/games/exercises/' });
  await expect(page.locator('#authBadge')).toBeVisible();
  // 15 practice chips are listed; every visible count must say so.
  await expect(page.locator('.ex-chip')).toHaveCount(15);
  await expect(page.locator('#authBadge')).toContainText('all 15 practices unlocked');
});
