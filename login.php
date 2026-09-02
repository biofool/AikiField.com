<?php
/**
 * AikiField — blind standalone login page.
 *
 * This page exists to gate the /beta/ assessment pages. It is intentionally
 * NOT linked from the public navigation (blind URL, same policy as
 * quantumaikido.com/web/login.php). Visitors reach it only via the redirect
 * from includes/beta-gate.load.php when they try to open a /beta/ page
 * without an established coaching session.
 *
 * History: the coaching login previously lived inline on projects.php as a
 * public CTA. That surface was removed (projects.php now shows an invitation
 * card instead — see docs/coach-auth-prd.md). The login form + PHP session
 * handler were extracted here so /beta/ gating keeps working without a
 * public login on the marketing site.
 *
 * Authenticates against the AI Ki Questions Fielded backend (AIRichardMoon
 * on Cloud Run) via coach-proxy.php, using the same PHP session cookie
 * contract as the former projects.php integration (session keys: qa_email,
 * qa_session_token, qa_target_env, qa_is_admin). includes/beta-gate.load.php
 * reads the same session, so logging in here unlocks all /beta/ pages for
 * the cookie lifetime (7 days).
 *
 * Supports a ?next= query parameter (URL-encoded path) for post-login
 * redirect — beta-gate.load.php passes the originally-requested path so the
 * user lands back on the page they wanted. Defaults to /beta/ when omitted.
 *
 * Ported from projects.php (issue #51 unified login) and
 * quantumaikido.com/web/login.php. coach-login.js posts the backend-login
 * here to establish the server-side session, then redirects to
 * window.COACH_LOGIN_REDIRECT (which PHP sets to the ?next= value).
 *
 * BLIND URL NOTE: Do NOT add links to this page in includes/nav.php, the
 * footer, or any public-facing page. It is reachable only via the beta-gate
 * redirect. See docs/coach-auth-prd.md.
 *
 * Dual-PRD coordination: changes to this auth flow MUST update
 *   - docs/coach-auth-prd.md (this repo)
 *   - ~/projects/quantumaikido.com/web/docs/coach-dashboard-prd.md
 *   - ~/projects/AIRichardMoon/backend/PRD.md
 * See docs/coach-auth-prd.md and AGENTS.md.
 */

require __DIR__ . '/includes/coach-config.load.php';

/**
 * Open-redirect guard for AikiField ?next= redirects.
 *
 * Rejects absolute URLs, scheme-relative //evil.com, backslashes (WHATWG
 * URL treats \ as /, so /%5Cevil.com resolves to https://evil.com/),
 * percent-encoded backslashes, CR/LF injection, and login.php targets.
 * Also rejects any path that resolves off-site.
 */
function af_safe_redirect(?string $candidate, string $fallback): string
{
    $candidate = is_string($candidate) ? trim($candidate) : '';
    if ($candidate === ''
        || $candidate[0] !== '/'
        || str_starts_with($candidate, '//')
        || parse_url($candidate, PHP_URL_HOST) !== null
        || parse_url($candidate, PHP_URL_SCHEME) !== null
        || str_contains($candidate, "\r")
        || str_contains($candidate, "\n")
        || af_contains_backslash($candidate)
    ) {
        return $fallback;
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443) ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'aikifield.com';
    if (af_url_is_offsite($candidate, $scheme, $host)) {
        return $fallback;
    }

    $path = parse_url($candidate, PHP_URL_PATH) ?? '';
    if (str_ends_with($path, '/login.php') || $path === '/login' || str_ends_with($path, '/login.html')) {
        return $fallback;
    }
    return $candidate;
}

function af_contains_backslash(string $s): bool
{
    for ($i = 0; $i < 4; $i++) {
        if (str_contains($s, '\\')) {
            return true;
        }
        if (str_contains(strtolower($s), '%5c')) {
            return true;
        }
        $next = rawurldecode($s);
        if ($next === $s) {
            break;
        }
        $s = $next;
    }
    return false;
}

function af_url_is_offsite(string $candidate, string $scheme, string $host): bool
{
    if (str_starts_with($candidate, '//')) {
        return true;
    }
    if (parse_url($candidate, PHP_URL_SCHEME) !== null) {
        return true;
    }
    $absolute = $scheme . '://' . $host . $candidate;
    $parts = parse_url($absolute);
    $base = parse_url($scheme . '://' . $host);
    if (!$parts || !$base
        || ($parts['host'] ?? '') !== ($base['host'] ?? '')
        || ($parts['port'] ?? null) !== ($base['port'] ?? null)
    ) {
        return true;
    }
    return false;
}

// --- Start PHP session with secure cookie settings ---
// Identical params to the former projects.php handler and to
// includes/beta-gate.load.php — the session cookie must be valid site-wide
// so /beta/ pages read it.
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

// --- Resolve post-login destination (?next=, else default) ---
// Only allow same-origin relative paths for ?next= to prevent open redirect.
$nextRaw = $_GET['next'] ?? '';
$loginRedirect = af_safe_redirect($nextRaw, '/beta/');

// --- If already authed, skip the form and go to ?next= ---
if ($qaAlreadyAuthed) {
    header('Location: ' . $loginRedirect);
    exit;
}

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
                // Timestamp this check-session call so includes/beta-gate.load.php
                // knows not to re-check again immediately; it re-verifies on its
                // own cadence from this point rather than trusting the session
                // for the full 7-day cookie lifetime.
                $_SESSION['qa_session_checked_at'] = time();
                $qaSessionEstablished = true;
            } else {
                error_log('login.php: check-session returned ok=false for ' . $postEmail);
            }
        } else {
            error_log('login.php: check-session failed http=' . (int)$code
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
    header('Location: ' . ($_SERVER['SCRIPT_NAME'] ?? '/login.php'));
    exit;
}

$apiBase = '/coach-api';
$coachLoginUrl = $_SERVER['SCRIPT_NAME'] ?? '/login.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <meta name="theme-color" content="#0f2942">
  <meta name="robots" content="noindex,nofollow">
  <title>Sign in — AikiField</title>
  <meta name="description" content="Sign in to access AikiField beta assessment pages.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
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
      <a href="projects.php" class="af-nav__link">Projects</a>
      <a href="assessment.html" class="af-nav__link">Assessment</a>
      <a href="contact.html" class="af-nav__cta">Get Started</a>
    </nav>
  </div>
</header>

<main id="main">

  <section class="af-section af-section--lg">
    <div class="af-container">
      <div class="af-intro" style="max-width:520px;margin:0 auto;">

      <!-- Two-column layout: left = sign in/register, right = caveats.
           On mobile, caveats appear first as a collapsible <details> section. -->
      <div class="coach-login-layout">

      <!-- Left column: auth forms -->
      <div class="coach-login-forms">

      <!-- Login step -->
      <div id="coach-login" class="coach-card coach-card--highlight">
        <h2>Sign In</h2>
        <p class="coach-intro">Sign in or register to access the beta assessment pages.</p>

        <!-- Social login buttons (shown if OAuth is configured) -->
        <div id="coach-social" class="coach-social" hidden>
          <!-- OAuth provider buttons are dynamically rendered by coach-login.js -->
        </div>

        <div id="coach-divider" class="coach-divider" hidden><span>or</span></div>

        <!-- Login form -->
        <form id="coach-login-form" class="coach-form" novalidate>
          <label for="coach-email" class="coach-label">Email address or login ID</label>
          <input type="text" id="coach-email" class="coach-input" placeholder="name@example.com or your login ID" required autocomplete="username">

          <label for="coach-password" class="coach-label">Password</label>
          <input type="password" id="coach-password" class="coach-input" placeholder="Password" required autocomplete="current-password">

          <div id="coach-login-validation" class="coach-login-validation" hidden>
              <label for="coach-login-validation-code" class="coach-label">Email validation code <span class="coach-reg-hint" style="display:inline;font-weight:normal;">(sent to your email)</span></label>
              <input type="text" id="coach-login-validation-code" class="coach-input" placeholder="Enter the 6-digit code from your email" autocomplete="off" inputmode="numeric" pattern="[0-9]{6}">
              <button type="button" id="coach-login-resend-code-btn" class="btn btn-link coach-reg-send-code-btn">Resend validation code</button>
          </div>

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

        <!-- Consent notice (issue #20) -->
        <p class="coach-consent-notice">By signing in, you confirm that you have read the privacy notice and agree to the processing described in the Privacy Policy.</p>

        <!-- Toggle between login and register -->
        <div class="coach-toggle-row">
          <span id="coach-toggle-text">Don&rsquo;t have an account?</span>
          <button type="button" id="coach-toggle-btn" class="btn btn-link">Register</button>
        </div>
      </div>

      <!-- Registration form -->
      <div id="coach-register" class="coach-card" hidden>
        <h2>Create Account</h2>
        <p class="coach-intro">Sign up with your email and password to access the beta pages.</p>

        <form id="coach-register-form" class="coach-form" novalidate>
          <div class="coach-reg-columns">
            <!-- Left column: required fields -->
            <div class="coach-reg-col coach-reg-required">
              <h3 class="coach-reg-col-heading">Required</h3>

              <label for="coach-reg-email" class="coach-label">Email address</label>
              <input type="email" id="coach-reg-email" class="coach-input" placeholder="name@example.com" required autocomplete="email">

              <button type="button" id="coach-reg-send-code-btn" class="btn btn-link coach-reg-send-code-btn">Send validation code</button>
              <div id="coach-reg-email-status" class="coach-status" role="alert" hidden></div>

              <label for="coach-reg-validation-code" class="coach-label">Email validation code <span class="coach-reg-hint" style="display:inline;font-weight:normal;">(sent to your email)</span></label>
              <input type="text" id="coach-reg-validation-code" class="coach-input" placeholder="Enter the 6-digit code from your email" autocomplete="off" inputmode="numeric" pattern="[0-9]{6}">

              <label for="coach-reg-password" class="coach-label">Password</label>
              <input type="password" id="coach-reg-password" class="coach-input" placeholder="Choose a password (min 12 characters)" required autocomplete="new-password">

              <label for="coach-reg-code" class="coach-label">Invitation code <span class="coach-reg-hint" style="display:inline;font-weight:normal;">(if you have one)</span></label>
              <input type="text" id="coach-reg-code" class="coach-input" placeholder="Enter your invitation code (optional)" autocomplete="off">
            </div>

            <!-- Right column: optional fields -->
            <div class="coach-reg-col coach-reg-optional">
              <h3 class="coach-reg-col-heading">Optional</h3>

              <label for="coach-reg-alias" class="coach-label">Alias / username</label>
              <input type="text" id="coach-reg-alias" class="coach-input" placeholder="Choose a login name (or leave blank)" autocomplete="username">
              <p class="coach-reg-hint">If set, you can log in with this instead of your email. Letters, numbers, hyphens, underscores, and dots only.</p>

              <label for="coach-reg-language" class="coach-label">Preferred language</label>
              <select id="coach-reg-language" class="coach-input">
                <option value="">English (auto-detect)</option>
              </select>
              <p class="coach-reg-hint">Overrides auto-detection. AI Ki Questions Fielded will respond in this language.</p>
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
        <form id="coach-reset-form" class="coach-form" novalidate>
          <label for="coach-reset-password" class="coach-label">New password</label>
          <input type="password" id="coach-reset-password" class="coach-input" placeholder="New password (min 12 characters)" required autocomplete="new-password">
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

      </div><!-- /.coach-login-forms -->

      <!-- Right column: intro + caveats (privacy, attribution, safety) -->
      <details class="coach-login-caveats" open>
        <summary class="coach-caveats-summary">About this sign-in</summary>
        <div class="coach-caveats-body">

        <!-- Compressed intro panel -->
        <div class="coach-intro-panel coach-intro-panel--highlight">
          <h2>Beta Access <span class="coach-free-badge">Members</span></h2>
          <p class="coach-intro-subtitle">Sign in to access the AikiField beta assessment pages.</p>
          <p class="coach-intro-text">
            This sign-in gates the pre-release assessment tools under
            <code>/beta/</code>. The same account works on
            <a href="https://quantumaikido.com">quantumaikido.com</a> if you
            are an AI Ki Questions Fielded member.
          </p>
          <ul class="coach-intro-features">
            <li>Register with an invitation code, or sign in if you already have an account.</li>
            <li>Your session lasts 7 days and covers the whole <code>aikifield.com</code> origin.</li>
            <li>You can sign out from any beta page.</li>
          </ul>
        </div>

        <!-- Privacy summary (issue #20) -->
        <div id="coach-privacy-notice" class="coach-card coach-privacy-notice">
          <h2>Before you begin</h2>
          <ul class="coach-privacy-list">
            <li>Your session is stored in a cookie so you can return to the beta pages without signing in again.</li>
            <li>Authentication is handled by the AI Ki Questions Fielded backend on Google Cloud Run.</li>
            <li>Please do not enter sensitive personal information.</li>
          </ul>
          <div class="coach-privacy-links">
            <a href="https://quantum-aikido-coach-6bfpsd3kkq-uc.a.run.app/v1/policies/corpus-privacy" target="_blank" rel="noopener">Read the Privacy Policy</a>
            <a href="https://quantum-aikido-coach-6bfpsd3kkq-uc.a.run.app/v1/policies/ai-security" target="_blank" rel="noopener">Read the AI Security &amp; Safety Notice</a>
          </div>
        </div>

        </div><!-- /.coach-caveats-body -->
      </details>

      </div><!-- /.coach-login-layout -->

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

<script>
// Pass backend URLs and config to JS. This MUST run before coach-login.js
// (loaded below) — it reads these values at load time.
window.COACH_API_BASE = <?= json_encode($apiBase) ?>;
window.COACH_BACKEND_URL = <?= json_encode(defined('COACH_BACKEND_URL') ? COACH_BACKEND_URL : '') ?>;
window.COACH_LOGIN_REDIRECT = <?= json_encode($loginRedirect) ?>;
window.COACH_LOGIN_URL = <?= json_encode($coachLoginUrl) ?>;
window.COACH_LOGOUT_URL = <?= json_encode($coachLoginUrl) ?>;
</script>
<script src="coach-login.js" defer></script>

</body>
</html>
