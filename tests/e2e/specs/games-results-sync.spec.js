// Ride the Lucky Wave results follow the player's AI Chat account.
// AikiField's games/results.php proxies to the AI Chat backend's
// POST /v1/game-results/sync (stubbed here with the real shape); ai-coach.php
// saves the AI answer through the same endpoint. Merge / cap / validation /
// isolation rules belong to the backend and are tested in AIRichardMoon
// backend/tests/test_game_results.py — this spec covers what AikiField owns.

const { test, expect } = require('@playwright/test');
const {
  establishSession, ADMIN_EMAIL, resetStubGameResults, stubGameResultsMissing, stubGameResultsLastRequest,
} = require('../helpers');

const SYNC = '/games/results.php';
const V2 = '/games/lucky-wave/RideTheLuckyWaveV2.php';
const SCORES = { activate: 2, access: 5, declare: 3, launch: 1 };
const T0 = Date.UTC(2026, 9, 1, 12);
const round = (at, extra = {}) => ({ at, mode: 'rmoone', scores: SCORES, ...extra });
const SYNCED_NOTE = 'Your results are saved to your Unified Field Chat account.';

test.beforeEach(async ({ request }) => resetStubGameResults(request));
// Also after: the "endpoint missing" switch must not leak into other specs.
test.afterEach(async ({ request }) => resetStubGameResults(request));

async function sync(request, results = []) {
  const resp = await request.post(SYNC, { data: { game: 'lucky-wave', results } });
  return { status: resp.status(), body: await resp.json() };
}

test.describe('results.php (proxy to the AI Chat backend)', () => {
  test('signed out: answers locally and never calls the backend', async ({ request }) => {
    expect((await sync(request, [round(T0)])).body).toEqual({ ok: true, signedIn: false });
    expect(await stubGameResultsLastRequest(request)).toBeNull();
  });

  test('signed in: forwards only at/mode/scores — never AI text from the browser', async ({ request }) => {
    await establishSession(request);
    const { body } = await sync(request, [round(T0, { aiResponse: 'forged', aiVideo: { url: 'https://youtu.be/x' }, email: 'x@y.z' })]);
    expect(body.signedIn).toBe(true);
    expect(body.results).toEqual([round(T0)]);
    expect(await stubGameResultsLastRequest(request)).toEqual({ game: 'lucky-wave', results: [round(T0)] });
  });

  test('backend without the endpoint (404): falls back to browser-only storage', async ({ request }) => {
    await establishSession(request);
    await stubGameResultsMissing(request);
    expect((await sync(request, [round(T0)])).body).toEqual({ ok: true, signedIn: false, unavailable: true });
  });

  test("ai-coach.php saves the AI Chat's own answer on the round", async ({ request }) => {
    await establishSession(request);
    await sync(request, [round(T0)]);
    const ai = await request.post('/games/ai-coach.php', {
      data: { game: 'lucky-wave', mode: 'rmoone', scores: SCORES, resultAt: T0 } });
    expect(ai.status()).toBe(200);
    const saved = (await sync(request)).body.results[0];
    expect(saved.aiResponse).toMatch(/^STUB CHAT .*Take Musu — 1\/5/);
    expect(saved.aiVideo).toEqual({ title: 'Blending practice', url: 'https://www.youtube.com/watch?v=stubVideo01&t=42s' });
  });

  test('rejects GET, cross-origin POSTs and unknown games', async ({ request }) => {
    expect((await request.get(SYNC)).status()).toBe(405);
    expect((await request.post(SYNC, { data: { game: 'lucky-wave', results: [] }, headers: { Origin: 'https://evil.example' } })).status()).toBe(403);
    expect((await request.post(SYNC, { data: { game: 'chess', results: [] } })).status()).toBe(400);
  });
});

async function playRound(page) {
  await page.goto(V2);
  await page.getByRole('button', { name: 'Adventure (Skip to Start)' }).click();
  await page.getByRole('button', { name: 'Begin Ki Activation' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next screen' }).click();
  for (const n of ['Center: Stirring', 'Attune: Unified-Field', 'Voice the Ki: Blending', 'Take Musu: Absent']) {
    await page.getByRole('button', { name: n }).click();
  }
  await page.getByRole('button', { name: /Receive Whisperings/ }).click();
  await expect(page.getByText('Even partial activation shifts the field.')).toBeVisible();
}

async function openIntro(page) {
  await page.goto(V2);
  await page.getByRole('button', { name: 'Adventure (Skip to Start)' }).click();
}

test.describe('Lucky Wave UI', () => {
  test('a round played on one device shows up on another after sign-in', async ({ browser, baseURL }) => {
    const phone = await browser.newContext({ baseURL });
    const pPage = await phone.newPage();
    await establishSession(pPage.request);
    await playRound(pPage);
    await expect.poll(async () => (await sync(pPage.request)).body.results.length).toBe(1);

    const laptop = await browser.newContext({ baseURL }); // empty localStorage
    const lPage = await laptop.newPage();
    await establishSession(lPage.request);
    await openIntro(lPage);
    await expect(lPage.getByText(SYNCED_NOTE)).toBeVisible();
    await lPage.getByRole('button', { name: /View your last result/ }).click();
    await expect(lPage.getByText('Absent', { exact: true })).toBeVisible();
    await phone.close();
    await laptop.close();
  });

  test('a round stored while signed out is added to the account at the next sign-in', async ({ page }) => {
    // The game is members-only now (issue #71) — an unsigned visitor can no
    // longer play a round. Seed localStorage the way a pre-gate round (or an
    // offline round from an earlier session) would have left it, then sign in.
    await page.goto('/digital-experience/');
    await page.evaluate((r) => localStorage.setItem('waveLuck_results', JSON.stringify([r])),
      { v: 1, at: T0, mode: 'rmoone', scores: SCORES });
    await establishSession(page.request);
    await openIntro(page);
    await expect(page.getByText(SYNCED_NOTE)).toBeVisible();
    expect((await sync(page.request)).body.results).toHaveLength(1);
  });

  test("another account signing in on the same browser does not get the first account's rounds", async ({ page }) => {
    await establishSession(page.request);
    await playRound(page);
    await expect.poll(async () => (await sync(page.request)).body.results.length).toBe(1);

    await page.request.post('/login.php', { form: { action: 'logout' }, maxRedirects: 0 });
    expect((await establishSession(page.request, { email: ADMIN_EMAIL })).body.ok).toBe(true);
    await openIntro(page);
    await expect(page.getByText(SYNCED_NOTE)).toBeVisible();
    expect((await sync(page.request)).body.results).toEqual([]);
    await expect(page.getByRole('button', { name: /View your last result/ })).toHaveCount(0);
  });

  test('backend without the endpoint: the game still stores rounds locally', async ({ page }) => {
    await establishSession(page.request);
    await stubGameResultsMissing(page.request);
    await playRound(page);
    await openIntro(page);
    await expect(page.getByRole('button', { name: /View your last result/ })).toBeVisible();
    await expect(page.getByText(SYNCED_NOTE)).toHaveCount(0);
  });
});
