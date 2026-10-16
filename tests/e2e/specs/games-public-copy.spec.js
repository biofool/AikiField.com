// Issue #112: planning notes, prices and placeholder copy must not appear on a
// page that players or search engines see.
//
// The Twenty Practices page showed a business plan (FREEMIUM MODEL, CREATOR
// $12/mo, DOJO $49/mo, "30% rev share"), a developer panel of deep-link
// examples, an image-copy brief and the labels "FROM YOUR PDF" and
// "AUTO-LOADED FROM MARKDOWN". /games/terms/ held the same notes instead of
// terms, and the /games/ hub printed route strings. Counts on the page also
// disagreed with the data (20 vs 15, 60 vs 20).
//
// The text is read with innerText (what a player sees), not from the raw HTML:
// the page source legitimately contains JS template literals with "$".

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { establishSession } = require('../helpers');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data', 'exercises');
const PRACTICES = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'practices.json'), 'utf8')).practices;
const STUDIOS = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'studios.json'), 'utf8')).studios;
const FREE_TITLES = PRACTICES.filter((p) => p.free === true).map((p) => p.title);

// Case-sensitive on purpose: these are the exact strings the ticket names.
const BANNED = ['$', 'rev share', 'FROM YOUR PDF', 'AUTO-LOADED', 'Creator', 'Dojo', 'Route:'];
// More planning-note wording, matched without regard to case.
const BANNED_PATTERNS = [/freemium/i, /lead magnet/i, /\bTODO\b/i, /completed ids/i, /image copy/i, /routing/i, /will load at/i, /deep link/i, /markdown/i];

// The hub keeps its three COMING SOON cards (owner decision), and one of them is
// titled "Dojo Tycoon". That exact title is the only allowed use of "Dojo".
const ALLOWED_TITLES = ['Dojo Tycoon'];

async function visibleText(page) {
  return page.locator('body').innerText();
}

function expectCleanPlayerText(text, where) {
  let checked = text;
  for (const allowed of ALLOWED_TITLES) checked = checked.split(allowed).join('');
  for (const token of BANNED) {
    expect(checked.includes(token), `${where}: visible text contains "${token}"`).toBe(false);
  }
  for (const pattern of BANNED_PATTERNS) {
    expect(pattern.test(checked), `${where}: visible text matches ${pattern}`).toBe(false);
  }
}

test.describe('no internal notes on player-facing pages (issue #112)', () => {
  test('/games/ hub', async ({ page }) => {
    await page.goto('/games/');
    expectCleanPlayerText(await visibleText(page), '/games/');
  });

  test('/games/terms/', async ({ page }) => {
    await page.goto('/games/terms/');
    expectCleanPlayerText(await visibleText(page), '/games/terms/');
  });

  test('/games/exercises/ as an anonymous LinkedIn visitor, including the sign-in modal', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await expect(page.locator('.ex-chip')).toHaveCount(PRACTICES.length);
    expectCleanPlayerText(await visibleText(page), '/games/exercises/?src=li');
    await page.locator('.ex-chip.locked').first().click();
    await expect(page.locator('#lockModal')).toBeVisible();
    expectCleanPlayerText(await visibleText(page), 'the sign-in modal');
  });

  test('/games/exercises/ as a member, on every practice and with a studio picked', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/games/exercises/');
    await expect(page.locator('.ex-chip')).toHaveCount(PRACTICES.length);
    await page.locator('#studioList .studio').first().click();
    expectCleanPlayerText(await visibleText(page), '/games/exercises/ with a studio');
    for (const practice of PRACTICES) {
      await page.locator('.ex-chip', { hasText: practice.title }).click();
      await expect(page.locator('#player h2')).toHaveText(practice.title);
      expectCleanPlayerText(await visibleText(page), `practice ${practice.id}`);
    }
  });

  test('the checker itself catches what it should', async ({ page }) => {
    await page.setContent('<main><p>CREATOR $12/mo</p><p>30% rev share</p><p>Route: /games/x/</p></main>');
    const text = await visibleText(page);
    expect(() => expectCleanPlayerText(text, 'fixture')).toThrow();
    expect(() => expectCleanPlayerText('Dojo Tycoon is coming soon', 'hub fixture')).not.toThrow();
    expect(() => expectCleanPlayerText('The Dojo plan', 'fixture')).toThrow();
  });
});

test.describe('the public pages say something a player can use (issue #112)', () => {
  test('/games/terms/ is one neutral line, not a business plan', async ({ page }) => {
    await page.goto('/games/terms/');
    await expect(page.locator('main h1')).toHaveText('Terms - AikiField Games');
    const paragraphs = await page.locator('main p').allInnerTexts();
    expect(paragraphs).toEqual(['These terms are being finalised. Questions: use the contact form.']);
    await expect(page.locator('main p a')).toHaveAttribute('href', '/contact.html');
  });

  test('/games/privacy/ heading holds no URL path; the legal text is untouched', async ({ page }) => {
    await page.goto('/games/privacy/');
    const heading = await page.locator('main h1').innerText();
    expect(heading).toBe('Privacy Policy - AikiField Games');
    expect(heading).not.toContain('/');
    await expect(page.locator('main h2')).toHaveText('Sign in with LinkedIn');
    await expect(page.locator('main')).toContainText('Visits that begin from a tagged LinkedIn link');
  });

  test('/games/ hub keeps its four cards, three of them COMING SOON, and prints no route', async ({ page }) => {
    await page.goto('/games/');
    await expect(page.locator('.card')).toHaveCount(4);
    await expect(page.locator('.card .badge', { hasText: 'COMING SOON' })).toHaveCount(3);
    for (const title of ['Twenty Practices', 'Dojo Tycoon', 'Ten to the Tenth Challenge', 'Slow Your Roll']) {
      await expect(page.locator('.card h2', { hasText: title })).toHaveCount(1);
    }
    const text = await visibleText(page);
    expect(text).not.toMatch(/\/games\/|\/exercises\/|\/digital-experience\//);
  });
});

test.describe('counts on /games/exercises/ come from the data (issue #112)', () => {
  test('an anonymous page names itself a preview, with the real count, and no price', async ({ page, request }) => {
    await page.goto('/games/exercises/?src=li');
    await expect(page).toHaveTitle('Twenty Practices: a short preview — AikiField Games');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toContain('A short preview of Twenty Practices');
    expect(description).toContain(`Sign in free to unlock all ${PRACTICES.length}.`);
    expect(description).not.toMatch(/\$|free:/i);
    // The head is in the raw HTML too: a link-preview crawler reads that, not the DOM.
    const html = await (await request.get('/games/exercises/?src=li')).text();
    expect(html).toContain(`Sign in free to unlock all ${PRACTICES.length}.`);
  });

  test('a member page does not call itself a preview', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/games/exercises/');
    await expect(page).toHaveTitle('Twenty Practices — AikiField Games');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).not.toMatch(/preview|free:/i);
  });

  test('the sign-in modal names the free practices from the data and the real count', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await page.locator('.ex-chip.locked').first().click();
    const modal = await page.locator('#lockModal').innerText();
    expect(FREE_TITLES.length).toBe(3);
    for (const title of FREE_TITLES) expect(modal).toContain(title);
    expect(modal).toContain(`Unlock all ${PRACTICES.length} with a free AikiField account.`);
    expect(modal).not.toContain('15+5');
    expect(modal).not.toContain('DBSO, Wrist Grab Grounding, Ten to the Tenth.'); // the old hand-typed list
  });

  test('the sign-in modal follows the free flag in the data, not a typed list', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await page.evaluate(() => {
      exercises.find((e) => e.id === 12).free = false; // as if the data no longer flagged it
    });
    await page.locator('.ex-chip.locked').first().click();
    const modal = await page.locator('#lockModal').innerText();
    expect(modal).toContain(PRACTICES.find((p) => p.id === 1).title);
    expect(modal).toContain(PRACTICES.find((p) => p.id === 6).title);
    expect(modal).not.toContain(PRACTICES.find((p) => p.id === 12).title);
  });

  test('the member badge counts the practices on the page', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/games/exercises/');
    await expect(page.locator('#authBadge')).toContainText(`all ${PRACTICES.length} practices unlocked`);
    await expect(page.locator('.ex-chip')).toHaveCount(PRACTICES.length);
    await expect(page.locator('#progress')).toContainText(`/${PRACTICES.length}`);
  });

  test('the studio heading counts the studios listed', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await expect(page.locator('#studioList .studio')).toHaveCount(STUDIOS.length);
    await expect(page.locator('#studioHeading')).toHaveText(`${STUDIOS.length} STUDIOS · PERSONALIZATION`);
    expect(STUDIOS.length).toBeGreaterThan(0);
  });

  test('the panel, the labels and the debug line are gone', async ({ page }) => {
    expect((await establishSession(page.request)).body.ok).toBe(true);
    await page.goto('/games/exercises/');
    await expect(page.locator('.deploy')).toHaveCount(0);
    await expect(page.locator('#pdots')).toHaveCount(0);
    await page.locator('#keepB').click(); // logging used to refresh the "Completed IDs" line
    await expect(page.locator('#pdots')).toHaveCount(0);
    await expect(page.locator('.right')).not.toContainText(/model|free|practices always/i);
    // The two groups keep an accessible name without any visible developer label.
    await expect(page.locator('#partTabs')).toHaveAttribute('aria-label', 'Parts');
    await expect(page.locator('#exList')).toHaveAttribute('aria-label', 'Practices');
  });
});

test.describe('the studio list (issue #112)', () => {
  test('shows each studio by name and area only', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    const rows = await page.locator('#studioList .studio').allInnerTexts();
    expect(rows).toHaveLength(STUDIOS.length);
    STUDIOS.forEach((studio, i) => {
      expect(rows[i].replace(/\s+/g, ' ').trim()).toBe(`${studio.name} ${studio.region}`);
    });
  });

  test('no blurb and no street address is in the page source or the data it is built from', async ({ request }) => {
    const html = await (await request.get('/games/exercises/?src=li')).text();
    for (const fragment of [
      '1514 University Ave',
      '182 Thorndon Quay',
      '107 Customhouse Quay',
      'Movement is Medicine',
      'remedial massage',
      'Home dojo of Robert Nadeau',
      'Aikido dojo', // the old category column
    ]) {
      expect(html.includes(fragment), `page source contains "${fragment}"`).toBe(false);
    }
    expect(Object.keys(STUDIOS[0]).sort()).toEqual(['name', 'region']);
  });

  test('the search box filters by name', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await page.locator('#search').fill('pilates');
    const expected = STUDIOS.filter((s) => s.name.toLowerCase().includes('pilates')).length;
    expect(expected).toBeGreaterThan(0);
    await expect(page.locator('#studioList .studio')).toHaveCount(expected);
  });

  test('choosing a studio, or arriving with ?studio_id=, shows the banner with the name only', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await page.locator('#studioList .studio', { hasText: 'City Aikido' }).click();
    const banner = page.locator('#banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText(
      'Practicing for City Aikido students — Twenty practices from the work of Richard Moon to improve physical performance + creativity.'
    );
    await expect(banner.locator('strong')).toHaveText('City Aikido');
    await expect(page.locator('#studioList .studio.active')).toHaveCount(1);

    await page.goto('/games/exercises/?src=li&studio_id=aikido-of-berkeley');
    await expect(page.locator('#banner')).toContainText('Practicing for Aikido of Berkeley students');
    await expect(page.locator('#banner')).not.toContainText('University');
  });

  test('a studio name is shown as text, never as markup', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await page.evaluate(() => {
      studios.length = 0;
      studios.push({ name: '<img src=x onerror="window.__studioXss=1">"quoted"', region: '<b>area</b>' });
      renderStudios();
    });
    const row = page.locator('#studioList .studio');
    await expect(row).toHaveCount(1);
    await expect(row.locator('strong')).toHaveText('<img src=x onerror="window.__studioXss=1">"quoted"');
    expect(await row.evaluate((el) => el.querySelectorAll('img, b').length)).toBe(0);
    await row.click();
    await expect(page.locator('#banner strong')).toHaveText('<img src=x onerror="window.__studioXss=1">"quoted"');
    expect(await page.evaluate(() => window.__studioXss)).toBeUndefined();
  });
});
