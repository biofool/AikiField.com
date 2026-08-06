<?php
/**
 * AikiField — Sponsored Projects (with coaching login integration).
 *
 * Converted from the static projects.html. The page now leads with a login +
 * registration section that authenticates against the Quantum Aikido coaching
 * backend (AIRichardMoon on Cloud Run) via coach-proxy.php, so visitors can
 * sign in to (or create an account for) the AikiField AI Chat directly from
 * the Sponsored Projects page. The existing marketing content follows below.
 *
 * Ported from quantumaikido.com/web/login.php (issue #51 unified login):
 *   - PHP session cookie stores the backend session (email + sessionToken).
 *   - coach-login.js handles login/register/reset/confirm and posts the
 *     backend-login here to establish the server-side session.
 *   - On success the user is redirected back to this page (projects.php),
 *     which now renders the AI Chat inline (coach-chat.js) instead of the
 *     login form. The chat calls /coach-api/v1/chat-secure on this same
 *     origin, so the aikifield.com session cookie is valid — no
 *     cross-domain redirect.
 *
 * BLIND URL NOTE: This page IS linked from the public nav (it is a marketing
 * page). The login form is a CTA on a public page, not a gated area — the
 * sponsored-projects content remains visible to all visitors.
 *
 * Dual-PRD coordination: changes to this auth flow MUST update
 *   - docs/coach-auth-prd.md (this repo)
 *   - ~/projects/quantumaikido.com/web/docs/coach-dashboard-prd.md
 *   - ~/projects/AIRichardMoon/backend/PRD.md
 * See docs/coach-auth-prd.md and AGENTS.md.
 */

require __DIR__ . '/includes/coach-config.load.php';

// --- Start PHP session with secure cookie settings ---
if (session_status() === PHP_SESSION_NONE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443);
    session_set_cookie_params([
        'lifetime' => 86400 * 7,  // 7 days
        'path'     => '/',
        'domain'   => '',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

$qaEmail        = $_SESSION['qa_email'] ?? null;
$qaSessionToken = $_SESSION['qa_session_token'] ?? null;
$qaAlreadyAuthed = !empty($qaEmail) && !empty($qaSessionToken);

// --- Handle POST from coach-login.js (establish server-side session) ---
// coach-login.js posts email + sessionToken here after a successful backend
// auth. We verify against the backend and store in the PHP session cookie.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'backend-login') {
    $postEmail = trim($_POST['email'] ?? '');
    $postToken = trim($_POST['sessionToken'] ?? '');
    $qaSessionEstablished = false;
    if ($postEmail !== '' && $postToken !== '') {
        $verifyUrl = rtrim(COACH_BACKEND_URL, '/') . '/v1/auth/check-session';
        $payload = json_encode(['email' => $postEmail, 'sessionToken' => $postToken]);
        $ch = curl_init($verifyUrl);
        $reqHeaders = ['Content-Type: application/json'];
        if (defined('COACH_PROXY_SECRET') && COACH_PROXY_SECRET !== '') {
            $reqHeaders[] = 'X-Proxy-Secret: ' . COACH_PROXY_SECRET;
        }
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => $reqHeaders,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_SSL_VERIFYPEER => COACH_VERIFY_TLS,
            CURLOPT_SSL_VERIFYHOST => COACH_VERIFY_TLS ? 2 : 0,
        ]);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp !== false && $code === 200) {
            $data = json_decode($resp, true);
            if ($data['ok'] ?? false) {
                session_regenerate_id(true);
                $_SESSION['qa_email']         = $data['email'] ?? $postEmail;
                $_SESSION['qa_session_token'] = $postToken;
                $_SESSION['qa_target_env']    = $data['targetEnvironment'] ?? 'both';
                $_SESSION['qa_is_admin']      = $data['admin'] ?? false;
                $qaSessionEstablished = true;
            } else {
                error_log('projects.php: check-session returned ok=false for ' . $postEmail);
            }
        } else {
            error_log('projects.php: check-session failed http=' . (int)$code
                . ' err=' . ($resp === false ? 'transport' : 'status'));
        }
    }
    session_write_close();
    header('Content-Type: application/json');
    http_response_code(200);
    echo json_encode(['ok' => $qaSessionEstablished]);
    exit;
}

// --- Handle logout ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $p['path'], $p['domain'] ?? '',
            $p['secure'] ?? false, $p['httponly'] ?? false);
    }
    session_destroy();
    header('Location: ' . ($_SERVER['SCRIPT_NAME'] ?? '/projects.php'));
    exit;
}

$apiBase = '/coach-api';
// After login, stay on this page — it now renders the chat inline (same
// origin, so the session cookie is valid). No cross-domain redirect.
$loginRedirect = $_SERVER['SCRIPT_NAME'] ?? '/projects.php';
$coachLoginUrl = $_SERVER['SCRIPT_NAME'] ?? '/projects.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AikiField — Sponsored Projects</title>
  <meta name="description" content="Projects AikiField sponsors at the intersection of security leadership, AI, and the somatic practice community — somatic-informed AI coaching and global studio outreach.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/redesign.css">
  <link rel="stylesheet" href="coach-auth.css">
  <?php if (defined('TURNSTILE_SITE_KEY') && TURNSTILE_SITE_KEY): ?>
  <script>
    // Turnstile callbacks must be defined BEFORE coach-login.js loads.
    window.qaTurnstileTokens = { reg: "", forgot: "", login: "" };
    window.onTurnstileSuccess = function(token) {
      var fc = document.getElementById("coach-forgot-captcha");
      if (fc && !fc.hidden) { window.qaTurnstileTokens.forgot = token; return; }
      var lc = document.getElementById("coach-login-captcha");
      if (lc && !lc.hidden) { window.qaTurnstileTokens.login = token; return; }
      window.qaTurnstileTokens.reg = token;
    };
    window.onTurnstileError = function() {
      window.qaTurnstileTokens = { reg: "", forgot: "", login: "" };
    };
    window.onTurnstileExpired = function() {
      window.qaTurnstileTokens = { reg: "", forgot: "", login: "" };
    };
  </script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <?php endif; ?>
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
      <a href="index.html" class="af-nav__link">Home</a>
      <a href="process.html" class="af-nav__link">Process</a>
      <a href="approach.html" class="af-nav__link">Approach</a>
      <a href="services.html" class="af-nav__link">Services</a>
      <a href="case-studies.html" class="af-nav__link">Case Studies</a>
      <a href="projects.php" class="af-nav__link af-nav__link--active" aria-current="page">Projects</a>
      <a href="assessment.html" class="af-nav__link">Assessment</a>
      <a href="contact.html" class="af-nav__cta">Get Started</a>
    </nav>
  </div>
</header>

<main id="main">

  <!-- ============================================================ -->
  <!-- COACHING LOGIN — lead of the Sponsored Projects page         -->
  <!-- Sign in / register for the AikiField AI Chat. Ported from    -->
  <!-- quantumaikido.com/web/login.php (issue #51).                 -->
  <!-- ============================================================ -->
  <section class="af-section af-section--white">
    <div class="af-container">
      <div class="coach-shell">

      <!-- Intro / CTA panel -->
      <div class="coach-intro-panel">
        <h2>AikiField AI Chat</h2>
        <p class="coach-intro-text">
          An AI coaching chat grounded in Richard Moon&rsquo;s teachings &mdash;
          presence under pressure, breathing, mental focus, and the art of
          improving your state of being. Ask a question, explore the practice,
          or request a handoff to a human coach.
        </p>
        <ul class="coach-intro-features">
          <li>AI-powered answers with citations back to the source teachings</li>
          <li>Escalates to a live human coach by video when a question needs it</li>
          <li>Free to use &mdash; create an account below to start chatting</li>
        </ul>
      </div>

      <?php if ($qaAlreadyAuthed): ?>
      <!-- Signed-in state: the AI Chat, inline (ported from members.php) -->
      <div id="coach-chat" class="coach-card">
        <div class="coach-chat-header">
          <h2>AikiField AI Chat</h2>
          <div id="coach-user-info" class="coach-user-info"></div>
          <button type="button" id="coach-clear-btn" class="btn btn-secondary coach-clear-btn" title="Clear the conversation">Clear</button>
          <button id="coach-logout" class="btn btn-secondary coach-logout-btn">Sign out</button>
        </div>
        <div id="coach-messages" class="coach-messages"></div>
        <div id="coach-queue-banner" class="coach-queue-banner" hidden></div>
        <form id="coach-chat-form" class="coach-chat-form">
          <div class="coach-input-row">
            <textarea id="coach-chat-input" class="coach-chat-input" placeholder="Ask the coach anything..." maxlength="4000" rows="3"></textarea>
            <button type="submit" class="btn btn-primary" id="coach-send-btn" aria-label="Send message">&#10148;</button>
          </div>
          <div class="coach-input-footer">
            <div class="coach-lang-selector">
              <label for="coach-language-select" class="sr-only">Response language</label>
              <select id="coach-language-select" class="coach-language-select" title="Overrides auto-detection. Leave as English to let the coach detect your language automatically.">
                <option value="en">English (auto-detect)</option>
              </select>
            </div>
            <div id="coach-send-hint" class="coach-send-hint" hidden>Press Enter again to send</div>
            <div class="coach-char-counter"><span id="coach-char-count">0</span> / 4000</div>
          </div>
        </form>
        <!-- Member-initiated coach handoff prompt (issue #103) -->
        <div id="coach-handoff-prompt" class="coach-handoff-prompt" hidden>
          <button type="button" id="coach-handoff-trigger" class="coach-handoff-trigger">Talk to a human coach</button>
          <div id="coach-handoff-form" class="coach-handoff-form" hidden>
            <p class="coach-handoff-q">Would you like to discuss this with an Aikido Coach?</p>
            <div class="coach-handoff-yesno" data-q="q1">
              <button type="button" class="coach-handoff-choice" data-val="yes">Yes</button>
              <button type="button" class="coach-handoff-choice" data-val="no">No, thanks</button>
            </div>
            <div class="coach-handoff-q2" hidden>
              <p class="coach-handoff-q">Should I send them a summary of this chat?</p>
              <div class="coach-handoff-yesno" data-q="q2">
                <button type="button" class="coach-handoff-choice" data-val="yes">Yes, send a summary</button>
                <button type="button" class="coach-handoff-choice" data-val="no">No, just my question</button>
              </div>
            </div>
            <div class="coach-handoff-q3" hidden>
              <p class="coach-handoff-q">What specific question would you like to discuss with the coach?</p>
              <textarea id="coach-handoff-question" class="coach-handoff-question" maxlength="4000" rows="3" placeholder="Your question for the human coach (optional)..."></textarea>
              <div class="coach-handoff-actions">
                <button type="button" class="btn btn-primary" id="coach-handoff-submit">Request coach</button>
                <button type="button" class="coach-handoff-cancel" id="coach-handoff-cancel">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <?php else: ?>

      <!-- Privacy notice (mirrors the QA members login) -->
      <div id="coach-privacy-notice" class="coach-card coach-privacy-notice">
        <h2>Privacy notice</h2>
        <ul class="coach-privacy-list">
          <li>The coaching chatbot is available to invited members only. Your questions are stored so you can resume conversations and so we can test improvements to the system; they are never shared except with the AI provider (Google Gemini) needed to generate your response.</li>
          <li>The chatbot&rsquo;s answers are grounded in a private library of teaching material. The library does not attribute teachings to any named person, and the chatbot will not quote anyone by name.</li>
          <li>You may request deletion of your conversation history at any time.</li>
          <li>No phone numbers, email addresses, or other personal details are retained in the library.</li>
          <li>The <a href="https://quantum-aikido-coach-6bfpsd3kkq-uc.a.run.app/v1/policies/corpus-privacy" target="_blank" rel="noopener">full privacy policy</a> is available online.</li>
          <li>Read the <a href="https://quantum-aikido-coach-6bfpsd3kkq-uc.a.run.app/v1/policies/ai-security" target="_blank" rel="noopener">AI security &amp; safety notice</a> for how the chatbot filters misuse, when it hands off to a human coach, and how to report a concern.</li>
        </ul>
        <p class="coach-privacy-ack">By logging in you acknowledge this notice.</p>
      </div>

      <!-- Login step -->
      <div id="coach-login" class="coach-card">
        <h2>Sign in to the AI Chat</h2>
        <p class="coach-intro">Have an invitation code? Sign in, or register below to create your account and start chatting.</p>

        <!-- Social login buttons (shown if OAuth is configured) -->
        <div id="coach-social" class="coach-social" hidden>
          <!-- OAuth provider buttons are dynamically rendered by coach-login.js -->
        </div>

        <div id="coach-divider" class="coach-divider" hidden><span>or</span></div>

        <!-- Login form -->
        <form id="coach-login-form" class="coach-form">
          <label for="coach-email" class="coach-label">Email or login ID</label>
          <input type="text" id="coach-email" class="coach-input" placeholder="you@example.com or your login ID" required autocomplete="username">

          <label for="coach-password" class="coach-label">Password</label>
          <input type="password" id="coach-password" class="coach-input" placeholder="Your password" required autocomplete="current-password" minlength="8">

          <button type="submit" class="btn btn-primary" id="coach-login-btn">Sign in</button>
          <button type="button" id="coach-forgot-btn" class="btn btn-link coach-forgot-link">Forgot password?</button>

          <?php if (defined('TURNSTILE_SITE_KEY') && TURNSTILE_SITE_KEY): ?>
          <div id="coach-login-captcha" class="coach-login-captcha">
            <div class="cf-turnstile"
                 data-sitekey="<?php echo htmlspecialchars(TURNSTILE_SITE_KEY); ?>"
                 data-callback="onTurnstileSuccess"
                 data-error-callback="onTurnstileError"
                 data-expired-callback="onTurnstileExpired"></div>
          </div>
          <div id="coach-forgot-captcha" class="coach-forgot-captcha" hidden>
            <div class="cf-turnstile"
                 data-sitekey="<?php echo htmlspecialchars(TURNSTILE_SITE_KEY); ?>"
                 data-callback="onTurnstileSuccess"
                 data-error-callback="onTurnstileError"
                 data-expired-callback="onTurnstileExpired"></div>
          </div>
          <?php endif; ?>
        </form>

        <div id="coach-login-status" class="coach-status" hidden></div>

        <!-- Toggle between login and register -->
        <div class="coach-toggle-row">
          <span id="coach-toggle-text">Don&rsquo;t have an account?</span>
          <button type="button" id="coach-toggle-btn" class="btn btn-link">Register</button>
        </div>
      </div>

      <!-- Registration form -->
      <div id="coach-register" class="coach-card" hidden>
        <h2>Create your account</h2>
        <p class="coach-intro">Register with your email, password, and invitation code to start using the AI Chat.</p>

        <form id="coach-register-form" class="coach-form">
          <div class="coach-reg-columns">
            <!-- Left column: required fields -->
            <div class="coach-reg-col coach-reg-required">
              <h3 class="coach-reg-col-heading">Required</h3>

              <label for="coach-reg-email" class="coach-label">Email address</label>
              <input type="email" id="coach-reg-email" class="coach-input" placeholder="you@example.com" required autocomplete="email">

              <label for="coach-reg-password" class="coach-label">Password</label>
              <input type="password" id="coach-reg-password" class="coach-input" placeholder="Choose a password (min 8 chars)" required autocomplete="new-password" minlength="8">

              <label for="coach-reg-code" class="coach-label">Invitation code</label>
              <input type="text" id="coach-reg-code" class="coach-input" placeholder="Enter your invitation code" required autocomplete="off">
            </div>

            <!-- Right column: optional fields -->
            <div class="coach-reg-col coach-reg-optional">
              <h3 class="coach-reg-col-heading">Optional</h3>

              <label for="coach-reg-alias" class="coach-label">Alias / username</label>
              <input type="text" id="coach-reg-alias" class="coach-input" placeholder="Choose a login name (or leave blank)" autocomplete="username" maxlength="40">
              <p class="coach-reg-hint">If set, you can log in with this instead of your email. Letters, numbers, hyphens, underscores, and dots only.</p>

              <label for="coach-reg-language" class="coach-label">Preferred language</label>
              <select id="coach-reg-language" class="coach-input">
                <option value="">English (auto-detect)</option>
              </select>
              <p class="coach-reg-hint">Overrides auto-detection. The coach will respond in this language.</p>
            </div>
          </div>

          <?php if (defined('TURNSTILE_SITE_KEY') && TURNSTILE_SITE_KEY): ?>
          <div class="cf-turnstile"
               data-sitekey="<?php echo htmlspecialchars(TURNSTILE_SITE_KEY); ?>"
               data-callback="onTurnstileSuccess"
               data-error-callback="onTurnstileError"
               data-expired-callback="onTurnstileExpired"
               style="margin-top:0.5rem;"></div>
          <?php endif; ?>

          <button type="submit" class="btn btn-primary" id="coach-register-btn">Create account</button>
        </form>

        <div id="coach-register-status" class="coach-status" hidden></div>

        <div class="coach-toggle-row">
          <span>Already have an account?</span>
          <button type="button" id="coach-toggle-back-btn" class="btn btn-link">Sign in</button>
        </div>
      </div>

      <!-- Password reset form (shown when ?reset=token in URL) -->
      <div id="coach-reset-step" class="coach-card" hidden>
        <h2>Reset Password</h2>
        <p class="coach-intro">Enter your new password below.</p>
        <form id="coach-reset-form" class="coach-form">
          <label for="coach-reset-password" class="coach-label">New password</label>
          <input type="password" id="coach-reset-password" class="coach-input" placeholder="New password (min 8 chars)" required autocomplete="new-password" minlength="8">
          <button type="submit" class="btn btn-primary" id="coach-reset-btn">Reset password</button>
        </form>
        <div id="coach-reset-status" class="coach-status" hidden></div>
      </div>

      <!-- Confirmation status (shown when ?confirm=token in URL) -->
      <div id="coach-confirm-step" class="coach-card" hidden>
        <h2>Confirming your email...</h2>
        <p class="coach-intro" id="coach-confirm-text">Please wait while we confirm your email address.</p>
        <div id="coach-confirm-status" class="coach-status" hidden></div>
      </div>

      <?php endif; // end not-authenticated ?>

      </div>
    </div>
  </section>
  <!-- ============================================================ -->
  <!-- END COACHING LOGIN                                            -->
  <!-- ============================================================ -->

  <!-- PAGE HEADER -->
  <section class="af-page-header af-page-header--tight af-page-header--green">
    <div class="af-container">
      <p class="af-eyebrow">Sponsored Projects</p>
      <h1 class="af-h1">Where security leadership meets phronesis.</h1>
      <p class="af-lead af-lead--wide af-page-header__lead">Phronesis &mdash; the Aristotelian capacity for practical wisdom, discerning right action in the full complexity of a lived moment &mdash; is what Quantum Leadership demands. Not rigid frameworks, but the practiced judgment to navigate uncertainty, hold paradox, and respond appropriately to whatever arises. AikiField sponsors projects that embody this bridge: AI coaching that cultivates presence under pressure, and outreach that builds relational connection across the global movement-arts community.</p>
    </div>
  </section>

  <!-- OVERVIEW DIAGRAM -->
  <section class="af-section af-section--white">
    <div class="af-container">
      <h2 class="af-h2">The two projects at a glance</h2>
      <p class="af-lead af-lead--wide">Both projects extend phronesis into technology &mdash; one brings AI-grounded coaching to the somatic practice community, the other connects that community across the globe.</p>
      <div class="af-diagram">
        <figure class="af-diagram__figure">
          <img src="assets/projects-overview.svg" alt="Overview diagram: AikiField sponsors two projects — AikiField AI Chat (inputs: member question and teaching corpus; core: Gemini API, SQLite FTS5, Cloud Run, Firestore, rate limiter, auth; outputs: cited answer and human coach escalation) and World Studio Finder (inputs: Google Maps, Places API, Hunter.io; core: Playwright scraper, email verifier, SQLite SCD Type 2, Google Sheets sync, geo-filter, Compute Engine; outputs: YAMM email campaigns and web form submission)." class="af-diagram__img" width="1120" height="760" loading="lazy"/>
          <figcaption class="af-diagram__caption"><strong>Figure 1.</strong> Overview of AikiField&rsquo;s two sponsored projects, showing inputs, core components, and outputs for each. <a href="assets/projects-overview.png" class="af-diagram__download" download>Download PNG &darr;</a></figcaption>
        </figure>
      </div>
    </div>
  </section>

  <!-- PROJECT 1: AIKIFIELD AI CHAT -->
  <section class="af-section">
    <div class="af-container">

      <article class="af-svc af-svc--flagship">
        <div class="af-svc__tag-row">
          <span class="af-svc__tag af-svc__tag--flagship">AI Coaching</span>
        </div>
        <h2 class="af-svc__title">Aikifield AI Chat</h2>
        <p class="af-svc__lead">An AI coaching chat that answers questions from Richard Moon&rsquo;s teachings, with tight cost controls so it stays free.</p>
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

        <div class="af-diagram">
          <figure class="af-diagram__figure">
            <img src="assets/aichat-flow.svg" alt="AikiField AI Chat request flow: step 1 member asks a question; step 2a authenticate (email, password, Google OAuth, Turnstile) and 2b rate limit and queue; step 3 search teaching corpus via SQLite FTS5; step 4 Gemini drafts cited answer; step 5 decision — can it answer confidently? YES leads to 6a return cited answer (24/7, free, within budget), NO leads to 6b escalate to human coach via video link; step 7 member receives response. Infrastructure: Cloud Run, Firestore, Secret Manager, Pub/Sub, Cloud Functions, Docker, OpenTofu, DVC plus GCS." class="af-diagram__img" width="780" height="980" loading="lazy"/>
            <figcaption class="af-diagram__caption"><strong>Figure 2.</strong> AikiField AI Chat request flow &mdash; from member question through corpus search, Gemini-drafted answer, and the decision to return a cited answer or escalate to a live human coach. <a href="assets/aichat-flow.png" class="af-diagram__download" download>Download PNG &darr;</a></figcaption>
          </figure>
        </div>
      </article>

      <!-- PROJECT 2: STUDIO DISCOVERY -->
      <article class="af-svc">
        <div class="af-svc__tag-row">
          <span class="af-svc__tag">Outreach Pipeline</span>
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

        <div class="af-diagram">
          <figure class="af-diagram__figure">
            <img src="assets/studio-finder-flow.svg" alt="World Studio Finder pipeline: step 1 geo-target regions (country, US state, timezone, continent, hex grid); step 2a Playwright scrape of Google Maps with 2x2 grid search and anti-detection, 2b Google Places API fallback with Geocoding; step 3 studio records collected (name, address, website, phone, category); step 4a Hunter.io email lookup and 4b website scrape for contact info; step 5 verify and filter emails via NeverBounce and junk-domain filtering; step 6 store and sync to SQLite SCD Type 2 with JSONL checkpointing and Google Sheets sync; step 7 decision — has verified email? YES leads to 8a YAMM mail merge with geo-filtered campaigns, NO leads to 8b automated web form submission for no-email studios. Infrastructure: GCP Compute Engine, GCS, Flask, Terraform/OpenTofu, algorithm-version tracking." class="af-diagram__img" width="820" height="1040" loading="lazy"/>
            <figcaption class="af-diagram__caption"><strong>Figure 3.</strong> World Studio Finder pipeline &mdash; from geo-targeted map search through email discovery, verification, storage, and the two outreach paths (mail merge or automatic contact-form submission). <a href="assets/studio-finder-flow.png" class="af-diagram__download" download>Download PNG &darr;</a></figcaption>
          </figure>
        </div>
      </article>

    </div>
  </section>

  <!-- WHY WE SPONSOR -->
  <section class="af-section af-section--white">
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
        <h2 class="af-callout__title af-callout__title--sm">Interested in the methodology behind these projects?</h2>
        <p class="af-callout__body af-callout__body--sm af-callout__body--52">The same principles &mdash; lean engineering, cost discipline, and leadership capacity &mdash; drive every AikiField engagement. Let's talk about your security program.</p>
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
        <li><a href="projects.php">Sponsored Projects</a></li>
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

<script>
// Pass backend URLs and config to JS. This MUST run before coach-login.js /
// coach-chat.js (loaded below) — those scripts read these values at load time.
window.COACH_API_BASE = <?= json_encode($apiBase) ?>;
window.COACH_BACKEND_URL = <?= json_encode(defined('COACH_BACKEND_URL') ? COACH_BACKEND_URL : '') ?>;
window.COACH_LOGIN_REDIRECT = <?= json_encode($loginRedirect) ?>;
// coach-chat.js uses these for logout + session-expiry redirects (back to
// this page, not QA's /login.php).
window.COACH_LOGIN_URL = <?= json_encode($coachLoginUrl) ?>;
window.COACH_LOGOUT_URL = <?= json_encode($coachLoginUrl) ?>;
<?php if ($qaAlreadyAuthed): ?>
// Inject the authenticated session for coach-chat.js (same pattern as QA
// members.php). coach-chat.js reads window.QA_SESSION instead of
// sessionStorage.
window.QA_SESSION = {
    email: <?= json_encode($qaEmail ?? '') ?>,
    token: <?= json_encode($qaSessionToken ?? '') ?>,
    targetEnv: <?= json_encode($_SESSION['qa_target_env'] ?? 'both') ?>,
    isAdmin: <?= json_encode($_SESSION['qa_is_admin'] ?? false) ?>
};
<?php endif; ?>
</script>
<?php if ($qaAlreadyAuthed): ?>
<script src="coach-chat.js"></script>
<?php else: ?>
<script src="coach-login.js"></script>
<?php endif; ?>

</body>
</html>
