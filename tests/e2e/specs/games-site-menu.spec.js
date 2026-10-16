// Issue #109: every /games/ page carries the shared site header (primary nav).
//
// The games pages were standalone documents with no header, so visitors lost
// the site menu the moment they opened Twenty Practices, the games hub, the
// legal pages, the Lucky Wave about page or the 404. Each page now ships the
// same header block and nav-menu.js as the rest of the site.

const { test, expect } = require('@playwright/test');
const { establishSession } = require('../helpers');

const PUBLIC_PAGES = [
  ['games hub', '/games/index.html'],
  ['privacy', '/games/privacy/'],
  ['terms', '/games/terms/'],
  ['game not found', '/games/404.html'],
  ['Lucky Wave about', '/games/lucky-wave/about.html'],
];

async function expectPrimaryNav(page) {
  const nav = page.locator('nav[aria-label="Primary"]');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('href', '/index.html');
  await expect(page.locator('a.af-brand')).toHaveAttribute('href', '/index.html');
  // The skip link needs a target: exactly one <main id="main">.
  await expect(page.locator('main#main')).toHaveCount(1);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('games pages keep the site menu (issue #109)', () => {
  for (const [name, path] of PUBLIC_PAGES) {
    test(`${name}: primary nav present and its submenu opens`, async ({ page }) => {
      await page.goto(path);
      await expectPrimaryNav(page);

      // nav-menu.js is loaded and wired: the Unified Field button opens the mega menu.
      const toggle = page.locator('button[aria-controls="af-nav-sub-uf"]');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(
        page.locator('#af-nav-sub-uf').getByRole('link', { name: 'Twenty Practices', exact: true })
      ).toHaveAttribute('href', '/games/exercises/');
    });

    test(`${name}: mobile menu toggle shows and nothing overflows`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await expect(page.locator('label[for="af-nav-check"]')).toBeVisible();
      await expect(page.locator('main#main')).toHaveCount(1);
      await expectNoHorizontalOverflow(page);
    });
  }

  test('Twenty Practices: primary nav present for a signed-in member', async ({ page }) => {
    const session = await establishSession(page.request);
    expect(session.body.ok).toBe(true);
    await page.goto('/games/exercises/');
    await expectPrimaryNav(page);
    // The app itself still loads under the header.
    await expect(page.locator('.ex-chip')).toHaveCount(15);

    const toggle = page.locator('button[aria-controls="af-nav-sub-uf"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('Twenty Practices: sticky sidebars sit below the header, not under it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await establishSession(page.request);
    await page.goto('/games/exercises/');
    await expect(page.locator('.ex-chip')).toHaveCount(15);

    const headerHeight = await page.evaluate(() => document.querySelector('.af-header').getBoundingClientRect().height);
    const offset = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--site-header-h'))
    );
    expect(Math.abs(offset - headerHeight)).toBeLessThanOrEqual(1);

    await page.evaluate(() => window.scrollTo(0, 600));
    const sidebarTop = await page.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().top);
    expect(sidebarTop).toBeGreaterThanOrEqual(headerHeight - 1);
  });

  test('Twenty Practices: mobile menu toggle shows and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await establishSession(page.request);
    await page.goto('/games/exercises/');
    await expect(page.locator('label[for="af-nav-check"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
