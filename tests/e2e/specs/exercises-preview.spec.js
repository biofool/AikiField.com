// Issue #114: the free preview of Twenty Practices is enforced by the SERVER.
//
// Before, ?src=li (the LinkedIn taste-then-ask landing, issue #101) returned the
// text of all 15 practices in the page and only hid 12 of them in the browser,
// and three dead copies of the book text sat in /games/exercises/data/ for
// anyone to download. Now the text lives once, in data/exercises/practices.json
// (a directory the web server denies), and games/exercises/index.php sends:
//   - a signed-in member: every practice in full;
//   - an anonymous ?src=li visitor: the practices flagged free in full, and the
//     rest as title-only stubs (id, title, part).
//
// This is a security fix, so the spec walks EVERY route that can serve practice
// text: the page, ?src=li, index.php, path slugs, query deep links, the old
// index.html, and every old and new data URL. A new route that serves the text
// must be added to the tables below.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { establishSession } = require('../helpers');

const DATA_FILE = path.join(__dirname, '..', '..', '..', 'data', 'exercises', 'practices.json');
const PRACTICES = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).practices;
const FREE = PRACTICES.filter((p) => p.free === true);
const LOCKED = PRACTICES.filter((p) => p.free !== true);

// Text of the free practices is allowed to appear anywhere; a phrase that a free
// practice shares with a locked one (a source title, say) proves nothing.
const FREE_TEXT = FREE.map((p) => [p.title, p.meta, p.body].join('\n')).join('\n');

/**
 * Plain-character runs of a practice's text. They survive the JSON escaping the
 * page applies (—, ', ...), so they can be searched for in raw HTML.
 */
function probesOf(practice) {
  const runs = [
    ...(practice.body.match(/[A-Za-z0-9 ,.]{25,}/g) || []),
    ...(practice.meta.match(/[A-Za-z0-9 ,.-]{15,}/g) || []),
  ];
  return runs.filter((run) => !FREE_TEXT.includes(run));
}

function expectNoLockedText(text, where) {
  for (const practice of LOCKED) {
    for (const probe of probesOf(practice)) {
      expect(text.includes(probe), `${where}: text of practice ${practice.id} found: "${probe}"`).toBe(false);
    }
  }
}

function expectFreeText(text, where) {
  for (const practice of FREE) {
    const probe = (practice.body.match(/[A-Za-z0-9 ,.]{25,}/g) || [])[0];
    expect(probe, `practice ${practice.id} has a probe`).toBeTruthy();
    expect(text.includes(probe), `${where}: text of free practice ${practice.id} missing`).toBe(true);
  }
}

function expectAllText(text, where) {
  for (const practice of PRACTICES) {
    const probe = (practice.body.match(/[A-Za-z0-9 ,.]{25,}/g) || [])[0];
    expect(probe, `practice ${practice.id} has a probe`).toBeTruthy();
    expect(text.includes(probe), `${where}: text of practice ${practice.id} missing`).toBe(true);
  }
}

// ── The data itself is what the spec assumes ─────────────────────────────────
test.describe('the data this spec relies on', () => {
  test('practices 1, 6 and 12 are free and every locked practice has text to probe for', () => {
    expect(FREE.map((p) => p.id)).toEqual([1, 6, 12]);
    expect(LOCKED).toHaveLength(12);
    for (const practice of LOCKED) {
      expect(probesOf(practice).length, `practice ${practice.id} needs a probe`).toBeGreaterThan(0);
    }
  });
});

// ── Anonymous visitors, every route ──────────────────────────────────────────
// Routes that serve the preview page to an anonymous visitor (?src=li).
const PREVIEW_ROUTES = [
  ['the preview page', '/games/exercises/?src=li'],
  ['index.php, called directly', '/games/exercises/index.php?src=li'],
  ['path slug, free practice', '/games/exercises/wrist-grab-grounding?src=li'],
  ['path slug, free practice by its short name', '/games/exercises/dbso?src=li'],
  ['path slug, free practice with a trailing slash', '/games/exercises/ten-to-the-tenth/?src=li'],
  ['path slug, locked practice', '/games/exercises/ocean-breathing?src=li'],
  ['path slug, locked practice with the longest body', '/games/exercises/shoulder-slap?src=li'],
  ['path slug, locked practice with a trailing slash', '/games/exercises/o2-continuum/?src=li'],
  ['query deep link to a locked practice', '/games/exercises/?src=li&exercise=ocean-breathing'],
  ['query deep link with a studio', '/games/exercises/?src=li&studio_id=city-aikido&exercise=shoulder-slap'],
  ['a slug that is not a practice', '/games/exercises/not-a-practice?src=li'],
  ['the removed data directory is treated as a slug', '/games/exercises/data/?src=li'],
];

// Routes that must send an anonymous visitor to the login page and nothing else.
const GATED_ROUTES = [
  ['the page', '/games/exercises/'],
  ['index.php, called directly', '/games/exercises/index.php'],
  ['the old index.html', '/games/exercises/index.html'],
  ['path slug, free practice', '/games/exercises/wrist-grab-grounding'],
  ['path slug, locked practice', '/games/exercises/ocean-breathing'],
  ['query deep link', '/games/exercises/?exercise=ocean-breathing'],
  ['a tag other than li', '/games/exercises/?src=fb'],
  ['an empty tag', '/games/exercises/?src='],
  ['the removed data directory', '/games/exercises/data/'],
];

// Data URLs. The new directory is denied; the old files are gone.
const DENIED_URLS = [
  '/data/exercises/practices.json',
  '/data/exercises/lightness.json',
  '/data/exercises/.htaccess',
  '/data/exercises/',
  '/data/exercises',
  '/data/exercises/a-file-that-does-not-exist.json',
];
const GONE_URLS = [
  '/games/exercises/data/collected_exercises_app_data.json',
  '/games/exercises/data/collected_exercises_16_app.jsonl',
  '/games/exercises/data/collected_exercises_full_markdown.jsonl',
  '/games/exercises/data/lightness.json',
];

test.describe('anonymous visitors (issue #114)', () => {
  for (const [name, url] of PREVIEW_ROUTES) {
    test(`preview route "${name}": free text only, in the HTML`, async ({ request }) => {
      const resp = await request.get(url, { maxRedirects: 0 });
      expect(resp.status()).toBe(200);
      const html = await resp.text();
      expectFreeText(html, url);
      expectNoLockedText(html, url);
      expect(html).not.toContain('FREE_IDS');
    });
  }

  for (const [name, url] of GATED_ROUTES) {
    test(`gated route "${name}": redirected to the login page, no text`, async ({ request }) => {
      const resp = await request.get(url, { maxRedirects: 0 });
      expect([301, 302, 303]).toContain(resp.status());
      const location = resp.headers()['location'] || '';
      expect(location.startsWith('/login.php?next=') || location === '/games/exercises/').toBe(true);
      const body = await resp.text();
      expectNoLockedText(body, url);
      for (const practice of FREE) {
        for (const probe of probesOf({ ...practice, meta: '' })) {
          expect(body.includes(probe), `${url}: free text in a redirect body`).toBe(false);
        }
      }
    });
  }

  test('?src=li with a session cookie goes through the gate, not the preview', async ({ request }) => {
    // A stale or forged cookie is not a member: the gate redirects, so the
    // visitor never reaches the preview branch with a cookie either.
    const resp = await request.get('/games/exercises/?src=li', {
      maxRedirects: 0,
      headers: { Cookie: 'PHPSESSID=0123456789abcdef0123456789abcdef' },
    });
    expect([302, 303]).toContain(resp.status());
    expect(resp.headers()['location']).toMatch(/^\/login\.php\?next=/);
    expectNoLockedText(await resp.text(), 'forged cookie');
  });

  for (const url of DENIED_URLS) {
    test(`data URL ${url}: denied`, async ({ request }) => {
      const resp = await request.get(url, { maxRedirects: 0 });
      expect(resp.status()).toBe(403);
      const body = await resp.text();
      expect(body).not.toContain('"practices"');
      expectNoLockedText(body, url);
    });
  }

  for (const url of GONE_URLS) {
    test(`old data URL ${url}: gone`, async ({ request }) => {
      const resp = await request.get(url, { maxRedirects: 0 });
      expect(resp.status()).toBe(404);
      expectNoLockedText(await resp.text(), url);
    });
  }

  test('the preview shows three practices; the other twelve are locked stubs', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await expect(page.locator('.ex-chip')).toHaveCount(15);
    await expect(page.locator('.ex-chip.locked')).toHaveCount(12);
    const open = page.locator('.ex-chip:not(.locked)');
    await expect(open).toHaveCount(3);
    await expect(open.first()).toContainText('FREE');
    await expect(page.locator('#authBadge')).toBeHidden();

    // What reached the browser: a locked practice is only id, title and part.
    const shapes = await page.evaluate(() =>
      exercises.filter((e) => !e.free).map((e) => Object.keys(e).sort().join(','))
    );
    expect(shapes).toHaveLength(12);
    expect(new Set(shapes)).toEqual(new Set(['id,part,title']));

    // Each free practice opens with its own text.
    for (const practice of FREE) {
      await page.locator('.ex-chip', { hasText: practice.title }).click();
      await expect(page.locator('#player h2')).toHaveText(practice.title);
      const probe = (practice.body.match(/[A-Za-z0-9 ,.]{25,}/g) || [])[0];
      expect(await page.locator('#player .body').innerText()).toContain(probe);
    }
  });

  test('a locked chip opens the sign-in modal and leaves the player alone', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    const before = await page.locator('#player h2').innerText();
    await page.locator('.ex-chip.locked').first().click();
    await expect(page.locator('#lockModal')).toBeVisible();
    await expect(page.locator('#lockModal a[href^="/login.php"]')).toBeVisible();
    await page.locator('#lockClose').click();
    await expect(page.locator('#lockModal')).toHaveCount(0);
    expect(await page.locator('#player h2').innerText()).toBe(before);
  });

  test('a deep link to a locked practice shows the modal, not the text', async ({ page }) => {
    await page.goto('/games/exercises/ocean-breathing?src=li');
    await expect(page.locator('#lockModal')).toBeVisible();
    await expect(page.locator('#lockModal h2')).toHaveText('Ocean Breathing');
    // The player still shows a practice the visitor may read.
    await expect(page.locator('#player h2')).toHaveText('Wrist Grab Grounding');
    await expect(page.locator('.ex-chip.active')).toContainText('Wrist Grab Grounding');
  });

  test('a visitor who signs in elsewhere is offered a reload, which unlocks everything', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await expect(page.locator('.ex-chip.locked')).toHaveCount(12);
    await establishSession(page.request); // sign in "in another tab": same cookie jar
    await page.evaluate(() => checkSignedIn());
    const badge = page.locator('#authBadge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('reload to unlock');
    await Promise.all([page.waitForNavigation(), badge.getByRole('link').click()]);
    await expect(page.locator('.ex-chip')).toHaveCount(15);
    await expect(page.locator('.ex-chip.locked')).toHaveCount(0);
  });
});

// ── Signed-in members ───────────────────────────────────────────────────────
const MEMBER_ROUTES = [
  ['the page', '/games/exercises/'],
  ['?src=li with a session', '/games/exercises/?src=li'],
  ['index.php, called directly', '/games/exercises/index.php'],
  ['path slug, free practice', '/games/exercises/wrist-grab-grounding'],
  ['path slug, locked practice', '/games/exercises/ocean-breathing'],
];

test.describe('signed-in members (issue #114)', () => {
  test.beforeEach(async ({ request }) => {
    const session = await establishSession(request);
    expect(session.body.ok).toBe(true);
  });

  for (const [name, url] of MEMBER_ROUTES) {
    test(`member route "${name}": every practice, never cacheable`, async ({ request }) => {
      const resp = await request.get(url);
      expect(resp.status()).toBe(200);
      expectAllText(await resp.text(), url);
      const cache = resp.headers()['cache-control'] || '';
      expect(cache).toContain('no-store');
      expect(cache).toContain('private');
    });
  }

  for (const url of [...DENIED_URLS]) {
    test(`data URL ${url}: denied to members too`, async ({ request }) => {
      expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(403);
    });
  }

  for (const url of GONE_URLS) {
    test(`old data URL ${url}: gone for members too`, async ({ request }) => {
      expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(404);
    });
  }

  test('a member sees all fifteen unlocked at once, with the badge', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true); // the page has its own cookie jar
    await page.goto('/games/exercises/');
    await expect(page.locator('.ex-chip')).toHaveCount(15);
    await expect(page.locator('.ex-chip.locked')).toHaveCount(0);
    await expect(page.locator('#authBadge')).toBeVisible();
    expect(await page.evaluate(() => exercises.every((e) => typeof e.body === 'string' && e.body.length > 0))).toBe(true);

    // A normally locked practice opens with its own text.
    const shoulderSlap = PRACTICES.find((p) => p.id === 14);
    await page.locator('.ex-chip', { hasText: shoulderSlap.title }).click();
    await expect(page.locator('#lockModal')).toHaveCount(0);
    await expect(page.locator('#player h2')).toHaveText(shoulderSlap.title);
    const probe = (shoulderSlap.body.match(/[A-Za-z0-9 ,.]{25,}/g) || [])[0];
    expect(await page.locator('#player .body').innerText()).toContain(probe);
  });
});
