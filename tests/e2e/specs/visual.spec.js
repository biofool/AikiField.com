// Visual regression tests — full-page screenshot comparison (issue #57).
//
// Captures the login page and every gated /beta/ page at four viewport
// widths and compares them against committed baselines in
// tests/e2e/visual-baselines/<project>/ (the snapshotPathTemplate in
// playwright.config.js). A copy of each capture is also written to
// docs/ui-review/<YYYY-MM-DD>-<commit>/ for human review — that folder is
// gitignored; the baselines are the thing that is committed.
//
// Modelled on quantumaikido.com/web/tests/e2e/specs/visual.spec.js, extended
// per issue #57: 320/768/1024/1440 widths, a 5% pixel-diff threshold, and an
// axe-core pass on each page.
//
// To regenerate baselines after an intentional UI change:
//   bash tests/e2e/run.sh visual --update-snapshots all
//   git add tests/e2e/visual-baselines/ && git commit
// ("all" is required — the bare flag only rewrites snapshots that FAIL the
// comparison, so within-tolerance drift like issue #68's stale nav is kept.)
//
// Or a single page:
//   bash tests/e2e/run.sh visual --update-snapshots all -g "login"

const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { TEST_EMAIL, PASSWORD, stubToken } = require('../helpers');

// Gated pages need a PHP session. page.request shares the browser context's
// cookie jar, so posting backend-login here authenticates the page too.
async function login(page) {
  const resp = await page.request.post('/login.php', {
    form: {
      action: 'backend-login',
      email: TEST_EMAIL,
      sessionToken: stubToken(TEST_EMAIL),
    },
  });
  const body = await resp.json();
  if (!body.ok) {
    throw new Error('visual spec: backend-login rejected (ok=false) — is the stub backend up?');
  }
}

const PAGES = [
  // Public surface
  { name: 'homepage',       path: '/',                              gated: false },
  { name: 'login',          path: '/login.php',                     gated: false },
  { name: 'projects',       path: '/projects.php',                  gated: false },
  // Gated beta surface — the pages issue #57 is about
  { name: 'beta-index',               path: '/beta/',                                 gated: true },
  { name: 'beta-assessment',          path: '/beta/assessment.php',                   gated: true },
  { name: 'beta-assessment-org',      path: '/beta/assessment-organisation.php',      gated: true },
  { name: 'beta-assessment-leadership', path: '/beta/assessment-leadership.php',      gated: true },
  { name: 'beta-assessment-crossview',  path: '/beta/assessment-crossview.php',       gated: true },
];

// Issue #57: mobile, tablet, small laptop, desktop.
const VIEWPORTS = [
  { name: 'w320',  width: 320,  height: 568 },
  { name: 'w768',  width: 768,  height: 1024 },
  { name: 'w1024', width: 1024, height: 768 },
  { name: 'w1440', width: 1440, height: 900 },
];

// docs/ui-review/<date>-<sha>/ — regenerated per run, gitignored.
function uiReviewDir() {
  const date = new Date().toISOString().slice(0, 10);
  let sha = 'local';
  try {
    sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    console.warn('visual spec: could not resolve git sha for ui-review folder:', e.message);
  }
  return path.resolve(__dirname, '..', '..', '..', 'docs', 'ui-review', `${date}-${sha}`);
}

for (const p of PAGES) {
  for (const vp of VIEWPORTS) {
    test(`${p.name} @${vp.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      if (p.gated) await login(page);
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');
      // Fonts load async via the preload/onload pattern; let them settle.
      await page.waitForTimeout(500);

      const shotName = `${p.name}-${vp.name}.png`;
      const buffer = await page.screenshot({ fullPage: true, animations: 'disabled' });

      // Human-review copy — outside the baseline store.
      const reviewDir = uiReviewDir();
      fs.mkdirSync(reviewDir, { recursive: true });
      fs.writeFileSync(path.join(reviewDir, shotName), buffer);

      // axe-core accessibility check (issue #57). Critical violations fail;
      // anything else is attached to the report for review.
      const axe = await new AxeBuilder({ page }).analyze();
      await testInfo.attach(`axe-${p.name}-${vp.name}.json`, {
        body: JSON.stringify(axe.violations, null, 2),
        contentType: 'application/json',
      });
      const critical = axe.violations.filter(v => v.impact === 'critical');
      expect(critical.map(v => `${v.id}: ${v.nodes.length} node(s)`),
        `axe critical violations on ${p.path}`).toEqual([]);

      // 5% pixel-diff threshold per the issue (QA's suite uses 1%, but the
      // beta pages carry more dynamic chrome — revisit if this is too loose).
      expect(buffer).toMatchSnapshot(shotName, { maxDiffPixelRatio: 0.05 });
    });
  }
}
