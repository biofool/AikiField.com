// Layout/behaviour spot-checks for the login.php parity port (issue #57):
// tab switching + arrow-key nav, hidden-until-sent OTP, single-row OTP grid,
// compact-footprint sizing, and the i18n-populated language select.
const { test, expect } = require('@playwright/test');

test('login page parity spot-checks', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login.php');
  await page.waitForLoadState('networkidle');

  // Tab bar visible, register panel hidden, OTP wrapper hidden until send
  await expect(page.locator('#coach-auth-tab-bar')).toBeVisible();
  await expect(page.locator('#coach-login')).toBeVisible();
  await expect(page.locator('#coach-register')).toBeHidden();
  await expect(page.locator('#coach-reg-email-validation .coach-otp-wrapper')).toBeHidden();

  // Switch to register via the tab; OTP still hidden, bottom row visible
  await page.click('#coach-tab-register');
  await expect(page.locator('#coach-register')).toBeVisible();
  await expect(page.locator('#coach-login')).toBeHidden();
  await expect(page.locator('.coach-reg-bottom-row')).toBeVisible();
  await expect(page.locator('#coach-reg-email-validation .coach-otp-wrapper')).toBeHidden();

  // Arrow-key nav between tabs (roving tabindex)
  await page.locator('#coach-tab-register').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#coach-login')).toBeVisible();

  // Compact footprint: input min-height ~44px (login tab is active here)
  const inputH = await page.locator('#coach-email').evaluate(el => el.getBoundingClientRect().height);
  expect(inputH).toBeGreaterThanOrEqual(43);

  // OTP digits form a single row (grid): all six share the same top edge
  await page.click('#coach-tab-register');
  await page.evaluate(() => {
    const w = document.querySelector('#coach-reg-email-validation .coach-otp-wrapper');
    if (w) w.hidden = false;
  });
  const tops = await page.locator('#coach-reg-email-validation .coach-otp-digit').evaluateAll(
    els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);

  // Language select populated from i18n config (en + es expected)
  const opts = await page.locator('#coach-reg-language option').allTextContents();
  expect(opts.join(',')).toContain('Español');

  // Status role wiring
  expect(await page.locator('#coach-login-status').getAttribute('role')).toBe('status');

  // No JS errors on the page
  expect(errors).toEqual([]);
});
