// Issue #113: "Play Guided" used to run one shared 5-minute Wrist Grab
// timer for every practice — wrong prompts, wrong duration, a page-wide
// timer that kept running across practice switches, and a blocking
// alert() poem at the end. Now each practice's own guide block (in
// data/practices.json) drives the timer; only Wrist Grab Grounding has
// timed prompts and the ground meter.
//
// Playwright's fake clock drives the 1-second interval deterministically.

const { test, expect } = require('@playwright/test');
const { establishSession, TEST_EMAIL } = require('../helpers');

async function openExercises(page) {
  await page.clock.install();
  expect((await establishSession(page.request)).body.ok).toBe(true);
  await page.goto('/games/exercises/');
  // Wait for the auth-state unlock re-render before interacting.
  await expect(page.locator('#authBadge')).toBeVisible();
  await expect(page.locator('#playB')).toBeVisible();
}

test.describe('Play Guided — per-practice guide (issue #113)', () => {
  test('Ocean Breathing: own 2-minute duration and a quiet timer', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openExercises(page);

    await page.locator('.ex-chip', { hasText: 'Ocean Breathing' }).click();
    // 2–4 min meta → guide.seconds = 120 → "2:00", not the old 5:00.
    await expect(page.locator('#circ')).toHaveText('2:00');
    // No Wrist Grab phase line or ground meter for a quiet practice.
    await expect(page.locator('#phase')).toHaveCount(0);
    await expect(page.locator('#gfill')).toHaveCount(0);
    await expect(page.locator('#prompt')).toHaveText('');

    await page.locator('#playB').click();
    await page.clock.runFor(16000);
    await expect(page.locator('#circ')).toHaveText('1:44');
    // No Wrist Grab phrase ever appears.
    await expect(page.locator('#prompt')).toHaveText('');
    expect(errors).toEqual([]);
  });

  test('switching practices stops the timer and resets the button', async ({ page }) => {
    await openExercises(page);
    // Wrist Grab (the default practice) — start playing.
    await expect(page.locator('#circ')).toHaveText('5:00');
    await page.locator('#playB').click();
    await expect(page.locator('#playB')).toHaveText('Pause');
    await page.clock.runFor(16000);
    await expect(page.locator('#circ')).toHaveText('4:44');

    // Switch to Infant Breathing: timer stops, button resets, clock shows
    // the new practice's own duration (3–5 min → 3:00).
    await page.locator('.ex-chip', { hasText: 'Infant Breathing' }).click();
    await expect(page.locator('#playB')).toHaveText('Play Guided');
    await expect(page.locator('#circ')).toHaveText('3:00');
    // And it stays stopped — the old timer must not carry on.
    await page.clock.runFor(5000);
    await expect(page.locator('#circ')).toHaveText('3:00');
  });

  test('end of session: inline Done state, no dialog', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); return d.dismiss(); });
    await openExercises(page);

    await page.locator('.ex-chip', { hasText: 'Ocean Breathing' }).click();
    await page.locator('#playB').click();
    await page.clock.runFor(121000); // run the full 2:00 out

    await expect(page.locator('#doneNote')).toBeVisible();
    await expect(page.locator('#doneNote')).toContainText('Session complete');
    await expect(page.locator('#playB')).toHaveText('Play Guided');
    // The Done state offers Log session.
    await expect(page.locator('#keepB')).toBeVisible();
    expect(dialogs).toEqual([]);
  });

  test('Wrist Grab still shows Push/Pull prompts and the ground meter', async ({ page }) => {
    await openExercises(page);
    await expect(page.locator('#gfill')).toBeVisible();
    await expect(page.locator('#phase')).toContainText('50/50');
    await expect(page.locator('#prompt')).toContainText('Push');

    await page.locator('#playB').click();
    await page.clock.runFor(16000);
    // Fifteen seconds in, the first alternating prompt is "Pull —".
    await expect(page.locator('#prompt')).toContainText('Pull —');
    await expect(page.locator('#gfill')).toBeVisible();
  });
});
