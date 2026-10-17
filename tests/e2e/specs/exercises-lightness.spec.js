// Issue #110: one small kind line after "KeepDoingIt — Log Session".
//
// The lines live in data/exercises/lightness.json (a directory the web server
// denies since issue #114, so this spec reads the file from disk). For a practice, the
// nth logged session shows the nth line of [lines tagged to that practice,
// then the general ones], so the order is predictable here. The player can
// switch the lines off and the choice survives a reload. A missing or broken
// data file is covered by tests/unit/test-lightness-loader.php.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { establishSession } = require('../helpers');

const LIGHTNESS_FILE = path.join(__dirname, '..', '..', '..', 'data', 'exercises', 'lightness.json');

const DBSO = 1;
const AIKI_KOKYU = 7; // three tagged lines, so the fourth log reaches the general ones

function loadItems() {
  return JSON.parse(fs.readFileSync(LIGHTNESS_FILE, 'utf8')).items;
}

function playlist(items, practiceId) {
  const tagged = items.filter((l) => l.practices.includes(practiceId));
  const general = items.filter((l) => l.practices.length === 0);
  return tagged.concat(general);
}

async function openPractice(page, titleText) {
  await page.goto('/games/exercises/');
  await page.locator('.ex-chip', { hasText: titleText }).click();
  await expect(page.locator('#keepB')).toBeVisible();
}

test.describe('post-log lightness line (issue #110)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept()); // "Logged! KeepDoingIt"
    const session = await establishSession(page.request);
    expect(session.body.ok).toBe(true);
  });

  test('logging a session shows one line tagged to that practice, then the next', async ({ page }) => {
    const items = loadItems();
    const lines = playlist(items, DBSO);
    expect(lines[0].practices).toContain(DBSO);

    await openPractice(page, 'DropBackSinkOpen');
    await expect(page.locator('#lightness')).toBeHidden(); // nothing before the first log

    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toHaveText(lines[0].text);

    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toHaveText(lines[1].text);
    expect(lines[1].text).not.toBe(lines[0].text);
  });

  test('after the tagged lines, general lines follow', async ({ page }) => {
    const items = loadItems();
    const lines = playlist(items, AIKI_KOKYU);
    const tagged = items.filter((l) => l.practices.includes(AIKI_KOKYU)).length;
    expect(lines[tagged].practices).toEqual([]);

    await openPractice(page, 'Aiki Kokyu');
    for (let i = 0; i <= tagged; i++) {
      await page.locator('#keepB').click();
      await expect(page.locator('#lightness')).toHaveText(lines[i].text);
    }
  });

  test('the line is not attributed and stays with its practice', async ({ page }) => {
    await openPractice(page, 'DropBackSinkOpen');
    await page.locator('#keepB').click();
    const shown = await page.locator('#lightness').innerText();
    expect(shown.length).toBeGreaterThan(10);
    expect(shown).not.toMatch(/richard|moon|sensei|—\s*\w/i);

    await page.locator('.ex-chip', { hasText: 'Wrist Grab' }).click();
    await expect(page.locator('#lightness')).toBeHidden(); // belongs to the previous practice
  });

  test('the checkbox turns the line off and the choice survives a reload', async ({ page }) => {
    await openPractice(page, 'DropBackSinkOpen');
    const toggle = page.locator('#lightnessToggle');
    await expect(toggle).toBeChecked(); // on by default

    await toggle.uncheck();
    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('moon_lightness'))).toBe('0');

    await page.reload();
    await page.locator('.ex-chip', { hasText: 'DropBackSinkOpen' }).click();
    await expect(page.locator('#lightnessToggle')).not.toBeChecked();
    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toBeHidden();

    await page.locator('#lightnessToggle').check();
    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toBeVisible();
  });

  test('switching the lines off hides one that is already showing', async ({ page }) => {
    await openPractice(page, 'DropBackSinkOpen');
    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toBeVisible();
    await page.locator('#lightnessToggle').uncheck();
    await expect(page.locator('#lightness')).toBeHidden();
  });

  test('a line is never the same one twice running, even across practices', async ({ page }) => {
    const items = loadItems();
    const general = items.filter((l) => l.practices.length === 0);
    const dbso = items.filter((l) => l.practices.includes(DBSO));
    const wrist = items.filter((l) => l.practices.includes(6));

    // Seed the log so DBSO's next line is the first general line, and Wrist
    // Grab's next line is also the first general line: the collision case.
    await page.goto('/games/exercises/');
    await page.evaluate(
      ([dbsoCount, wristCount]) => {
        const log = [];
        for (let i = 0; i < dbsoCount; i++) log.push({ id: 1, at: new Date().toISOString() });
        for (let i = 0; i < wristCount; i++) log.push({ id: 6, at: new Date().toISOString() });
        localStorage.setItem('moon_session_log', JSON.stringify(log));
      },
      [dbso.length, wrist.length]
    );
    await page.reload();

    await page.locator('.ex-chip', { hasText: 'DropBackSinkOpen' }).click();
    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toHaveText(general[0].text);

    await page.locator('.ex-chip', { hasText: 'Wrist Grab' }).click();
    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toHaveText(general[1].text);
  });

  test('lines render as text, never as markup', async ({ page }) => {
    await openPractice(page, 'DropBackSinkOpen');
    const hostile = '<img src=x onerror="window.__lightnessXss=1"><b>bold</b>';
    await page.evaluate((text) => {
      LIGHTNESS.length = 0;
      LIGHTNESS.push({ id: 'lt-xss', text, practices: [1] });
    }, hostile);
    await page.locator('#keepB').click();
    await expect(page.locator('#lightness')).toHaveText(hostile);
    expect(await page.locator('#lightness').evaluate((el) => el.children.length)).toBe(0);
    expect(await page.evaluate(() => window.__lightnessXss)).toBeUndefined();
  });
});
