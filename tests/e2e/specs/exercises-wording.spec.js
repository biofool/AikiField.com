// Issue #111: mechanical wording errors, literal asterisks, and part-tab counts.
//
// Only the errors the ticket lists as mechanical are fixed. Everything that is
// the author's voice (the O2 Continuum lines, the run-on lines in practice 12,
// the lowercase title of practice 2, "Venusial", the CABW spellings and the
// DBSO part tag) is left alone until he says yes or no.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { establishSession } = require('../helpers');

const PRACTICES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'exercises', 'practices.json'), 'utf8')
).practices;
const byId = (id) => PRACTICES.find((p) => p.id === id);
const partKey = (p) => p.part.split(' — ')[0];

// The exact strings the ticket names, and what they must become.
const TICKET_STRINGS = [
  ['*Down the Scale (Contrast Step)*', '<em>Down the Scale (Contrast Step)</em>'],
  ['*Solo · 1–2 min · Ten to the Tenth*', '<em>Solo · 1–2 min · Ten to the Tenth</em>'],
  ['*Getting to 10*', '<em>Getting to 10</em>'],
  ['*Quantum Shift*', '<em>Quantum Shift</em>'],
  ['*Attacker***.**', '<em>Attacker</em><strong>.</strong>'],
  ['*Receiver***.**', '<em>Receiver</em><strong>.</strong>'],
];

async function openAsMember(page) {
  expect((await establishSession(page.request)).body.ok).toBe(true);
  await page.goto('/games/exercises/');
  await expect(page.locator('.ex-chip')).toHaveCount(PRACTICES.length);
}

async function open(page, practice) {
  await page.locator('.ex-chip', { hasText: practice.title }).click();
  await expect(page.locator('#player h2')).toHaveText(practice.title);
}

test.describe('emphasis marks are rendered, never shown as asterisks (issue #111)', () => {
  test('the helper turns each string from the ticket into emphasis and strong text', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    for (const [source, expected] of TICKET_STRINGS) {
      expect(await page.evaluate((s) => inlineMarkup(s), source), source).toBe(expected);
    }
  });

  test('the helper escapes first: markup in the text stays text', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    const hostile = '<img src=x onerror="window.__wordingXss=1"> & <b>bold</b> *kept* **strong**';
    const html = await page.evaluate((s) => inlineMarkup(s), hostile);
    expect(html).toBe(
      '&lt;img src=x onerror=&quot;window.__wordingXss=1&quot;&gt; &amp; &lt;b&gt;bold&lt;/b&gt; <em>kept</em> <strong>strong</strong>'
    );
    const made = await page.evaluate((s) => {
      const host = document.createElement('div');
      host.innerHTML = inlineMarkup(s);
      return { tags: [...host.querySelectorAll('*')].map((el) => el.tagName), text: host.textContent };
    }, hostile);
    expect(made.tags).toEqual(['EM', 'STRONG']);
    expect(made.text).toBe('<img src=x onerror="window.__wordingXss=1"> & <b>bold</b> kept strong');
    expect(await page.evaluate(() => window.__wordingXss)).toBeUndefined();
  });

  test('a star with no partner stays a star', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    for (const text of ['5 * 3', 'a ** b', 'x*', '*', '**', 'no marks here']) {
      expect(await page.evaluate((s) => inlineMarkup(s), text), text).toBe(text);
    }
  });

  test('no practice shows a literal asterisk, and 12 and 14 show their emphasis as emphasis', async ({ page }) => {
    await openAsMember(page);
    for (const practice of PRACTICES) {
      await open(page, practice);
      const text = await page.locator('#player .body').innerText();
      expect(text.includes('*'), `practice ${practice.id} shows an asterisk`).toBe(false);
    }
    await open(page, byId(12));
    await expect(page.locator('#player .body em')).toHaveText([
      'Down the Scale (Contrast Step)',
      'Solo · 1–2 min · Ten to the Tenth',
      'Getting to 10',
      'Quantum Shift',
    ]);
    await open(page, byId(14));
    await expect(page.locator('#player .body em')).toHaveText(['Attacker', 'Receiver']);
    await expect(page.locator('#player .body strong')).toHaveText(['.', '.']);
  });

  test('the same text reaches an anonymous visitor without asterisks', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await page.locator('.ex-chip', { hasText: byId(12).title }).click();
    expect(await page.locator('#player .body').innerText()).not.toContain('*');
    await expect(page.locator('#player .body em')).toHaveCount(4);
  });
});

test.describe('the mechanical wording errors are fixed (issue #111)', () => {
  test('practice 12: Relabel, the space after Square away, one space in "climbing to 4"', async ({ page }) => {
    await openAsMember(page);
    await open(page, byId(12));
    const text = await page.locator('#player .body').innerText();
    expect(text).toContain("Relabel 10 as a new '1'");
    expect(text).toContain("'Square away' your posture");
    expect(text).toContain('After climbing to 4,');
    expect(text).not.toContain('Rlabel');
    expect(text).not.toContain("away'your");
    expect(text).not.toContain('climbing to  4');
  });

  test('practice 14: the two glued sentences are two sentences', async ({ page }) => {
    await openAsMember(page);
    await open(page, byId(14));
    const text = await page.locator('#player .body').innerText();
    expect(text).toContain('Give the most honest feedback you can. Progress from one step to two.');
    expect(text).not.toContain('canProgress');
  });
});

test.describe('part tabs count the practices they list (issue #111)', () => {
  // Part I = 2-6 (5), Part II = 7-11 (5), Part III = 12-14 (3), Part IV = 1 and 15 (2): the ticket's own numbers.
  const EXPECTED_LABELS = ['All 15', 'Part I · centering (5)', 'Part II · breath (5)', 'Part III · attention (3)', 'Part IV · dialogue (2)'];

  function idsInPart(key) {
    return PRACTICES.filter((p) => partKey(p) === key).map((p) => p.id);
  }

  async function chipIds(page) {
    return (await page.locator('.ex-chip').evaluateAll((els) => els.map((el) => Number(el.dataset.id)))).sort((a, b) => a - b);
  }

  async function checkTabs(page) {
    const labels = await page.locator('#partTabs .chip').allInnerTexts();
    expect(labels).toEqual(EXPECTED_LABELS);
    // The numbers are the data's, not typed: recount from the file.
    for (const [key, count] of [['Part I', 5], ['Part II', 5], ['Part III', 3], ['Part IV', 2]]) {
      expect(idsInPart(key)).toHaveLength(count);
    }
    expect(PRACTICES).toHaveLength(15);

    for (const label of labels) {
      await page.locator('#partTabs .chip', { hasText: label }).click();
      const shown = await chipIds(page);
      const key = label.startsWith('All') ? 'all' : label.split(' · ')[0];
      const expectedIds = key === 'all' ? PRACTICES.map((p) => p.id) : idsInPart(key);
      expect(shown, `tab "${label}"`).toEqual(expectedIds.slice().sort((a, b) => a - b));
      const number = Number(label.match(/(\d+)\)?$/)[1]);
      expect(shown.length, `the number in "${label}" is the number listed`).toBe(number);
      await expect(page.locator('#partTabs .chip.active')).toHaveText(label);
    }
  }

  test('a member: every tab lists exactly the practices it counts', async ({ page }) => {
    await openAsMember(page);
    await checkTabs(page);
  });

  test('an anonymous visitor: same labels, counted over the stubs too', async ({ page }) => {
    await page.goto('/games/exercises/?src=li');
    await expect(page.locator('.ex-chip')).toHaveCount(15);
    await checkTabs(page);
  });

  test('the Part I tab no longer lists the other parts', async ({ page }) => {
    await openAsMember(page);
    await page.locator('#partTabs .chip', { hasText: 'Part I ·' }).click();
    await expect(page.locator('.ex-chip')).toHaveCount(5);
    await expect(page.locator('.ex-chip').first()).toContainText('2. ');
  });

  test('a re-render (as after a translation) keeps the chosen tab and its filter', async ({ page }) => {
    await openAsMember(page);
    await page.locator('#partTabs .chip', { hasText: 'Part III' }).click();
    await page.evaluate(() => { renderPartTabs(); renderExList(currentPart); });
    await expect(page.locator('#partTabs .chip.active')).toHaveText('Part III · attention (3)');
    await expect(page.locator('.ex-chip')).toHaveCount(3);
  });

  test('a cached translation holds no number: the count is added after it', async ({ page }) => {
    await openAsMember(page);
    await page.evaluate(() => {
      TR['part.Part I'] = 'Parte I · centrado (6)'; // a stale cache entry from the old hand-typed labels
      TR['tab.Part II'] = 'Parte II · respiración'; // what the page asks to have translated now: no number
      renderPartTabs();
    });
    const labels = await page.locator('#partTabs .chip').allInnerTexts();
    expect(labels[1]).toBe('Part I · centering (5)'); // the old key is ignored, so a stale "(6)" never shows
    expect(labels[2]).toBe('Parte II · respiración (5)'); // the new key is used, and the count is the data's
    expect(await page.evaluate(() => AF_GAME.collect().filter((i) => i.id.startsWith('tab.')).map((i) => [i.id, i.text]))).toEqual([
      ['tab.all', 'All'],
      ['tab.Part I', 'Part I · centering'],
      ['tab.Part II', 'Part II · breath'],
      ['tab.Part III', 'Part III · attention'],
      ['tab.Part IV', 'Part IV · dialogue'],
    ]);
  });

  test('the tabs follow the data: a changed tag moves the practice and both counts', async ({ page }) => {
    await openAsMember(page);
    // As if the author moved DBSO to Part I.
    await page.evaluate(() => {
      exercises.find((e) => e.id === 1).part = 'Part I — centering & grounding';
      renderPartTabs();
    });
    expect(await page.locator('#partTabs .chip').allInnerTexts()).toEqual([
      'All 15',
      'Part I · centering (6)',
      'Part II · breath (5)',
      'Part III · attention (3)',
      'Part IV · dialogue (1)',
    ]);
  });
});
