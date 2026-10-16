// Issue #113: "Play Guided" belongs to ONE practice.
//
// It used to be a single timer written for Wrist Grab Grounding. Every practice
// got the same 5:00 clock, the same "Phase: 50/50" line and the Push and Pull
// prompts. Switching practice left the old timer running under the new one, and
// the end of the timer opened a blocking alert() with the wrong poem.
//
// Now each practice has a "guide" in data/exercises/practices.json: a duration
// in seconds (the low end of the practice's own time range) and, optionally,
// timed prompts. Only Wrist Grab Grounding has prompts and the ground meter; all
// other practices get a quiet timer. The clock is Playwright's fake clock,
// advanced with runFor (it fires every one-second tick; fastForward would not).

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { establishSession } = require('../helpers');

const PRACTICES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'exercises', 'practices.json'), 'utf8')
).practices;
const byId = (id) => PRACTICES.find((p) => p.id === id);
const WRIST = byId(6);

function clock(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Member session, fake clock installed before load and then held still. */
async function openGuided(page) {
  expect((await establishSession(page.request)).body.ok).toBe(true);
  await page.clock.install({ time: new Date('2026-10-16T09:00:00') });
  await page.goto('/games/exercises/');
  await expect(page.locator('.ex-chip')).toHaveCount(PRACTICES.length);
  await page.clock.pauseAt(new Date('2026-10-16T09:30:00'));
}

async function open(page, practice) {
  await page.locator('.ex-chip', { hasText: practice.title }).click();
  await expect(page.locator('#player h2')).toHaveText(practice.title);
}

test.describe('Play Guided is per practice (issue #113)', () => {
  test('Ocean Breathing starts at its own duration and shows no Wrist Grab phrase after 16 s', async ({ page }) => {
    const ocean = byId(10);
    await openGuided(page);
    await open(page, ocean);

    await expect(page.locator('#circ')).toHaveText(clock(ocean.guide.duration_sec));
    await expect(page.locator('#circ')).toHaveText('2:00');
    // Quiet timer: no phase line, no prompt line, no meter.
    await expect(page.locator('#phase')).toHaveCount(0);
    await expect(page.locator('#prompt')).toHaveCount(0);
    await expect(page.locator('.ground')).toHaveCount(0);
    expect(await page.locator('#timerBox').innerText()).not.toMatch(/phase|push|pull|resist|ground|breathe\.\.\./i);

    await page.locator('#playB').click();
    await page.clock.runFor(16_000);
    await expect(page.locator('#circ')).toHaveText(clock(ocean.guide.duration_sec - 16));
    await expect(page.locator('#playB')).toHaveText('Pause');
    const timerText = await page.locator('#timerBox').innerText();
    expect(timerText).not.toMatch(/Push|Pull|Resist|ground|DBSO|feel where you are|50\/50/i);
    // Nothing on the whole page says it either.
    expect(await page.locator('#player').innerText()).not.toMatch(/Pull — resisting|Push — resisting|Phase: 50\/50/);
  });

  test('every practice starts at the duration in its own data, with a quiet timer unless it has prompts', async ({ page }) => {
    await openGuided(page);
    for (const practice of PRACTICES) {
      await open(page, practice);
      await expect(page.locator('#circ'), `practice ${practice.id}`).toHaveText(clock(practice.guide.duration_sec));
      await expect(page.locator('#playB')).toHaveText('Play Guided');
      const hasPrompts = Boolean(practice.guide.prompt || (practice.guide.steps || []).length);
      await expect(page.locator('#prompt'), `practice ${practice.id} prompt line`).toHaveCount(hasPrompts ? 1 : 0);
      await expect(page.locator('.ground'), `practice ${practice.id} meter`).toHaveCount(practice.guide.meter ? 1 : 0);
    }
    // Only Wrist Grab Grounding has prompts today.
    expect(PRACTICES.filter((p) => p.guide.steps).map((p) => p.id)).toEqual([6]);
  });

  test('switching practice stops the timer and resets the button to Play Guided', async ({ page }) => {
    const ocean = byId(10);
    const infant = byId(11);
    await openGuided(page);
    await open(page, ocean);
    await page.locator('#playB').click();
    await page.clock.runFor(5_000);
    await expect(page.locator('#circ')).toHaveText(clock(ocean.guide.duration_sec - 5));
    await expect(page.locator('#playB')).toHaveText('Pause');

    await open(page, infant);
    await expect(page.locator('#playB')).toHaveText('Play Guided');
    await expect(page.locator('#circ')).toHaveText(clock(infant.guide.duration_sec));
    await page.clock.runFor(10_000);
    await expect(page.locator('#circ')).toHaveText(clock(infant.guide.duration_sec)); // nothing is counting

    // Going back starts the first practice again from its full duration, not from 1:55.
    await open(page, ocean);
    await expect(page.locator('#circ')).toHaveText(clock(ocean.guide.duration_sec));
    await expect(page.locator('#playB')).toHaveText('Play Guided');
    await page.clock.runFor(10_000);
    await expect(page.locator('#circ')).toHaveText(clock(ocean.guide.duration_sec));
  });

  test('switching practice stops a Wrist Grab session, and its prompts do not follow', async ({ page }) => {
    await openGuided(page);
    await open(page, WRIST);
    await page.locator('#playB').click();
    await page.clock.runFor(20_000);
    await expect(page.locator('#prompt')).toHaveText(/^Pull/);

    await open(page, byId(2));
    await expect(page.locator('#prompt')).toHaveCount(0);
    await page.clock.runFor(60_000);
    await expect(page.locator('#circ')).toHaveText(clock(byId(2).guide.duration_sec));
    await expect(page.locator('#timerBox')).not.toContainText(/Pull|Push|ground/);
  });

  test('pause holds the clock, play continues it, reset starts over', async ({ page }) => {
    const ocean = byId(10);
    await openGuided(page);
    await open(page, ocean);
    await page.locator('#playB').click();
    await page.clock.runFor(3_000);
    await expect(page.locator('#circ')).toHaveText('1:57');
    await page.locator('#playB').click(); // Pause
    await expect(page.locator('#playB')).toHaveText('Play Guided');
    await page.clock.runFor(5_000);
    await expect(page.locator('#circ')).toHaveText('1:57');
    await page.locator('#playB').click(); // continue
    await page.clock.runFor(2_000);
    await expect(page.locator('#circ')).toHaveText('1:55');
    await page.locator('#resetB').click();
    await expect(page.locator('#circ')).toHaveText('2:00');
    await expect(page.locator('#playB')).toHaveText('Play Guided');
    await page.clock.runFor(5_000);
    await expect(page.locator('#circ')).toHaveText('2:00');
  });
});

test.describe('the end of a session is inline, never an alert (issue #113)', () => {
  test('a quiet-timer practice ends with Done and a Log session button, and no dialog', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss().catch(() => {});
    });
    const dbso = byId(1); // 30 s
    await openGuided(page);
    await open(page, dbso);
    await page.locator('#playB').click();
    await page.clock.runFor(dbso.guide.duration_sec * 1000 + 2_000);

    const box = page.locator('#timerBox');
    await expect(box).toContainText('Done');
    await expect(page.locator('#circ')).toHaveText('Done');
    await expect(page.getByRole('button', { name: 'Log session', exact: true })).toBeVisible();
    await expect(page.locator('#playB')).toHaveCount(0);
    expect(dialogs).toEqual([]);
    // The player was not re-rendered under the reader: the text and the poem are still there.
    await expect(page.locator('#player .body')).not.toBeEmpty();

    // Log session from the Done state: progress moves, a line confirms it, still no dialog.
    const before = await page.evaluate(() => sessionLog.length);
    await page.getByRole('button', { name: 'Log session', exact: true }).click();
    expect(await page.evaluate(() => sessionLog.length)).toBe(before + 1);
    await expect(page.locator('#logStatus')).toHaveText('Logged! KeepDoingIt');
    expect(dialogs).toEqual([]);

    // Reset leaves the Done state for the full duration again.
    await page.locator('#resetB').click();
    await expect(page.locator('#circ')).toHaveText(clock(dbso.guide.duration_sec));
    await expect(page.locator('#playB')).toHaveText('Play Guided');
    expect(dialogs).toEqual([]);
  });

  test('Wrist Grab Grounding runs to the end with no dialog', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss().catch(() => {});
    });
    await openGuided(page);
    await open(page, WRIST);
    await page.locator('#playB').click();
    await page.clock.runFor(WRIST.guide.duration_sec * 1000 + 1_000);
    await expect(page.locator('#circ')).toHaveText('Done');
    expect(dialogs).toEqual([]);
  });

  test('the log button under the timer confirms inline as well', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss().catch(() => {});
    });
    await openGuided(page);
    await open(page, byId(2));
    await page.locator('#keepB').click();
    await expect(page.locator('#logStatus')).toHaveText('Logged! KeepDoingIt');
    expect(dialogs).toEqual([]);
  });

  test('the longest session ends cleanly too', async ({ page }) => {
    const longest = PRACTICES.reduce((a, b) => (b.guide.duration_sec > a.guide.duration_sec ? b : a));
    expect(longest.guide.duration_sec).toBeGreaterThanOrEqual(600);
    await openGuided(page);
    await open(page, longest);
    await page.locator('#playB').click();
    await page.clock.runFor(longest.guide.duration_sec * 1000);
    await expect(page.locator('#circ')).toHaveText('Done');
  });
});

test.describe('Wrist Grab Grounding keeps its prompts and the ground meter (issue #113)', () => {
  test('Push and Pull alternate, the meter moves 50 → 55 → 60, and the wording is the data’s', async ({ page }) => {
    await openGuided(page);
    await open(page, WRIST);
    const steps = WRIST.guide.steps;
    const textAt = (sec) => steps.filter((s) => s.at_sec <= sec && s.prompt).pop().prompt;
    const phaseAt = (sec) => steps.filter((s) => s.at_sec <= sec && s.phase).pop().phase;
    const meterAt = (sec) => steps.filter((s) => s.at_sec <= sec && s.meter !== undefined).pop().meter;

    // Before play: the opening phase, prompt and meter.
    await expect(page.locator('#circ')).toHaveText('5:00');
    await expect(page.locator('#phase')).toHaveText('Phase: 50/50 — Resist less, ground more');
    await expect(page.locator('#prompt')).toHaveText('Push... feel where you are');
    await expect(page.locator('.ground')).toHaveCount(1);
    await expect(page.locator('#gfill')).toHaveAttribute('style', /width:\s*50%/);
    await expect(page.locator('#gcap')).toHaveText('50% ground — goal 60% — DBSO');

    await page.locator('#playB').click();
    await page.clock.runFor(15_000);
    await expect(page.locator('#prompt')).toHaveText(textAt(15));
    await expect(page.locator('#prompt')).toHaveText(/^Pull — resisting lets them push/);
    await page.clock.runFor(15_000);
    await expect(page.locator('#prompt')).toHaveText(textAt(30));
    await expect(page.locator('#prompt')).toHaveText(/^Push — resisting lets them pull you easily/);
    await page.clock.runFor(15_000);
    await expect(page.locator('#prompt')).toHaveText(/^Pull/);
    await page.clock.runFor(15_000);
    await expect(page.locator('#prompt')).toHaveText(/^Push/);

    // Second stage, at 120 s.
    await page.clock.runFor(60_000);
    await expect(page.locator('#circ')).toHaveText(clock(300 - 120));
    await expect(page.locator('#prompt')).toHaveText(textAt(120));
    await expect(page.locator('#phase')).toHaveText(phaseAt(120));
    await expect(page.locator('#phase')).toHaveText('Inside feel');
    await expect(page.locator('#gfill')).toHaveAttribute('style', new RegExp(`width:\\s*${meterAt(120)}%`));
    await expect(page.locator('#gfill')).toHaveAttribute('style', /width:\s*55%/);
    await expect(page.locator('#gcap')).toHaveText('55% ground — goal 60% — DBSO');

    // Third stage, at 240 s.
    await page.clock.runFor(120_000);
    await expect(page.locator('#circ')).toHaveText(clock(300 - 240));
    await expect(page.locator('#prompt')).toHaveText('DBSO — 60% ground — KeepDoingIt');
    await expect(page.locator('#phase')).toHaveText('60% ground');
    await expect(page.locator('#gfill')).toHaveAttribute('style', /width:\s*60%/);
    await expect(page.locator('#gcap')).toHaveText('60% ground — goal 60% — DBSO');
  });

  test('the timeline is the same as the one the old hard-coded timer ran', async () => {
    // The old tick set a prompt every 15 s from the time left: Push when the time
    // left was a multiple of 30, Pull otherwise, while more than 180 s were left;
    // then the "inside feel" prompt down to 60 s; then the 60% prompt.
    const stateAt = (sec) => {
      const left = 300 - sec;
      if (left > 180) return { prompt: left % 30 === 0 ? /^Push/ : /^Pull/, phase: '50/50 — Resist less, ground more', meter: 50 };
      if (left > 60) return { prompt: /^Resistance hard to see/, phase: 'Inside feel', meter: 55 };
      return { prompt: /^DBSO — 60% ground/, phase: '60% ground', meter: 60 };
    };
    const steps = WRIST.guide.steps;
    for (let sec = 15; sec < 300; sec += 15) {
      const applied = steps.filter((s) => s.at_sec <= sec);
      const prompt = applied.filter((s) => s.prompt).pop().prompt;
      const phase = applied.filter((s) => s.phase).pop().phase;
      const meter = applied.filter((s) => s.meter !== undefined).pop().meter;
      const want = stateAt(sec);
      expect(prompt, `prompt at ${sec}s`).toMatch(want.prompt);
      expect(phase, `phase at ${sec}s`).toBe(want.phase);
      expect(meter, `meter at ${sec}s`).toBe(want.meter);
    }
  });
});
