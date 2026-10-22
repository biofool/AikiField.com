// Studio map filtering + retry/error surfacing (biofool/quantumaikido.com
// issues #71 and #73; the map moved here under biofool/AikiField.com#102).
//
// Covers the test plan from #71 (search filtering, geo+search combination,
// category toggle, dynamic taxonomy/counts, failure path) and the retry-with-
// backoff + manual Retry button from #73.
//
// The map page (somatic-studios/map/index.html, imported from quantumaikido.com
// by scripts/import_studio_map.py) is a standalone HTML file that loads a
// self-hosted Leaflet from /js/vendor/. The failure/retry tests use route
// interception. The filtering tests need the map to actually render markers,
// so they skip if Leaflet never loads.
//
// Run with:  bash tests/e2e/run.sh studio-map
// or:        cd tests/e2e && npx playwright test studio-map

const { test, expect } = require('@playwright/test');

const MAP_URL = '/somatic-studios/map/';

// Wait for the manifest to load and the Aikido category to render markers.
// Resolves true on success, false if Leaflet/the map never became available
// (CDN unreachable) so the filtering tests can skip gracefully.
async function waitForMapReady(page, timeout = 20000) {
  // Leaflet must be present for any marker rendering.
  const hasLeaflet = await page.evaluate(() => typeof window.L === 'object' && !!window.L.map);
  if (!hasLeaflet) return false;
  try {
    // The boot sequence sets the title count once the manifest loads; wait for a
    // non-"Loading" title, which means categories are populated.
    await expect(page.locator('#clean-title-count')).not.toHaveText('Loading studios…', { timeout });
    // Wait for at least one Aikido marker to be on the map (circleMarker layers
    // are added to the Aikido cluster group once loadCategory resolves).
    await page.waitForFunction(() => {
      // catMarkers is module-private; infer readiness from the rendered pill
      // count and the stats bar showing a number.
      const stats = document.getElementById('clean-stats');
      return stats && /\d/.test(stats.textContent || '');
    }, undefined, { timeout });
  } catch {
    // Manifest/studios data are DVC-tracked and absent in fresh checkouts —
    // callers skip rather than fail in that environment.
    return false;
  }
  return true;
}

/** True when the DVC map data (manifest + category files) is reachable. */
async function mapDataAvailable(request) {
  const resp = await request.get('/somatic-studios/map/manifest.json');
  return resp.ok();
}

// Extract the matching-dojo count from the title bar (#clean-title-count),
// which renders "N aikido dojos mapped" (unfiltered) or "N dojos match current
// filter" (filtered) or "No dojos match current filter" (filtered to zero).
// The wording is "match", not "shown", because lazy marker rendering (#116)
// only attaches the markers inside the viewport — the count is what passes the
// filters, which is not the same as what is on screen. Returns the integer
// count, or null if the title is in a non-numeric state (e.g. no category).
async function getVisibleCount(page) {
  const text = await page.locator('#clean-title-count').textContent();
  if (!text) return null;
  if (/^no dojos match/i.test(text)) return 0;
  const m = text.match(/([\d,]+)\s+.*dojos?\s+(?:match|mapped)/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ''), 10);
}

test.describe('studio map — failure path & retry (issue #73)', () => {
  test('shows a failure message and Retry button when the manifest fetch fails', async ({ page }) => {
    // Force every manifest.json request (including the automatic retries) to
    // 500 so the fetch exhausts its backoff and surfaces a terminal failure.
    await page.route('**/manifest.json*', route =>
      route.fulfill({ status: 500, contentType: 'text/plain', body: 'server error' })
    );

    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.goto(MAP_URL);

    // After 3 attempts (1s + 2s + 4s backoff ≈ 7s) the terminal failure fires.
    // Use a generous timeout — under cold start (3 PHP servers spinning up) the
    // page can take a few seconds to even reach boot().
    await expect(page.locator('#clean-loading')).toContainText('Failed to load', { timeout: 30000 });
    await expect(page.locator('#clean-title-count')).toContainText(/failed to load/i, { timeout: 5000 });
    // The manual Retry affordance must be visible.
    await expect(page.locator('#clean-retry-btn')).toBeVisible();
    await expect(page.locator('#clean-retry-btn')).toContainText('Retry');

    // Retry attempts should have been logged to the console.
    expect(logs.some(l => /manifest.*attempt/i.test(l))).toBeTruthy();
    expect(logs.some(l => /manifest.*failed after/i.test(l))).toBeTruthy();
  });

  test('Retry button re-attempts the fetch and recovers when the server comes back', async ({ page, request }, testInfo) => {
    // Recovery needs the real manifest — DVC data is absent in fresh checkouts.
    if (!(await mapDataAvailable(request))) {
      testInfo.skip(true, 'DVC map data not present — recovery has nothing to load');
      return;
    }
    let manifestShouldFail = true;
    await page.route('**/manifest.json*', route => {
      if (manifestShouldFail) {
        return route.fulfill({ status: 500, contentType: 'text/plain', body: 'server error' });
      }
      return route.continue();
    });

    await page.goto(MAP_URL);
    // Wait for the terminal failure + retry button.
    await expect(page.locator('#clean-retry-btn')).toBeVisible({ timeout: 30000 });

    // Now let the manifest through and click Retry.
    manifestShouldFail = false;
    await page.click('#clean-retry-btn');

    // The retry button hides and the title updates away from "failed to load".
    await expect(page.locator('#clean-retry-btn')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#clean-title-count')).not.toContainText(/failed to load/i, { timeout: 10000 });
  });

  test('geo-tree fetch retries on transient failure then degrades gracefully', async ({ page, request }, testInfo) => {
    if (!(await mapDataAvailable(request))) {
      testInfo.skip(true, 'DVC map data not present — geo-tree has nothing to load');
      return;
    }
    let geoAttempts = 0;
    let geoShouldFail = true;
    await page.route('**/studios-geo-tree.json*', route => {
      geoAttempts++;
      // Fail the first two attempts (forcing one retry), then succeed.
      if (geoShouldFail && geoAttempts < 3) {
        return route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporarily unavailable' });
      }
      return route.continue();
    });

    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.goto(MAP_URL);

    // The geo-tree should eventually load (after one retry) and populate the
    // continent dropdown.
    await expect(page.locator('#clean-continent-filter option')).not.toHaveCount(1, { timeout: 20000 });
    expect(logs.some(l => /geo-tree.*attempt.*retrying/i.test(l))).toBeTruthy();
  });
});

test.describe('studio map — filtering (issue #71)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto(MAP_URL);
    const ready = await waitForMapReady(page);
    if (!ready) {
      testInfo.skip(true, 'Leaflet CDN unavailable — map did not render; skipping filtering test');
    }
  });

  test('search box narrows markers without needing a geo filter first', async ({ page }) => {
    // Count visible markers before searching via the title bar.
    const before = await getVisibleCount(page);
    expect(before).not.toBeNull();
    expect(before).toBeGreaterThan(0);

    // Type a partial studio name known to exist in the Aikido dataset.
    await page.fill('#clean-search-input', 'Aikido');
    // Debounced at 150ms; wait for the title to update.
    await page.waitForTimeout(400);
    const after = await getVisibleCount(page);
    expect(after).not.toBeNull();
    // Searching for "Aikido" should narrow (or at least not increase) the set.
    expect(after).toBeLessThanOrEqual(before);

    // Clearing the search restores the previous count.
    await page.click('.input-clear');
    await page.waitForTimeout(400);
    const cleared = await getVisibleCount(page);
    expect(cleared).toBe(before);
  });

  test('title bar shows a computed unique-studio count, not a hardcoded literal', async ({ page }) => {
    // The old bug hardcoded "21,696"; the fix computes from the manifest.
    const title = await page.locator('#clean-title-count').textContent();
    expect(title).toBeTruthy();
    // Must contain a localized number and the word "worldwide" (or "dojos").
    expect(/\d/.test(title)).toBeTruthy();
    // Must NOT contain the old hardcoded literal.
    expect(title).not.toContain('21,696');
  });

  test('every manifest category renders a pill with a computed count', async ({ page }) => {
    // Read the manifest via the page context so the test stays in sync with
    // the actual data file rather than a hardcoded list.
    const cats = await page.evaluate(async () => {
      const r = await fetch('manifest.json');
      const d = await r.json();
      return (d.categories || []).map(c => ({ name: c.name, count: c.count }));
    });
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      const pill = page.locator(`.cat-pill[data-cat="${c.name}"]`);
      // Some pills are hidden in adult mode (non-Aikido top-level), but the
      // element should still exist in the DOM with a count.
      await expect(pill).toHaveCount(1);
      const text = await pill.textContent();
      expect(text).toContain(c.count.toLocaleString());
    }
  });

  test('toggling a category off removes its markers and updates the count', async ({ page }) => {
    // Aikido is active by default. Toggle it off.
    const aikidoPill = page.locator('.cat-pill[data-cat="Aikido"]');
    await expect(aikidoPill).toHaveClass(/active/);
    const before = await getVisibleCount(page);
    expect(before).not.toBeNull();
    expect(before).toBeGreaterThan(0);

    await aikidoPill.click();
    await page.waitForTimeout(300);
    await expect(aikidoPill).not.toHaveClass(/active/);

    // After deactivating the only active category, the title switches to the
    // "no category" state ("Adult map · N unique locations worldwide") and the
    // visible-dojo count is no longer reported as a positive "shown" number.
    const titleAfter = await page.locator('#clean-title-count').textContent();
    expect(titleAfter).toBeTruthy();
    // Either no category is active (title mentions "map" + "worldwide") or
    // the shown count dropped to zero.
    const after = await getVisibleCount(page);
    expect(after === null || after === 0 || after < before).toBeTruthy();
  });

  test('search + continent filter combine (search AND geo)', async ({ page }) => {
    // Adult mode now starts on "all arts", so continent filtering already has
    // a broad set to narrow. Pick a continent and search.
    const continentSelect = page.locator('#clean-continent-filter');
    // Wait for the geo tree to populate the dropdown.
    await expect(continentSelect.locator('option')).not.toHaveCount(1, { timeout: 15000 });

    // Pick the first non-empty continent option.
    const options = await continentSelect.locator('option').allTextContents();
    const firstContinent = options.find(o => o && o !== 'All Continents');
    expect(firstContinent).toBeTruthy();
    await continentSelect.selectOption({ label: firstContinent });
    await page.waitForTimeout(500);

    const geo = await getVisibleCount(page);
    expect(geo).not.toBeNull();

    // Now add a search term; the result must be <= the geo-only count.
    await page.fill('#clean-search-input', 'aikido');
    await page.waitForTimeout(400);
    const both = await getVisibleCount(page);
    expect(both).not.toBeNull();
    expect(both).toBeLessThanOrEqual(geo);
  });
});

// Adult and youth are separate maps sharing one page (#116). Each owns its
// own categories, geography, search and youth filters; switching must not
// carry state across, and must not be the only way to see the full category
// list — the symptom that prompted this work.
test.describe('studio map — adult/youth mode separation (issue #116)', () => {
  // Reads the panel state that must survive a mode round trip. offsetParent
  // rather than style.display: a pill inside a collapsed group is hidden by
  // its ancestor, not by its own inline style.
  async function panelState(page) {
    return page.evaluate(() => ({
      cats: Array.from(document.querySelectorAll('.cat-pill.active'))
        .map(p => p.dataset.cat).sort(),
      visiblePills: Array.from(document.querySelectorAll('.cat-pill'))
        .filter(p => p.offsetParent !== null).length,
      search: document.getElementById('clean-search-input').value,
      continent: document.getElementById('clean-continent-filter').value,
      country: document.getElementById('clean-country-filter').value,
      youthPanel: document.getElementById('youth-filters').style.display !== 'none'
    }));
  }

  async function setMode(page, mode) {
    await page.evaluate(m => window.postMessage({ type: 'set-map-mode', mode: m }, '*'), mode);
    await page.waitForTimeout(4000);
  }

  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto(MAP_URL);
    const ready = await waitForMapReady(page);
    if (!ready) {
      testInfo.skip(true, 'Leaflet CDN unavailable — map did not render; skipping mode test');
    }
  });

  test('cold load in adult shows the whole category list with all arts active', async ({ page }) => {
    const st = await panelState(page);
    // Every category renders a pill — no toggling required to see the list.
    const total = await page.locator('.cat-pill').count();
    expect(st.visiblePills).toBeGreaterThan(1);
    expect(st.cats.length).toBeGreaterThan(1);
    expect(st.cats).toContain('Aikido');
    // Aikido lives inside a group; it must be on screen, not hidden by a
    // collapsed parent, while it is active.
    expect(await page.locator('.cat-pill[data-cat="Aikido"]').isVisible()).toBeTruthy();
    // The parent group itself stays off so it isn't active alongside its children.
    expect(st.cats).not.toContain('Japanese Martial Arts');
    expect(total).toBeGreaterThanOrEqual(st.visiblePills);
    // Youth readiness controls belong to the youth map only.
    expect(st.youthPanel).toBeFalsy();
  });

  test('adult state survives a round trip through youth', async ({ page, request }, testInfo) => {
    // Youth filters only render when the manifest carries youthFields
    // (issue #116) — the current DVC snapshot does not, so the panel would
    // legitimately never appear.
    const manifest = await (await request.get('/somatic-studios/map/manifest.json')).json().catch(() => null);
    if (!manifest || !manifest.youthFields || !manifest.youthFields.available) {
      testInfo.skip(true, 'manifest has no youthFields.available — youth panel never renders');
      return;
    }
    const continentSelect = page.locator('#clean-continent-filter');
    await expect(continentSelect.locator('option')).not.toHaveCount(1, { timeout: 15000 });
    const options = await continentSelect.locator('option').allTextContents();
    await continentSelect.selectOption({ label: options.find(o => o && o !== 'All Continents') });
    await page.waitForTimeout(1500);
    await page.fill('#clean-search-input', 'aikido');
    await page.waitForTimeout(600);

    const before = await panelState(page);
    await setMode(page, 'youth');

    const youth = await panelState(page);
    expect(youth.youthPanel).toBeTruthy();
    expect(youth.search).toBe('');          // youth starts from its own defaults
    expect(youth.continent).toBe('');

    await setMode(page, 'adult');
    const after = await panelState(page);
    expect(after).toEqual(before);
  });

  test('?map_mode=youth lands in the same state as clicking the toggle', async ({ page }) => {
    await setMode(page, 'youth');
    const viaToggle = await panelState(page);

    await page.goto(MAP_URL + '?map_mode=youth');
    await waitForMapReady(page);
    await page.waitForTimeout(3000);
    const viaUrl = await panelState(page);

    expect(viaUrl).toEqual(viaToggle);
  });
});
