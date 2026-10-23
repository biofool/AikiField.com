<?php
/**
 * /profile — Profile & Settings for the coaching account.
 *
 * Replica of quantumaikido.com/profile (profile.html + coach-profile.js),
 * which stays live there. Same AIRichardMoon backend, reached through this
 * site's /coach-api/* proxy (coach-proxy.php). See docs/coach-auth-prd.md.
 *
 * Auth: the same session gate as /beta/, /members and /for-review/
 * (includes/beta-gate.load.php). Signed-out visitors are redirected to the
 * blind /login.php?next=/profile and land back here after sign-in.
 *
 * Served at /profile via .htaccess (extensionless rewrite). The page embeds
 * the session token, so it must never be edge-cached; session_start() in the
 * gate sends Cache-Control: no-store.
 */

require __DIR__ . '/includes/beta-gate.load.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <meta name="robots" content="noindex,nofollow">
  <title>Profile &amp; Settings — AikiField</title>
  <meta name="description" content="Manage your AikiField coaching account: chat preferences, change password, change email, or delete your account.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="/css/redesign.css?v=20261003">
  <link rel="stylesheet" href="/coach-auth.css?v=20261005b">
</head>
<body>

<a href="#main" class="af-skip-link">Skip to main content</a>

<header class="af-header" role="banner">
  <div class="af-header__inner">
    <a href="/index.html" class="af-brand">
      <span class="af-brand__icon" aria-hidden="true">A</span>
      <span class="af-brand__text">AikiField</span>
    </a>
    <input type="checkbox" id="af-nav-check" class="af-nav-toggle-check">
    <label for="af-nav-check" class="af-nav__toggle" aria-label="Menu">&#9776;</label>
    <nav aria-label="Primary" class="af-nav">
      <a href="/index.html" class="af-nav__link">Home</a>
      <div class="af-nav__group">
        <a href="/services.html" class="af-nav__link">Services</a>
        <button type="button" class="af-nav__sub-toggle" aria-expanded="false" aria-controls="af-nav-sub-services" aria-label="Services pages"><span aria-hidden="true">&#9662;</span></button>
        <ul class="af-nav__submenu" id="af-nav-sub-services">
          <li><a href="/process.html" class="af-nav__sublink">Process</a></li>
          <li><a href="/approach.html" class="af-nav__sublink">Approach</a></li>
          <li><a href="/case-studies.html" class="af-nav__sublink" data-i18n="nav.case_studies">Case Studies</a></li>
          <li><a href="/assessment.html" class="af-nav__sublink" data-i18n="nav.assessment">Assessment</a></li>
        </ul>
      </div>
      <a href="/projects.php" class="af-nav__link">Demonstration Technologies</a>
      <div class="af-nav__group">
        <button type="button" class="af-nav__link af-nav__menu-btn" aria-expanded="false" aria-controls="af-nav-sub-uf" data-i18n="nav.unified_field_studies">Studies in the Unified Field</button>
        <ul class="af-nav__submenu af-nav__submenu--end af-nav__submenu--mega" id="af-nav-sub-uf">
          <li class="af-nav__megacol">
            <a href="/books.html" class="af-nav__colhead" data-i18n="nav.books">Books</a>
            <ul class="af-nav__megalist">
              <li><a href="/books.html" class="af-nav__sublink" data-i18n="nav.all_books">All Books</a></li>
              <li><a href="/blog/" class="af-nav__sublink" data-i18n="nav.insights_blog">Author's Insights blog</a></li>
            </ul>
          </li>
          <li class="af-nav__megacol">
            <a href="/digital-experience/" class="af-nav__colhead" data-i18n="nav.digital_experience">Digital Experience</a>
            <ul class="af-nav__megalist">
              <li><a href="/digital-experience/lucky-wave.html#v2" class="af-nav__sublink">Ride the Lucky Wave V2</a></li>
              <li><a href="/games/exercises/" class="af-nav__sublink">Twenty Practices</a></li>
              <li class="af-nav__subsep"><a href="/members" class="af-nav__sublink af-nav__sublink--feature">Enter the Unified Field Chat</a></li>
              <li class="af-nav__subsep"><a href="/blog/index.html#social" class="af-nav__sublink" data-i18n="nav.social_media">Social Media</a></li>
            </ul>
          </li>
        </ul>
      </div>
      <a href="/somatic-studios/" class="af-nav__link" data-i18n="nav.somatic_studios">Free Services For Studios</a>
      <a href="/contact.html" class="af-nav__cta">Get Started</a>
    </nav>
  </div>
</header>

<main id="main" tabindex="-1">
<div class="coach-shell">

<!-- Profile page -->
<div id="coach-profile" class="coach-card">
    <div class="coach-chat-header">
        <h2>Profile &amp; Settings</h2>
        <a href="/members" class="btn btn-secondary coach-back-btn">Back to chat</a>
    </div>

    <!-- Not authenticated message (shown by JS if no session) -->
    <div id="coach-profile-auth-required" hidden>
        <p class="coach-intro">You must be signed in to view this page.</p>
        <a href="/login.php?next=%2Fprofile" class="btn btn-primary">Go to sign in</a>
    </div>

    <!-- Profile content (shown by JS when authenticated) -->
    <div id="coach-profile-content" hidden>
        <!-- Profile info -->
        <div id="coach-profile-info" class="coach-profile-info">
            <p class="coach-intro">Loading your profile...</p>
        </div>

        <!-- Chat preferences (issue #184: language) -->
        <div class="coach-profile-section">
            <h3>Chat Preferences</h3>
            <form id="coach-preferences-form" class="coach-form" novalidate>
                <label for="coach-pref-language" class="coach-label">Response language</label>
                <select id="coach-pref-language" class="coach-input">
                    <option value="en">English (auto-detect)</option>
                </select>
                <p class="coach-intro" style="font-size:0.85em; margin-top:0.25rem;">Overrides auto-detection. Leave as English to let the coach detect your language automatically.</p>
                <button type="submit" class="btn btn-primary" id="coach-preferences-btn">Save preferences</button>
            </form>
            <div id="coach-preferences-status" class="coach-status" hidden></div>
        </div>

        <!-- Change password -->
        <div class="coach-profile-section">
            <h3>Change Password</h3>
            <form id="coach-change-password-form" class="coach-form" novalidate>
                <label for="coach-current-password" class="coach-label">Current password</label>
                <input type="password" id="coach-current-password" class="coach-input" required autocomplete="current-password">
                <label for="coach-new-password" class="coach-label">New password</label>
                <input type="password" id="coach-new-password" class="coach-input" placeholder="Min 12 characters" required autocomplete="new-password">
                <label for="coach-confirm-password" class="coach-label">Confirm new password</label>
                <input type="password" id="coach-confirm-password" class="coach-input" required autocomplete="new-password">
                <button type="submit" class="btn btn-primary" id="coach-change-password-btn">Change password</button>
            </form>
            <div id="coach-change-password-status" class="coach-status" hidden></div>
        </div>

        <!-- Change email -->
        <div class="coach-profile-section">
            <h3>Change Email Address</h3>
            <form id="coach-change-email-form" class="coach-form" novalidate>
                <label for="coach-new-email" class="coach-label">New email address</label>
                <input type="email" id="coach-new-email" class="coach-input" placeholder="you@new-email.com" required autocomplete="email">
                <label for="coach-email-password" class="coach-label">Confirm with your password</label>
                <input type="password" id="coach-email-password" class="coach-input" required autocomplete="current-password">
                <button type="submit" class="btn btn-primary" id="coach-change-email-btn">Change email</button>
            </form>
            <div id="coach-change-email-status" class="coach-status" hidden></div>
        </div>

        <!-- Delete account (danger zone) -->
        <div class="coach-profile-section coach-danger-zone">
            <h3>Delete Account</h3>
            <p class="coach-intro">Permanently delete your account and all associated data. This cannot be undone.</p>
            <form id="coach-delete-account-form" class="coach-form" novalidate>
                <label for="coach-delete-password" class="coach-label">Enter your password to confirm</label>
                <input type="password" id="coach-delete-password" class="coach-input" required autocomplete="current-password">
                <button type="submit" class="btn btn-danger" id="coach-delete-account-btn">Delete my account</button>
            </form>
            <div id="coach-delete-account-status" class="coach-status" hidden></div>
        </div>
    </div>
</div>

</div>
</main>

<footer class="af-footer" role="contentinfo">
  <div class="af-footer__legal">&copy; 2026 AikiField. All rights reserved.</div>
</footer>

<script>
// Pass the API base + session to coach-profile.js. MUST run before it loads.
// AikiField has no staging wrapper: always the production proxy.
window.COACH_API_BASE = "/coach-api";
window.COACH_BACKEND_URL = <?= json_encode(defined('COACH_BACKEND_URL') ? COACH_BACKEND_URL : '') ?>;
window.COACH_STAGING_URL = "";
// The PHP session (set by login.php) is the source of truth.
window.QA_SESSION = {
    email: <?= json_encode((string) ($qaEmail ?? '')) ?>,
    token: <?= json_encode((string) ($qaSessionToken ?? '')) ?>,
    // Pinned: AikiField's coach-proxy.php always routes to the production
    // backend (no X-Target-Environment / staging route), so the chat's
    // Prod/Staging switch would be a no-op. "production" hides it.
    targetEnv: "production",
    isAdmin: <?= json_encode((bool) ($qaIsAdmin ?? false)) ?>,
    aeoAccess: false,
    premium: false
};
</script>
<script src="/coach-profile.js?v=20261023"></script>
<script src="/js/nav-menu.js?v=20261002" defer></script>
</body>
</html>
