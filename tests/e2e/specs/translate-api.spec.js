// games/translate-api.php: the relay between the games' language picker and
// the backend's /v1/games/translate (AF #125). It used to forward any gameId,
// any targetLang and up to 200 x 4,000 characters, so a signed-in account could
// make the backend run Gemini and email the review recipients with text the
// account chose. It now checks the request against games/translate-config.json
// and caps the total size.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  establishSession,
  stubRequests,
  clearStubRequests,
  SAME_ORIGIN_HEADERS,
} = require('../helpers');

const CONFIG = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'games', 'translate-config.json'), 'utf8'),
);

const URL = '/games/translate-api.php';
const item = (id, text) => ({ id, text });

async function translate(request, body) {
  return request.post(URL, { headers: SAME_ORIGIN_HEADERS, data: { action: 'translate', ...body } });
}

async function backendTranslateCalls(request) {
  const log = await stubRequests(request);
  return log.requests.filter((r) => r.path === '/v1/games/translate');
}

test.beforeEach(async ({ request }) => {
  await clearStubRequests(request);
});

test('the picker languages and the relay allow-list are the same list', async () => {
  const js = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'games', 'translate.js'), 'utf8');
  const block = js.match(/var LANGS = \[([\s\S]*?)\];/)[1];
  const pickerCodes = [...block.matchAll(/\["([A-Za-z-]+)"/g)].map((m) => m[1]);
  expect(pickerCodes.length).toBeGreaterThan(5);
  expect([...CONFIG.languages].sort()).toEqual([...pickerCodes].sort());
});

test('a valid request is forwarded to the backend', async ({ request }) => {
  await establishSession(request);
  const resp = await translate(request, { gameId: 'exercises', targetLang: 'es', items: [item('a', 'Hello')] });
  expect(resp.status()).toBe(200);
  const body = await resp.json();
  expect(body.ok).toBe(true);
  expect(body.items[0].id).toBe('a');
  expect(await backendTranslateCalls(request)).toHaveLength(1);
});

test('every language the picker offers is accepted', async ({ request }) => {
  await establishSession(request);
  for (const lang of CONFIG.languages) {
    const resp = await translate(request, { gameId: 'exercises', targetLang: lang, items: [item('a', 'Hi')] });
    expect(resp.status(), lang).toBe(200);
  }
});

test('every game id on the allow-list is accepted', async ({ request }) => {
  await establishSession(request);
  for (const gameId of CONFIG.games) {
    const resp = await translate(request, { gameId, targetLang: 'es', items: [item('a', 'Hi')] });
    expect(resp.status(), gameId).toBe(200);
  }
});

for (const [label, body] of [
  ['an unknown gameId', { gameId: 'free-for-all', targetLang: 'es', items: [item('a', 'Hi')] }],
  ['an unknown targetLang', { gameId: 'exercises', targetLang: 'tlh', items: [item('a', 'Hi')] }],
  ['a gameId that only looks like an allowed one', { gameId: 'exercises ', targetLang: 'es', items: [item('a', 'Hi')] }],
  ['a language code with different case', { gameId: 'exercises', targetLang: 'ES', items: [item('a', 'Hi')] }],
  ['a non-string gameId', { gameId: ['exercises'], targetLang: 'es', items: [item('a', 'Hi')] }],
  ['no items', { gameId: 'exercises', targetLang: 'es', items: [] }],
  ['more items than the cap', { gameId: 'exercises', targetLang: 'es', items: Array.from({ length: 201 }, (_, i) => item(`i${i}`, 'x')) }],
  ['more total text than the cap', { gameId: 'exercises', targetLang: 'es', items: Array.from({ length: 10 }, (_, i) => item(`i${i}`, 'x'.repeat(3900))) }],
  ['an item over the per-item cap', { gameId: 'exercises', targetLang: 'es', items: [item('a', 'x'.repeat(4001))] }],
]) {
  test(`${label} is a 400 and nothing reaches the backend`, async ({ request }) => {
    await establishSession(request);
    const resp = await translate(request, body);
    expect(resp.status()).toBe(400);
    expect((await resp.json()).ok).toBe(false);
    expect(await backendTranslateCalls(request)).toHaveLength(0);
  });
}

test('signed out: 401 and nothing reaches the backend', async ({ request }) => {
  const resp = await translate(request, { gameId: 'exercises', targetLang: 'es', items: [item('a', 'Hi')] });
  expect(resp.status()).toBe(401);
  expect(await backendTranslateCalls(request)).toHaveLength(0);
});

test('a free-tier account may translate (games stay open to the LinkedIn funnel)', async ({ request }) => {
  await establishSession(request, { email: 'free@example.com' });
  const resp = await translate(request, { gameId: 'lucky-wave', targetLang: 'fr', items: [item('a', 'Hi')] });
  expect(resp.status()).toBe(200);
});

test('dropped items are logged, not silently ignored; valid ones still go through', async ({ request }) => {
  await establishSession(request);
  const resp = await translate(request, {
    gameId: 'exercises', targetLang: 'es',
    items: [item('ok', 'Hello'), { id: '', text: 'no id' }, { id: 'n', text: 5 }],
  });
  expect(resp.status()).toBe(200);
  const calls = await backendTranslateCalls(request);
  expect(calls).toHaveLength(1);
});
