// Basic smoke tests for the AikiField.com homepage and public pages.
//
// Verifies the site loads, has expected content, and the public nav is present.

const { test, expect } = require('@playwright/test');

test.describe('homepage', () => {
  test('/ returns 200', async ({ request }) => {
    const resp = await request.get('/');
    expect(resp.status()).toBe(200);
  });

  test('/index.html returns 200', async ({ request }) => {
    const resp = await request.get('/index.html');
    expect(resp.status()).toBe(200);
  });

  test('page has the expected title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AikiField.*Security Leadership/);
  });

  test('page has the AikiField brand', async ({ page }) => {
    await page.goto('/');
    const brand = page.locator('.af-brand__text');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText('AikiField');
  });

  test('page has the primary navigation', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('.af-nav');
    await expect(nav).toBeVisible();
    // Check a few nav links that should always be present.
    await expect(page.locator('.af-nav__link[href="index.html"]')).toBeVisible();
    await expect(page.locator('.af-nav__link[href="services.html"]')).toBeVisible();
    await expect(page.locator('.af-nav__cta[href="contact.html"]')).toBeVisible();
  });

  test('page has a footer with legal text', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('.af-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('AikiField');
  });
});

test.describe('public pages smoke test', () => {
  test('projects.php returns 200', async ({ request }) => {
    const resp = await request.get('/projects.php');
    expect(resp.status()).toBe(200);
  });

  test('services.html returns 200', async ({ request }) => {
    const resp = await request.get('/services.html');
    expect(resp.status()).toBe(200);
  });

  test('contact.html returns 200', async ({ request }) => {
    const resp = await request.get('/contact.html');
    expect(resp.status()).toBe(200);
  });

  test('approach.html returns 200', async ({ request }) => {
    const resp = await request.get('/approach.html');
    expect(resp.status()).toBe(200);
  });

  test('process.html returns 200', async ({ request }) => {
    const resp = await request.get('/process.html');
    expect(resp.status()).toBe(200);
  });
});
