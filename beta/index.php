<?php require dirname(__DIR__) . '/includes/beta-gate.load.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>AikiField — Beta Index</title>
  <meta name="description" content="Index of unreleased beta previews on aikifield.com. Gated — requires AI Ki Questions Fielded login.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="../css/redesign.css">
  <link rel="stylesheet" href="css/assessment.css">
</head>
<body data-bta-page="index">

<a href="#main" class="af-skip-link">Skip to main content</a>

<header class="af-header">
  <div class="af-header__inner">
    <a href="../index.html" class="af-brand">
      <span class="af-brand__icon" aria-hidden="true">A</span>
      <span class="af-brand__text">AikiField</span>
    </a>
    <input type="checkbox" id="af-nav-check" class="af-nav-toggle-check">
    <label for="af-nav-check" class="af-nav__toggle" aria-label="Menu">&#9776;</label>
    <nav aria-label="Primary" class="af-nav">
      <a href="../index.html" class="af-nav__link">Home</a>
      <a href="../process.html" class="af-nav__link">Process</a>
      <a href="../approach.html" class="af-nav__link">Approach</a>
      <a href="../services.html" class="af-nav__link">Services</a>
      <a href="../case-studies.html" class="af-nav__link">Case Studies</a>
      <a href="../projects.php" class="af-nav__link">Demonstration Technologies</a>
      <a href="index.php" class="af-nav__link af-nav__link--active" aria-current="page">Beta</a>
      <a href="../contact.html" class="af-nav__cta">Get Started</a>
    </nav>
  </div>
</header>

<main id="main" class="bta-main">

  <section class="bta-hero">
    <svg class="bta-hero__rings" viewBox="0 0 620 620" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#27394A" stroke-width="1">
        <circle cx="310" cy="310" r="72"/>
        <circle cx="310" cy="310" r="132"/>
        <circle cx="310" cy="310" r="192"/>
        <circle cx="310" cy="310" r="252"/>
        <circle cx="310" cy="310" r="300"/>
        <line x1="310" y1="10" x2="310" y2="610"/>
        <line x1="10" y1="310" x2="610" y2="310"/>
        <line x1="98" y1="98" x2="522" y2="522"/>
        <line x1="522" y1="98" x2="98" y2="522"/>
      </g>
    </svg>
    <div class="bta-container bta-hero__inner">
      <p class="bta-eyebrow">Beta preview</p>
      <h1 class="bta-h1">What&rsquo;s in here</h1>
      <p class="bta-lead">Unreleased previews behind the AI Ki Questions Fielded login. Nothing here is linked from the main site, and the content is still changing.</p>
    </div>
  </section>

  <section class="bta-section">
    <div class="bta-container">

      <div class="bta-grid bta-grid--2">
        <a class="bta-card" href="assessment.php" style="text-decoration:none;color:inherit;display:block;">
          <p class="bta-h4">Assessment</p>
          <h2 class="bta-h3">Security Leadership Assessment</h2>
          <p class="bta-body">Two connected assessments &mdash; organisational security posture (5 categories, 20 questions) and leadership presence (7 dimensions, 28 questions + 4 pressure scenarios). Each produces a radar visualization; both together unlock a cross-view showing how the two readings interact. Data stays in your browser; nothing is transmitted.</p>
          <p class="bta-body bta-muted">Hub page &middot; leads to three sub-pages &middot; ~25 minutes for both</p>
        </a>
      </div>

      <div class="bta-panel" style="margin-top:32px;">
        <h2 class="bta-h2">Pages in this directory</h2>
        <ul style="list-style:disc;padding-left:1.4em;color:var(--bta-panel-text);line-height:1.7;">
          <li><code>assessment.php</code> &mdash; Hub: explains both assessments, shows completion state, unlocks the cross-view, privacy notice.</li>
          <li><code>assessment-organisation.php</code> &mdash; Organisational flow: 5 categories &times; 4 questions.</li>
          <li><code>assessment-leadership.php</code> &mdash; Leadership flow: 7 dimensions &times; 4 questions + 4 pressure scenarios.</li>
          <li><code>assessment-crossview.php</code> &mdash; The org &times; leadership cross-view (unlocks when both are complete).</li>
          <li><code>data.php</code> &mdash; Session-gated JSON delivery for the assessment data files (not directly fetchable).</li>
        </ul>
      </div>

      <div class="bta-panel" style="margin-top:24px;">
        <h2 class="bta-h2">Supporting files</h2>
        <ul style="list-style:disc;padding-left:1.4em;color:var(--bta-panel-text);line-height:1.7;">
          <li><code>css/assessment.css</code> &mdash; Scoped dark theme (<code>--bta-*</code> / <code>.bta-*</code> namespace).</li>
          <li><code>js/assessment.js</code> &mdash; Scoring, localStorage, SVG radar, cross-view lookup, scenario rendering.</li>
          <li><code>data/questions.json</code> &mdash; All 48 questions (served via <code>data.php</code>).</li>
          <li><code>data/crossview.json</code> &mdash; Axis definitions + 24 interpretations + fallback.</li>
          <li><code>data/scenarios.json</code> &mdash; 4 pressure scenarios and tendency readings.</li>
          <li><code>data/practices.json</code> &mdash; 30-day practices keyed by group id.</li>
        </ul>
      </div>

      <div class="bta-panel" style="margin-top:24px;">
        <h2 class="bta-h2">Access</h2>
        <p class="bta-body">Every page in <code>/beta/</code> requires the same coaching login as <a href="../login.php">login.php</a>. An unauthenticated request redirects to the login page with a <code>?next=</code> parameter so you land back on the page you wanted. The session cookie covers the whole <code>aikifield.com</code> origin, so logging in once unlocks all beta pages for 7 days.</p>
        <p class="bta-body bta-muted">This directory is disallowed in <code>robots.txt</code>, every page carries <code>noindex,nofollow</code>, and the raw data files are blocked at the server (<code>beta/data/.htaccess</code>) so the gate can&rsquo;t be bypassed.</p>
      </div>

    </div>
  </section>

</main>

<footer class="af-footer">
  <div class="af-footer__grid">
    <div>
      <div class="af-footer__brand-row">
        <span class="af-footer__brand-icon" aria-hidden="true">A</span>
        <span class="af-footer__brand-text">AikiField</span>
      </div>
      <p class="af-footer__tagline">Security leadership for product companies. Fractional CISO, AI-assisted security engineering, and presence-based executive coaching.</p>
    </div>
    <nav aria-label="Explore">
      <h3 class="af-footer__col-title">Explore</h3>
      <ul class="af-footer__nav">
        <li><a href="../process.html">Engagement Process</a></li>
        <li><a href="../approach.html">Our Approach</a></li>
        <li><a href="../services.html">Services</a></li>
        <li><a href="../case-studies.html">Case Studies</a></li>
        <li><a href="../projects.php">Demonstration Technologies</a></li>
        <li><a href="../assessment.html">Self-Assessment</a></li>
      </ul>
    </nav>
    <nav aria-label="Connect">
      <h3 class="af-footer__col-title">Connect</h3>
      <ul class="af-footer__nav">
        <li><a href="../contact.html">Contact</a></li>
        <li><a href="../contact.html">Inquiry</a></li>
      </ul>
    </nav>
  </div>
  <div class="af-footer__legal">&copy; 2026 AikiField. All rights reserved.</div>
</footer>

</body>
</html>
