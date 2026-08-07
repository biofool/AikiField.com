<?php require dirname(__DIR__) . '/includes/beta-gate.load.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>AikiField — Leadership Presence Profile (beta)</title>
  <meta name="description" content="Beta preview: the AikiField leadership presence profile — seven dimensions, four pressure scenarios, scored in your browser.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/redesign.css">
  <link rel="stylesheet" href="css/assessment.css">
</head>
<body data-bta-page="leadership">

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
      <a href="../projects.php" class="af-nav__link">Sponsored Projects</a>
      <a href="assessment.php" class="af-nav__link af-nav__link--active" aria-current="page">Assessment</a>
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
      <p class="bta-eyebrow">Beta preview · Part two</p>
      <h1 class="bta-h1">Leadership Presence Profile</h1>
      <p class="bta-lead">Seven dimensions describing how you tend to show up in the security conditions you lead — under load, in conflict, and in uncertainty.</p>
      <p class="bta-body bta-muted"><a href="assessment.php">Back to the assessment overview</a></p>
    </div>
  </section>

  <div class="bta-container">
    <div class="bta-error" data-bta-error hidden></div>
  </div>

  <!-- FLOW -->
  <section class="bta-section" data-bta-flow hidden>
    <div class="bta-container bta-container--narrow">

      <div class="bta-progress">
        <p class="bta-progress__label">
          <span>Progress</span>
          <span data-bta-progress-text>0 of 28 answered</span>
        </p>
        <div class="bta-progress__track" role="progressbar" aria-label="Questions answered"
             aria-valuemin="0" aria-valuemax="28" aria-valuenow="0" data-bta-progressbar>
          <div class="bta-progress__fill" data-bta-progress-fill></div>
        </div>
      </div>

      <form data-bta-form novalidate>
        <div data-bta-questions></div>

        <div data-bta-scenario-section>
          <h2 class="bta-h2" style="margin-top:56px;">Under pressure</h2>
          <div data-bta-scenarios></div>
          <p class="bta-body bta-small bta-muted">These four are optional and are not scored into the profile above. They produce a separate reading of what you reach for first when a situation is live.</p>
        </div>

        <div class="bta-stepbar bta-stepbar--pinned">
          <span class="bta-stepbar__count bta-status" data-bta-submit-hint role="status">Answer every question to see your profile.</span>
          <button type="submit" class="bta-btn bta-btn--primary" data-bta-submit disabled>See your profile</button>
        </div>
      </form>

      <p class="bta-body bta-small bta-muted" style="margin-top:24px;">Your answers save as you go, in this browser only. You can leave and come back.</p>
    </div>
  </section>

  <!-- RESULTS -->
  <section class="bta-section" data-bta-results hidden>
    <div class="bta-container bta-container--narrow">

      <h2 class="bta-h2" tabindex="-1" data-bta-results-heading>Your leadership profile</h2>
      <div data-bta-summary></div>

      <div class="bta-radar-wrap" style="margin:32px 0;">
        <div data-bta-radar></div>
        <div data-bta-legend></div>
      </div>

      <div data-bta-readout></div>

      <div class="bta-card" style="margin-top:40px;">
        <p class="bta-h4">Under pressure</p>
        <div data-bta-tendency></div>
      </div>

      <div class="bta-card" style="margin-top:24px;">
        <p class="bta-h4">Thirty days</p>
        <h3 class="bta-h3">What to practise next</h3>
        <div data-bta-plan></div>
      </div>

      <p class="bta-btn-row" style="margin-top:32px;">
        <button type="button" class="bta-btn bta-btn--quiet" data-bta-review>Review or change my answers</button>
      </p>
    </div>

    <!-- Hand-off: shown only while the organisational assessment is outstanding -->
    <div class="bta-container bta-container--narrow" style="margin-top:56px;" data-bta-handoff hidden>
      <div class="bta-handoff">
        <p class="bta-handoff__lines">
          <span>Your leadership profile is one part of the field.</span>
          <span>Continue with the organisational assessment to explore the conditions in which your leadership operates.</span>
        </p>
        <a class="bta-btn bta-btn--primary" href="assessment-organisation.php">Explore organisational security posture</a>
      </div>
    </div>

    <div class="bta-container bta-container--narrow" style="margin-top:56px;" data-bta-xview-ready hidden>
      <div class="bta-handoff">
        <p class="bta-handoff__lines">
          <span>Both assessments are complete.</span>
          <span>The cross-view describes what this profile and your organisational posture produce together.</span>
        </p>
        <a class="bta-btn bta-btn--primary" href="assessment-crossview.php">Open your cross-view</a>
      </div>
    </div>
  </section>

  <section class="bta-section bta-section--tight bta-section--edge">
    <div class="bta-container bta-container--narrow">
      <div class="bta-privacy">
        <p><strong>Your answers stay in this browser and are never sent to AikiField.</strong> They are held in local storage on this device only — no account, no server, no analytics attached to your responses.</p>
        <p>This is a structured self-reflection, not a certification, an audit, or a grade. There are no right answers, and nothing here scores you as a leader.</p>
        <p class="bta-btn-row">
          <button type="button" class="bta-btn bta-btn--quiet" data-bta-clear>Clear my responses</button>
        </p>
        <p class="bta-status" data-bta-clear-status role="status"></p>
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
      <h2 class="af-footer__col-title">Explore</h2>
      <ul class="af-footer__nav">
        <li><a href="../process.html">Engagement Process</a></li>
        <li><a href="../approach.html">Our Approach</a></li>
        <li><a href="../services.html">Services</a></li>
        <li><a href="../case-studies.html">Case Studies</a></li>
        <li><a href="../fractional-ciso-for-saas.html">Fractional CISO for SaaS</a></li>
        <li><a href="../ai-devsecops-vulnerability-remediation.html">AI DevSecOps Remediation</a></li>
        <li><a href="../projects.php">Sponsored Projects</a></li>
        <li><a href="assessment.php">Self-Assessment (beta)</a></li>
      </ul>
    </nav>
    <nav aria-label="Connect">
      <h2 class="af-footer__col-title">Connect</h2>
      <ul class="af-footer__nav">
        <li><a href="../contact.html">Contact</a></li>
        <li><a href="../contact.html">Inquiry</a></li>
      </ul>
    </nav>
  </div>
  <div class="af-footer__legal">&copy; 2026 AikiField. All rights reserved.</div>
</footer>

<script src="js/assessment.js"></script>
</body>
</html>
