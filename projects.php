<?php
/**
 * AikiField — Demonstration Technologies.
 *
 * Marketing page describing the systems AikiField has built (the AikiField
 * AI Chat, World Studio Finder, MultiCloud-MultiPass). The page is fully
 * public — there is no login or chat on this page anymore.
 *
 * History: this page previously hosted an inline coaching login + AI Chat
 * (a public CTA authenticating against the Quantum Aikido coaching backend
 * on Cloud Run via coach-proxy.php). That surface was removed — the page
 * now shows an invitation card pointing visitors to the contact form to
 * request a live demo. The coaching login was extracted to a blind
 * /login.php page that gates only the /beta/ assessment pages. See
 * docs/coach-auth-prd.md for the full history and the current auth surface.
 *
 * BLIND URL NOTE: This page IS linked from the public nav (it is a marketing
 * page). The invitation card is a CTA, not a gate — all content stays
 * visible to every visitor.
 *
 * Dual-PRD coordination: changes to the auth flow (now on /login.php) MUST
 * update
 *   - docs/coach-auth-prd.md (this repo)
 *   - ~/projects/quantumaikido.com/web/docs/coach-dashboard-prd.md
 *   - ~/projects/AIRichardMoon/backend/PRD.md
 * See docs/coach-auth-prd.md and AGENTS.md.
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <meta name="theme-color" content="#0f2942">
  <title>AikiField — Technology We Build</title>
  <meta name="description" content="Production AI and data pipelines designed and built by AikiField — a cited AI coaching chat and a global studio discovery pipeline. The same engineering capability is available to your organization, tailored to fit your needs.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AikiField">
  <meta property="og:title" content="Technology We Build">
  <meta property="og:description" content="Production AI and data pipelines designed and built by AikiField — a cited AI coaching chat and a global studio discovery pipeline. The same engineering capability is available to your organization, tailored to fit your needs.">
  <meta property="og:url" content="https://aikifield.com/projects.php">
  <meta property="og:image" content="https://aikifield.com/favicon.svg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Technology We Build">
  <meta name="twitter:description" content="Production AI and data pipelines designed and built by AikiField — a cited AI coaching chat and a global studio discovery pipeline. The same engineering capability is available to your organization, tailored to fit your needs.">
  <link rel="canonical" href="https://aikifield.com/projects.php">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="css/redesign.css">
</head>
<body>

<a href="#main" class="af-skip-link">Skip to main content</a>

<!-- HEADER -->
<header class="af-header">
  <div class="af-header__inner">
    <a href="index.html" class="af-brand">
      <span class="af-brand__icon" aria-hidden="true">A</span>
      <span class="af-brand__text">AikiField</span>
    </a>
    <input type="checkbox" id="af-nav-check" class="af-nav-toggle-check">
    <label for="af-nav-check" class="af-nav__toggle" aria-label="Menu">&#9776;</label>
    <nav aria-label="Primary" class="af-nav">
      <a href="index.html" class="af-nav__link" data-i18n="nav.home">Home</a>
      <a href="process.html" class="af-nav__link" data-i18n="nav.process">Process</a>
      <a href="approach.html" class="af-nav__link" data-i18n="nav.approach">Approach</a>
      <a href="services.html" class="af-nav__link" data-i18n="index.eyebrow_services">Services</a>
      <a href="case-studies.html" class="af-nav__link" data-i18n="nav.case_studies">Case Studies</a>
      <a href="projects.php" class="af-nav__link af-nav__link--active" aria-current="page" data-i18n="nav.demonstration_technologies">Projects</a>
      <a href="assessment.html" class="af-nav__link" data-i18n="nav.assessment">Assessment</a>
      <a href="contact.html" class="af-nav__cta" data-i18n="nav.get_started">Get Started</a>
      <div id="af-language-selector" class="af-lang-selector" data-i18n-attr="aria-label:nav.language_selection">
        <span class="af-lang-label" aria-hidden="true">&#127760;</span>
      </div>
    </nav>
  </div>
</header>

<main id="main">

  <!-- ============================================================ -->
  <!-- PAGE HEADER — leads the Demonstration Technologies page              -->
  <!-- ============================================================ -->
  <section class="af-page-header af-page-header--tight af-page-header--green">
    <div class="af-container">
      <p class="af-eyebrow">Built by AikiField</p>
      <h1 class="af-h1">Technology we built &mdash; ready to fit your needs.</h1>
      <p class="af-lead af-lead--wide af-page-header__lead">AikiField designs, builds, and operates the systems below &mdash; production AI and data pipelines running today, not demos or slide-ware. The same engineering capability, cost discipline, and leadership judgment that built them is available to your organization, tailored to fit your security program and your stage.</p>
      <a href="#see-it-live" class="af-page-header__chat-cta">
        <span class="af-page-header__chat-cta-badge">Free</span>
        See it live &mdash; request an invitation below
        <span class="af-page-header__chat-cta-arrow" aria-hidden="true">&darr;</span>
      </a>
    </div>
  </section>

  <!-- ============================================================ -->
  <!-- PROJECTS + INVITATION CARD — two-column split                 -->
  <!-- Left: the sponsored project cards.                            -->
  <!-- Right: invitation card (request a live demo), sticky.         -->
  <!-- No --white modifier: falls through to body's --af-bg (warm    -->
  <!-- paper), so the page reads dark green header -> paper section  -->
  <!-- -> white cards, instead of white section -> paper cards.      -->
  <!-- ============================================================ -->
  <section class="af-section">
    <div class="af-container">
      <div class="af-projects-split">

        <!-- LEFT COLUMN: sponsored projects -->
        <div class="af-projects-split__projects">

          <!-- PROJECT 1: AIKIFIELD AI CHAT -->
          <article class="af-svc af-svc--flagship">
            <div class="af-svc__tag-row">
              <span class="af-svc__tag af-svc__tag--flagship">AI Coaching</span>
              <span class="af-svc__tag af-svc__tag--built">Built by AikiField</span>
            </div>
            <h2 class="af-svc__title">Aikifield AI Chat</h2>
            <p class="af-svc__lead">Corpus-specific AI Chat. Designed to provide hallucination-free Q&amp;A against a specific knowledge base. Free your team to handle the hard questions; give your customers a better interface to the documentation &mdash; because, who wants to read docs?</p>
            <p class="af-svc__bestfor">Live at <a href="https://quantumaikido.com">quantumaikido.com</a> &mdash; a public chat plus a members area (invitation-only, with email or Google login).</p>
            <p class="af-svc__bestfor">How it works: it searches the teaching archive for relevant passages, drafts an answer with citations, keeps costs under control, and hands off to a human coach by video when it can&rsquo;t help or the member asks.</p>
            <h3 class="af-svc__bullets-label">What it does</h3>
            <ul class="af-svc__bullets">
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Answers grounded in the source teachings</strong> &mdash; with citations back to origin.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Escalates to a live human coach</strong> &mdash; via video link when a question needs it.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Runs on a fixed budget</strong> &mdash; so coaching stays free, with no surprise bills.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Queues questions</strong> &mdash; so no single user crowds out the rest.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Works on any cloud</strong> &mdash; without rewriting the code.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Self-service accounts</strong> &mdash; register, log in, reset your password, or delete your account (invitation-only).</span></li>
            </ul>
            <h3 class="af-svc__bullets-label" style="margin-top:28px;">Tech stack</h3>
            <p class="af-body">Python &middot; FastAPI &middot; Gemini Developer API &middot; Google Cloud Run &middot; Firestore &middot; Secret Manager &middot; Pub/Sub &middot; Cloud Functions &middot; Cloudflare Turnstile &middot; SQLite FTS5 &middot; Docker &middot; OpenTofu &middot; DVC + GCS</p>

            <div class="af-svc__applied">
              <p class="af-svc__applied-label">Applied to your needs</p>
              <p class="af-svc__applied-body">The same pattern &mdash; <strong>a cited, cost-controlled AI assistant grounded in your own knowledge base</strong> &mdash; can be built for your security team: a chat that answers policy and incident questions from your runbooks, triages vulnerabilities with citations back to the source, and escalates to a human on call when it can&rsquo;t help. We design, build, and operate it on a fixed budget.</p>
            </div>

            <div class="af-diagram">
              <figure class="af-diagram__figure">
                <img src="assets/aichat-flow.svg" data-af-diagram="aichat-flow" data-i18n-attr="alt:svg.aichat_flow.alt" alt="AikiField AI Chat request flow: step 1 member asks a question; step 2a authenticate (email, password, Google OAuth, Turnstile) and 2b rate limit and queue; step 3 search teaching corpus via SQLite FTS5; step 4 Gemini drafts cited answer; step 5 decision — can it answer confidently? YES leads to 6a return cited answer (24/7, free, within budget), NO leads to 6b escalate to human coach via video link; step 7 member receives response. Infrastructure: Cloud Run, Firestore, Secret Manager, Pub/Sub, Cloud Functions, Docker, OpenTofu, DVC plus GCS." class="af-diagram__img" width="780" height="980" loading="lazy"/>
                <figcaption class="af-diagram__caption"><strong>Figure 1.</strong> AikiField AI Chat request flow &mdash; from member question through corpus search, Gemini-drafted answer, and the decision to return a cited answer or escalate to a live human coach. <a href="assets/aichat-flow.png" class="af-diagram__download" download>Download PNG &darr;</a></figcaption>
              </figure>
            </div>
          </article>

          <!-- PROJECT 2: STUDIO DISCOVERY -->
          <article class="af-svc">
            <div class="af-svc__tag-row">
              <span class="af-svc__tag">Outreach Pipeline</span>
              <span class="af-svc__tag af-svc__tag--built">Built by AikiField</span>
            </div>
            <h2 class="af-svc__title">World Studio Finder &mdash; Global Studio Discovery</h2>
            <p class="af-svc__lead">A tool that finds yoga, tai chi, capoeira, and somatic-practice studios worldwide on Google Maps, then locates and verifies their contact emails for outreach.</p>
            <p class="af-svc__bestfor">Two ways to reach out: email campaigns via mail merge, and automatic contact-form submission for studios with a website but no listed email.</p>
            <h3 class="af-svc__bullets-label">What it does</h3>
            <ul class="af-svc__bullets">
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Searches Google Maps worldwide</strong> &mdash; covering every region, with a fallback to the Google Places API when needed.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Finds and verifies emails</strong> &mdash; using Hunter.io and direct website lookups, filtering out junk and undeliverable addresses.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Syncs to Google Sheets</strong> &mdash; as the single source of truth, ready for mail-merge outreach.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Geo-filtered campaigns</strong> &mdash; by country, US state, timezone, or continent, with finer-grained search for dense cities.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Resumes after interruptions</strong> &mdash; picks up where it left off, and reprocesses records when the algorithm improves.</span></li>
            </ul>
            <h3 class="af-svc__bullets-label" style="margin-top:28px;">Tech stack</h3>
            <p class="af-body">Python &middot; Playwright &middot; Flask &middot; Google Places API &middot; Geocoding &middot; Hunter.io &middot; NeverBounce &middot; Google Sheets API &middot; GCP Compute Engine (systemd) &middot; GCS &middot; SQLite (SCD Type 2 data quality) &middot; Terraform/OpenTofu</p>

            <div class="af-svc__applied">
              <p class="af-svc__applied-label">Applied to your needs</p>
              <p class="af-svc__applied-body">The same pattern &mdash; <strong>a resumable, geo-aware data pipeline with verified contact enrichment</strong> &mdash; can be built for your organization: asset and vendor discovery across your cloud footprint, third-party risk outreach at scale, or customer-trust contact enrichment for your enterprise sales motion. We build it to resume, reprocess, and stay within budget.</p>
            </div>

            <div class="af-diagram">
              <figure class="af-diagram__figure">
                <img src="assets/studio-finder-flow.svg" data-af-diagram="studio-finder-flow" data-i18n-attr="alt:svg.studio_finder_flow.alt" alt="World Studio Finder pipeline: step 1 geo-target regions (country, US state, timezone, continent, hex grid); step 2a Playwright scrape of Google Maps with 2x2 grid search and anti-detection, 2b Google Places API fallback with Geocoding; step 3 studio records collected (name, address, website, phone, category); step 4a Hunter.io email lookup and 4b website scrape for contact info; step 5 verify and filter emails via NeverBounce and junk-domain filtering; step 6 store and sync to SQLite SCD Type 2 with JSONL checkpointing and Google Sheets sync; step 7 decision — has verified email? YES leads to 8a YAMM mail merge with geo-filtered campaigns, NO leads to 8b automated web form submission for no-email studios. Infrastructure: GCP Compute Engine, GCS, Flask, Terraform/OpenTofu, algorithm-version tracking." class="af-diagram__img" width="820" height="1040" loading="lazy"/>
                <figcaption class="af-diagram__caption"><strong>Figure 2.</strong> World Studio Finder pipeline &mdash; from geo-targeted map search through email discovery, verification, storage, and the two outreach paths (mail merge or automatic contact-form submission). <a href="assets/studio-finder-flow.png" class="af-diagram__download" download>Download PNG &darr;</a></figcaption>
              </figure>
            </div>
          </article>

          <!-- PROJECT 3: MULTICLOUD-MULTIPASS -->
          <article class="af-svc">
            <div class="af-svc__tag-row">
              <span class="af-svc__tag">Cloud Management</span>
              <span class="af-svc__tag af-svc__tag--built">Built by AikiField</span>
            </div>
            <h2 class="af-svc__title">MultiCloud-MultiPass &mdash; Multi-Cloud Cost Kill Switch</h2>
            <p class="af-svc__lead">A multi-cloud cost control system that monitors spending across Google Cloud, OpenStack, and Cloudflare, with an emergency shut-off that stops runaway costs in seconds.</p>
            <p class="af-svc__bestfor">Open source at <a href="https://github.com/biofool/MultiCloud-MultiPass">github.com/biofool/MultiCloud-MultiPass</a> (AGPL-3.0) &mdash; the public face of the CloudManagement system.</p>
            <p class="af-svc__bestfor">How it works: each project declares expected usage before making paid API calls, then reports actual usage. If actual exceeds expectation by more than 20%, the job is stopped within seconds. Every 5 minutes the system polls quota usage; if exceeded, it pauses all services in that project. As a last resort, if spending crosses a budget threshold, it disconnects billing entirely.</p>
            <h3 class="af-svc__bullets-label">What it does</h3>
            <ul class="af-svc__bullets">
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Provider-agnostic</strong> &mdash; works with Google Cloud, OpenStack, Cloudflare, and any third-party API.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Catches runaway costs in seconds</strong> &mdash; not the 24&ndash;48 hours that billing reports lag.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Intent/actual reporting</strong> &mdash; declare expected usage, report actual, auto-stop on &gt;20% overrun.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Three-tier escalation</strong> &mdash; per-job (seconds), per-project (minutes), per-billing-account (hours).</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Free-tier optimization</strong> &mdash; tracks remaining free capacity per API per account and routes work to providers with capacity.</span></li>
              <li class="af-svc__bullet"><svg viewBox="0 0 24 24" fill="none" stroke="#0E4E44" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span><strong>Real-time dashboard</strong> &mdash; free-tier consumption across all providers and accounts.</span></li>
            </ul>
            <h3 class="af-svc__bullets-label" style="margin-top:28px;">Tech stack</h3>
            <p class="af-body">Python &middot; FastAPI &middot; Google Cloud Run &middot; Firestore &middot; BigQuery billing export &middot; OpenStack &middot; Cloudflare (R2, Pages, GraphQL analytics) &middot; Cloud Scheduler &middot; Cloud Functions &middot; Docker &middot; OpenTofu &middot; SQLite</p>

            <div class="af-svc__applied">
              <p class="af-svc__applied-label">Applied to your needs</p>
              <p class="af-svc__applied-body">The same pattern &mdash; <strong>a multi-cloud cost control layer with intent/actual reporting and a kill switch</strong> &mdash; can be built for your organization: a single dashboard for your cloud spend across providers, real-time overrun detection on your AI and data workloads, and an emergency shut-off before a runaway job generates a surprise bill. We design, build, and operate it on a fixed budget.</p>
            </div>
          </article>

        </div><!-- /.af-projects-split__projects -->

        <!-- RIGHT COLUMN: invitation card (request a live demo) — sticky -->
        <div class="af-projects-split__chat" id="see-it-live">
          <aside class="af-svc af-svc--invite">
            <div class="af-svc__tag-row">
              <span class="af-svc__tag af-svc__tag--flagship">See it live</span>
              <span class="af-svc__tag af-svc__tag--built">Free</span>
            </div>
            <h2 class="af-svc__title">Want to see it in action?</h2>
            <p class="af-svc__lead">If you want to see it live, request an invitation when you <a href="contact.html">contact us</a> &mdash; we&rsquo;re happy to show you how easy it is to stand one up.</p>
            <p class="af-svc__bestfor">The AikiField AI Chat runs in production at <a href="https://quantumaikido.com">quantumaikido.com</a>. We can walk you through a live demo, then design and build a corpus-specific chat grounded in your own knowledge base &mdash; runbooks, policies, product docs, or any body of text your team or customers keep asking about.</p>
            <a href="contact.html" class="af-btn af-btn--light af-svc__cta">Request an invitation</a>
            <p class="af-svc__fineprint">No account needed to look around this page &mdash; the project cards on the left describe what each system does and how the same pattern fits your needs.</p>
          </aside>
        </div><!-- /.af-projects-split__chat -->

      </div><!-- /.af-projects-split -->
    </div>
  </section>

  <!-- OVERVIEW DIAGRAM — below the split -->
  <section class="af-section">
    <div class="af-container">
      <h2 class="af-h2">Three systems we built &mdash; at a glance</h2>
      <p class="af-lead af-lead--wide">All three systems were designed and built by AikiField and run in production today &mdash; AI-grounded coaching, global studio outreach, and multi-cloud cost control. The engineering patterns behind them are directly available to your engagement.</p>
      <div class="af-diagram">
        <figure class="af-diagram__figure">
          <img src="assets/projects-overview.svg" data-af-diagram="projects-overview" data-i18n-attr="alt:svg.projects_overview.alt" alt="Overview diagram: AikiField sponsors two projects — AikiField AI Chat (inputs: member question and teaching corpus; core: Gemini API, SQLite FTS5, Cloud Run, Firestore, rate limiter, auth; outputs: cited answer and human coach escalation) and World Studio Finder (inputs: Google Maps, Places API, Hunter.io; core: Playwright scraper, email verifier, SQLite SCD Type 2, Google Sheets sync, geo-filter, Compute Engine; outputs: YAMM email campaigns and web form submission)." class="af-diagram__img" width="1120" height="760" loading="lazy"/>
          <figcaption class="af-diagram__caption"><strong>Figure 3.</strong> Overview of the two systems AikiField built, showing inputs, core components, and outputs for each. <a href="assets/projects-overview.png" class="af-diagram__download" download>Download PNG &darr;</a></figcaption>
        </figure>
      </div>
    </div>
  </section>

  <!-- APPLIED TO YOUR NEEDS — bridges the projects to client engagements -->
  <section class="af-section af-section--white">
    <div class="af-container">
      <div class="af-intro">
        <h2 class="af-h2">From these projects to your security program</h2>
        <p>These aren&rsquo;t portfolio pieces &mdash; they&rsquo;re proof of capability. Each system was built end-to-end by AikiField: architecture, implementation, cost controls, and ongoing operation. The same engineering judgment is what we bring to a fractional CISO engagement, a DevSecOps pipeline rebuild, or a custom security tool your team needs but can&rsquo;t buy off the shelf.</p>
      </div>
      <div class="af-grid af-grid--fit af-grid--28">
        <div class="af-principle">
          <p class="af-principle__tag">Built by AikiField</p>
          <h3 class="af-principle__title">Custom security tooling</h3>
          <p class="af-principle__body">Need a tool that doesn&rsquo;t exist &mdash; an AI triage assistant grounded in your policies, a vendor-risk outreach pipeline, an asset-discovery scanner for your cloud? We design, build, and operate it on a fixed budget, the same way we built the systems above.</p>
        </div>
        <div class="af-principle">
          <p class="af-principle__tag">Built by AikiField</p>
          <h3 class="af-principle__title">Cost-disciplined AI</h3>
          <p class="af-principle__body">The AI Chat runs free on a fixed budget because we engineered the cost controls &mdash; rate limiting, queuing, scope-aware escalation. We bring that same discipline to any AI feature you ship, so capability doesn&rsquo;t become a surprise bill.</p>
        </div>
        <div class="af-principle">
          <p class="af-principle__tag">Built by AikiField</p>
          <h3 class="af-principle__title">Pipelines that resume</h3>
          <p class="af-principle__body">The studio finder picks up where it left off and reprocesses when the algorithm improves. That resumable, data-quality-first pattern is what we apply to your vulnerability backlog, your compliance evidence collection, and your third-party risk program.</p>
        </div>
        <div class="af-principle">
          <p class="af-principle__tag">Built by AikiField</p>
          <h3 class="af-principle__title">Cloud cost control</h3>
          <p class="af-principle__body">The kill switch catches runaway cloud spend in seconds, not the 24&ndash;48 hours that billing reports lag. We bring that same real-time cost control to your AI workloads and multi-cloud deployments, so a runaway job never becomes a surprise bill.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- WHY WE SPONSOR -->
  <section class="af-section">
    <div class="af-container">
      <div class="af-intro">
        <h2 class="af-h2">From phronesis to Quantum Leadership</h2>
        <p>Aristotle called it <em>phronesis</em> &mdash; practical wisdom, the virtue of discerning right action not from abstract rules but from lived experience, contextual awareness, and moral perception. It is the wisdom the seasoned security leader exercises when reading a room during a breach, sensing which control matters most at this stage, or knowing when to push and when to yield.</p>
        <p>Quantum Leadership draws from the same well. Where classical leadership seeks certainty and control, quantum leadership embraces uncertainty, entanglement, and the observer effect &mdash; the recognition that the leader is not separate from the system but part of it, and that presence shapes outcome. It asks not "what is the plan?" but "what is the right action <em>now</em>, in this specific moment, with these specific people?" That question is phronesis in motion.</p>
        <p>Somatic practice embodies this bridge. The practitioner does not memorize responses &mdash; they cultivate the capacity to sense, blend, and redirect whatever arrives. Practice develops the judgment that no framework can encode. These projects extend that cultivation into technology: one brings AI-grounded coaching to the somatic practice community, the other connects that community across the globe. Both are built on fixed budgets, with disciplined cost tracking &mdash; the same lean, cost-aware engineering we bring to every security engagement.</p>
      </div>
      <div class="af-grid af-grid--fit af-grid--28">
        <div class="af-principle">
          <p class="af-principle__tag">Phronesis in practice</p>
          <h3 class="af-principle__title">Inspired presence</h3>
          <p class="af-principle__body">The AI coaching system embodies the quantum leader's capacity for calm, grounded response under uncertainty &mdash; available 24/7, sensing when a question exceeds its scope and escalating to human coaches with composure rather than rigid refusal.</p>
        </div>
        <div class="af-principle">
          <p class="af-principle__tag">Phronesis in practice</p>
          <h3 class="af-principle__title">Relational entanglement</h3>
          <p class="af-principle__body">The studio discovery pipeline builds connection across the global movement-arts community &mdash; the quantum recognition that the leader and the system are not separate. Finding the studios, reaching out, and extending the conversation is relational practice at scale.</p>
        </div>
        <div class="af-principle">
          <p class="af-principle__tag">Phronesis in practice</p>
          <h3 class="af-principle__title">Open inquiry</h3>
          <p class="af-principle__body">Both systems are built to sense and adapt &mdash; cost monitoring and data quality checks that embody the phronetic stance: question assumptions, hold not-knowing, and let emerging signals shape the response.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="af-section af-section--lg">
    <div class="af-container">
      <div class="af-callout af-callout--sm">
        <h2 class="af-callout__title af-callout__title--sm">Want this capability built for you?</h2>
        <p class="af-callout__body af-callout__body--sm af-callout__body--52">We built the systems above end-to-end &mdash; architecture, code, cost controls, and operation. The same engineering can be tailored to fit your security program, your stack, and your budget. Let&rsquo;s talk about what you need built.</p>
        <a href="contact.html" class="af-btn af-btn--light">Book a Discovery Call</a>
      </div>
    </div>
  </section>
</main>

<!-- FOOTER -->
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
        <li><a href="process.html">Engagement Process</a></li>
        <li><a href="approach.html">Our Approach</a></li>
        <li><a href="services.html">Services</a></li>
        <li><a href="case-studies.html">Case Studies</a></li>
        <li><a href="fractional-ciso-for-saas.html">Fractional CISO for SaaS</a></li>
        <li><a href="ai-devsecops-vulnerability-remediation.html">AI DevSecOps Remediation</a></li>
        <li><a href="projects.php">Demonstration Technologies</a></li>
        <li><a href="assessment.html">Self-Assessment</a></li>
      </ul>
    </nav>
    <nav aria-label="Connect">
      <h3 class="af-footer__col-title">Connect</h3>
      <ul class="af-footer__nav">
        <li><a href="contact.html">Contact</a></li>
        <li><a href="contact.html">Inquiry</a></li>
      </ul>
    </nav>
  </div>
  <div class="af-footer__legal">&copy; 2026 AikiField. All rights reserved.</div>
</footer>

<script src="/js/locale-utils.js?v=20260818i18n"></script>
<script src="/js/language-selector.js?v=20260818i18n"></script>
</body>
</html>
