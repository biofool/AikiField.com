// Verbal Aikido game (aikifield.com/for-review/games/verbal-aikido/) —
// Story/Discovery/Practice/Community/Extras/Profile e2e.
//
// The game is gated by the AikiField coaching session (includes/for-review-serve.php
// + beta-gate.load.php). To run: serve this repo on a PHP server, sign in at
// /login.php first (or inject a valid session cookie), then run this spec
// against that base URL. It is no longer part of the quantumaikido.com
// Playwright suite.
//
// Covers the automatable acceptance criteria of tickets #299–#306:
// branching story + anger meter, Discovery unlock/quiz gating, Practice
// centering/stretching/sparring, Community forums/events/practitioner gate,
// minor-safety age check, Extras toggles, and local profile/belt
// progression. CMS (#307) and backend-backed pieces (forum posting,
// session requests, store checkout) are intentionally out of scope here.
//
// Run with: bash tests/e2e/run.sh va-game

const { test, expect } = require('@playwright/test');

const GAME = '/for-review/games/verbal-aikido/'; // requires an authed session
const STORAGE_KEY = 'va-game-progress';
const AGE_GATE_KEY = 'va-age-gate';

// Quiz answer indexes for disc_reactive_responses ("Spotting the Four
// Reactive Responses") — mirrors content.json correctIndex values.
const QUIZ_ANSWERS = [1, 2, 1];

async function openGame(page) {
  await page.goto(GAME);
  await page.waitForSelector('#mode-tabs .mode-tab');
}

async function clickTab(page, label) {
  await page.locator('#mode-tabs .mode-tab', { hasText: label }).click();
}

async function savedState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
}

async function savedAgeGate(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), AGE_GATE_KEY);
}

test.describe.serial('VA game journey', () => {
  test('loads with six mode tabs and no console errors', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    await openGame(page);
    await expect(page.locator('#mode-tabs .mode-tab')).toHaveCount(6);
    for (const label of ['Story', 'Discovery', 'Practice', 'Community', 'Extras', 'Profile']) {
      await expect(page.locator('#mode-tabs .mode-tab', { hasText: label })).toBeVisible();
    }
    // Chapter select renders and the meter starts calm.
    await expect(page.locator('#choices .choice-btn').first()).toBeVisible();
    await expect(page.locator('#meter')).toHaveAttribute('aria-valuenow', '0');
    expect(errors, `console errors on load: ${errors.join(' | ')}`).toEqual([]);
  });

  test('story chapter 1 completes via the Aikido reply', async ({ page }) => {
    await openGame(page);
    await page.locator('#choices .choice-btn', { hasText: 'Chapter 1' }).first().click();
    await page.locator('#choices .choice-btn.primary', { hasText: 'Start chapter' }).click();
    await page.locator('[data-choice-id="ch1_reply_a"]').click();

    await expect(page.locator('#dialogue')).toContainText('energy shift');
    await expect(page.locator('#meter')).toHaveAttribute('aria-valuenow', '0');
    const st = await savedState(page);
    expect(st.completedChapters).toContain('ch1');
    expect(st.unlockedChapters).toContain('ch2');
    expect(st.unlockedLessons).toContain('disc_reactive_responses');
  });

  test('wrong replies raise the meter and offer retry', async ({ page }) => {
    await openGame(page);
    await page.locator('#choices .choice-btn', { hasText: 'Chapter 1' }).first().click();
    await page.locator('#choices .choice-btn.primary', { hasText: 'Start chapter' }).click();
    // Counter-attack: meterDelta +1 → meter 2, lands on a retry node.
    await page.locator('[data-choice-id="ch1_reply_c"]').click();
    await expect(page.locator('#meter')).toHaveAttribute('aria-valuenow', '2');
    await expect(page.locator('#feedback')).toBeVisible();
  });

  test('discovery lesson is gated, then quiz completes it', async ({ page }) => {
    // Fresh state: lesson stays locked until ch1 is done.
    await openGame(page);
    await clickTab(page, 'Discovery');
    await expect(page.locator('.lesson-card.locked').first()).toBeVisible();

    // Complete ch1, then take the quiz.
    await clickTab(page, 'Story');
    await page.locator('#choices .choice-btn', { hasText: 'Chapter 1' }).first().click();
    await page.locator('#choices .choice-btn.primary', { hasText: 'Start chapter' }).click();
    await page.locator('[data-choice-id="ch1_reply_a"]').click();

    await clickTab(page, 'Discovery');
    await page.locator('.lesson-card.unlocked', { hasText: 'Spotting the Four Reactive Responses' }).click();
    await page.locator('#choices .choice-btn.primary', { hasText: 'Take quiz' }).click();

    for (let i = 0; i < QUIZ_ANSWERS.length; i += 1) {
      await page.locator('.quiz-choice').nth(QUIZ_ANSWERS[i]).click();
      await page.locator('#choices .choice-btn.primary', { hasText: /Next question|See score/ }).click();
    }

    await expect(page.locator('.score-banner')).toHaveText('Passed ✓');
    const st = await savedState(page);
    expect(st.completedLessons).toContain('disc_reactive_responses');
  });

  test('practice: centering rates/favorites, stretching session, sparring', async ({ page }) => {
    // Seed a save with ch1 + the gate lesson completed.
    await page.goto(GAME);
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        currentNodeId: 'chapter_select', currentChapterId: null, meter: 0, history: [],
        unlockedChapters: ['ch1', 'ch2'], completedChapters: ['ch1'],
        unlockedLessons: ['disc_reactive_responses'], completedLessons: ['disc_reactive_responses'],
      }));
    }, STORAGE_KEY);
    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');

    // Centering: activities render, star rating + favorite persist.
    await clickTab(page, 'Practice');
    await page.locator('#choices .lesson-card', { hasText: 'Centering' }).click();
    await expect(page.locator('.activity-card')).toHaveCount(5);
    await page.locator('.activity-card .star').nth(3).click(); // 4th star of first activity
    await page.locator('.activity-card .icon-btn').first().click(); // favorite ♥
    let st = await savedState(page);
    expect(Object.values(st.starRatings)).toContain(4);
    expect(st.favorites.length).toBe(1);

    // Style filter narrows the list.
    await page.locator('.filter-row select').selectOption({ index: 1 });
    expect(await page.locator('.activity-card').count()).toBeLessThan(5);

    // Stretching posture 1: answer through to the session-complete screen.
    // The question count comes from content.json — keep clicking Next until
    // the textarea is gone (session-complete view).
    await page.locator('#controls .control-btn', { hasText: 'Back to Practice' }).click();
    await page.locator('#choices .lesson-card', { hasText: 'Stretching' }).click();
    await page.locator('#choices .lesson-card', { hasText: 'Posture 1' }).click();
    for (let i = 0; i < 10 && (await page.locator('.stretch-answer').count()) > 0; i += 1) {
      await page.locator('.stretch-answer').fill(`answer ${i}`);
      await page.locator('#choices .choice-btn.primary', { hasText: /Next question|Finish session/ }).click();
    }
    await expect(page.locator('#chapter-title')).toContainText('complete');
    st = await savedState(page);
    expect(st.stretchSessions).toBe(1);

    // Sparring: ungated now — pick the Aikido response type.
    await page.locator('#choices .choice-btn.primary', { hasText: 'Back to Practice' }).click();
    await page.locator('#choices .lesson-card', { hasText: 'Sparring' }).click();
    await page.locator('#choices .choice-btn.primary', { hasText: 'Step on the verbal mat' }).click();
    await expect(page.locator('#meter')).toHaveAttribute('aria-valuenow', '2');
    await page.locator('#choices .choice-btn', { hasText: 'Aikido' }).click();
    await expect(page.locator('#feedback-text')).toContainText('energy shift');
    st = await savedState(page);
    expect(st.sparringSessions).toBe(1);
  });

  test('sparring stays gated until the quiz is passed', async ({ page }) => {
    await openGame(page);
    await clickTab(page, 'Practice');
    await page.locator('#choices .lesson-card', { hasText: 'Sparring' }).click();
    await expect(page.locator('#dialogue')).toContainText('Validate basic knowledge');
    await expect(page.locator('#choices .choice-btn', { hasText: 'Step on the verbal mat' })).toHaveCount(0);
  });

  test('community: forums and events render, practitioner gate blocks minors', async ({ page }) => {
    await openGame(page);
    await clickTab(page, 'Community');

    // Forums: pinned support thread first, read-only note visible.
    await page.locator('#choices .lesson-card', { hasText: 'Forums' }).click();
    await expect(page.locator('.activity-card').first()).toContainText('What happens when you fall');
    await expect(page.locator('.activity-card .tag').first()).toContainText('Pinned');
    await expect(page.locator('#dialogue')).toContainText('read-only');

    // Events: format filter narrows the list.
    await page.locator('#controls .control-btn', { hasText: 'Back to Community' }).click();
    await page.locator('#choices .lesson-card', { hasText: 'Events' }).click();
    await expect(page.locator('.activity-card')).toHaveCount(4);
    await page.locator('.filter-row select').selectOption('online');
    await expect(page.locator('.activity-card')).toHaveCount(2);
    await expect(page.locator('.activity-card').first()).toContainText('Online VA Dojo');

    // Find a Practitioner: unverified → DOB gate, no list.
    await page.locator('#controls .control-btn', { hasText: 'Back to Community' }).click();
    await page.locator('#choices .lesson-card', { hasText: 'Find a Practitioner' }).click();
    await expect(page.locator('#dialogue')).toContainText('for adults only');
    await expect(page.locator('.dob-input')).toBeVisible();

    // Minor DOB → alternatives, no practitioner cards.
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 10);
    await page.locator('.dob-input').fill(minorDob.toISOString().slice(0, 10));
    await page.locator('.age-form .choice-btn.primary', { hasText: 'Confirm age' }).click();
    await expect(page.locator('#dialogue')).toContainText("isn't available to players under 18");
    await expect(page.locator('.activity-card')).toHaveCount(0);

    // Age record lives outside the progress save, is locked, and its log
    // records age/minor status and access decisions but never the birthdate.
    const gate = await savedAgeGate(page);
    expect(gate.birthdate).toBe(minorDob.toISOString().slice(0, 10));
    expect(gate.locked).toBe(true);
    const declared = gate.log.filter((e) => e.event === 'age_declared');
    expect(declared.at(-1).detail).toMatchObject({ isMinor: true, locked: true });
    expect(gate.log.some((e) => e.event === 'practitioner_access' && e.detail.decision === 'denied_minor')).toBe(true);
    expect(JSON.stringify(gate.log)).not.toContain(gate.birthdate);
    expect(await savedState(page)).not.toHaveProperty('birthdate');

    // Profile no longer offers the date form — the lock notice replaces it.
    await clickTab(page, 'Profile');
    await expect(page.locator('.dob-input')).toHaveCount(0);
    await expect(page.locator('.age-locked')).toContainText("can't be changed here");

    // "Reset all progress" keeps the age record, so the gate stays closed.
    await clickTab(page, 'Story');
    page.once('dialog', (d) => d.accept());
    await page.locator('#controls .control-btn', { hasText: 'Reset all progress' }).click();
    await clickTab(page, 'Community');
    await page.locator('#choices .lesson-card', { hasText: 'Find a Practitioner' }).click();
    await expect(page.locator('#dialogue')).toContainText("isn't available to players under 18");
    await expect(page.locator('.dob-input')).toHaveCount(0);
    await expect(page.locator('.activity-card')).toHaveCount(0);
    expect((await savedAgeGate(page)).locked).toBe(true);
  });

  test('legacy save with an under-18 birthdate migrates to a locked age record', async ({ page }) => {
    const minorDob = new Date();
    minorDob.setFullYear(minorDob.getFullYear() - 12);
    const iso = minorDob.toISOString().slice(0, 10);
    await page.goto(GAME);
    await page.evaluate(([key, dob]) => {
      localStorage.setItem(key, JSON.stringify({
        currentNodeId: 'chapter_select', currentChapterId: null, meter: 0, history: [],
        unlockedChapters: ['ch1', 'ch2'], birthdate: dob,
        safetyLog: [{ ts: '2026-09-01T00:00:00Z', event: 'age_verify', detail: { birthdate: dob, isMinor: true } }],
      }));
    }, [STORAGE_KEY, iso]);
    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');

    const gate = await savedAgeGate(page);
    expect(gate.birthdate).toBe(iso);
    expect(gate.locked).toBe(true);
    expect(JSON.stringify(gate.log)).not.toContain(iso);
    const st = await savedState(page);
    expect(st).not.toHaveProperty('birthdate');
    expect(st).not.toHaveProperty('safetyLog');
  });

  test('practitioner directory lists sample profiles for adults', async ({ page }) => {
    // Seed an adult age record (unlocked).
    await page.goto(GAME);
    await page.evaluate(([key, ageKey]) => {
      localStorage.setItem(key, JSON.stringify({
        currentNodeId: 'chapter_select', currentChapterId: null, meter: 0, history: [],
        unlockedChapters: ['ch1', 'ch2'],
      }));
      localStorage.setItem(ageKey, JSON.stringify({ birthdate: '1990-01-01', locked: false, log: [] }));
    }, [STORAGE_KEY, AGE_GATE_KEY]);
    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');

    await clickTab(page, 'Community');
    await page.locator('#choices .lesson-card', { hasText: 'Find a Practitioner' }).click();
    await expect(page.locator('.activity-card')).toHaveCount(4);
    await expect(page.locator('.activity-card').first()).toContainText('Green belt');
    await expect(page.locator('.practitioner-note')).toContainText('sample profiles');

    // Language filter narrows the list (French → Marc only).
    await page.locator('.filter-row select').selectOption('fr');
    await expect(page.locator('.activity-card')).toHaveCount(1);
    await expect(page.locator('.activity-card').first()).toContainText('Marc');
  });

  test('extras: sections render and reminder toggle persists', async ({ page }) => {
    await openGame(page);
    await clickTab(page, 'Extras');
    for (const h of ['Multimedia library', 'Practical tips & activities', 'VA Store']) {
      await expect(page.locator('.extras-heading', { hasText: h })).toBeVisible();
    }
    const toggle = page.locator('.reminder-toggle').first();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(page.locator('.reminder-toggle').first()).toHaveAttribute('aria-checked', 'true');

    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');
    await clickTab(page, 'Extras');
    await expect(page.locator('.reminder-toggle').first()).toHaveAttribute('aria-checked', 'true');
  });

  test('profile: belt, stats, and avatar persist', async ({ page }) => {
    // Seed progress that should earn Yellow belt (1 chapter + 1 lesson).
    await page.goto(GAME);
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        currentNodeId: 'chapter_select', currentChapterId: null, meter: 0, history: [],
        unlockedChapters: ['ch1', 'ch2'], completedChapters: ['ch1'],
        unlockedLessons: ['disc_reactive_responses'], completedLessons: ['disc_reactive_responses'],
        sparringSessions: 2, stretchSessions: 1,
      }));
    }, STORAGE_KEY);
    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');

    await clickTab(page, 'Profile');
    await expect(page.locator('.belt-row')).toContainText('Yellow belt');
    const stats = page.locator('.stat-num');
    await expect(stats.nth(0)).toHaveText('1'); // chapters
    await expect(stats.nth(1)).toHaveText('1'); // lessons
    await expect(stats.nth(2)).toHaveText('2'); // sparring
    await expect(stats.nth(3)).toHaveText('1'); // stretching
    await expect(page.locator('.profile-wrap')).toContainText('Next belt (Orange)');

    // Pick an avatar, reload, confirm it persists.
    await page.locator('.avatar-row .avatar').nth(1).click();
    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');
    await clickTab(page, 'Profile');
    const st = await savedState(page);
    expect(st.avatar).toBeTruthy();
    await expect(page.locator('.avatar.picked')).toHaveCount(1);
  });

  test('language selection persists and falls back to English', async ({ page }) => {
    await openGame(page);
    await clickTab(page, 'Profile');
    await page.locator('.profile-wrap select').last().selectOption('fr');

    // No i18n/fr.json yet — UI falls back to English, but the choice persists.
    await page.waitForSelector('#mode-tabs .mode-tab');
    let st = await savedState(page);
    expect(st.language).toBe('fr');
    await expect(page.locator('#mode-tabs .mode-tab', { hasText: 'Story' })).toBeVisible();

    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');
    st = await savedState(page);
    expect(st.language).toBe('fr');
    await expect(page.locator('#mode-tabs .mode-tab', { hasText: 'Story' })).toBeVisible();
  });

  test('chapter progress survives reload mid-story', async ({ page }) => {
    await openGame(page);
    await page.locator('#choices .choice-btn', { hasText: 'Chapter 1' }).first().click();
    await page.locator('#choices .choice-btn.primary', { hasText: 'Start chapter' }).click();
    await page.locator('[data-choice-id="ch1_reply_c"]').click(); // feedback interstitial
    await page.locator('#choices .choice-btn.primary', { hasText: 'Continue' }).click(); // land on retry node

    await page.reload();
    await page.waitForSelector('#mode-tabs .mode-tab');
    // Reload resumes the same node (meter 2, retry choices visible).
    await expect(page.locator('#meter')).toHaveAttribute('aria-valuenow', '2');
    await expect(page.locator('#choices .choice-btn').first()).toBeVisible();
  });
});
