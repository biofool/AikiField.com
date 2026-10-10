<?php
/**
 * /members — AI Chat ("Enter the Unified Field Chat", Digital Experience menu).
 *
 * Replica of quantumaikido.com/members (members.html + coach-chat.js), which
 * stays live there. Same AIRichardMoon backend, reached through this site's
 * /coach-api/* proxy (coach-proxy.php). See docs/coach-auth-prd.md.
 *
 * Auth: the same session gate as /beta/ and /for-review/
 * (includes/beta-gate.load.php). Signed-out visitors are redirected to the
 * blind /login.php?next=/members and land back here after sign-in.
 *
 * Served at /members via .htaccess (extensionless rewrite). The page embeds
 * the session token, so it must never be edge-cached; session_start() in the
 * gate sends Cache-Control: no-store.
 */

require __DIR__ . '/includes/beta-gate.load.php';

$qaIsAdmin   = $_SESSION['qa_is_admin'] ?? false;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <meta name="robots" content="noindex,nofollow">
  <title>Unified Field Chat — AikiField</title>
  <meta name="description" content="Enter the Unified Field Chat: AI-supported guidance grounded in the Quantum Aikido teachings.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet"></noscript>
  <link rel="stylesheet" href="/css/redesign.css?v=20261003">
  <link rel="stylesheet" href="/css/coach-chat.css?v=20261005b">
</head>
<body>

<a href="#main" class="af-skip-link">Skip to main content</a>

<!-- HEADER (role="banner": coach-chat.js measures it to size the chat) -->
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
        <button type="button" class="af-nav__link af-nav__menu-btn" aria-expanded="false" aria-controls="af-nav-sub-uf" data-i18n="nav.unified_field_studies">Studies the Unified Field</button>
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
          <li><a href="/digital-experience/lucky-wave.html#v1" class="af-nav__sublink">Ride the Lucky Wave</a></li>
          <li><a href="/digital-experience/lucky-wave.html#v2" class="af-nav__sublink">Ride the Lucky Wave V2</a></li>
          <li><a href="/digital-experience/moon-practices.html" class="af-nav__sublink">Moon — 20 Exclusive Practices</a></li>
          <li class="af-nav__subsep"><a href="/digital-experience/unified-field-chat.html" class="af-nav__sublink af-nav__sublink--feature">Enter the Unified Field Chat</a></li>
              <li class="af-nav__subsep"><a href="/blog/index.html#social" class="af-nav__sublink" data-i18n="nav.social_media">Social Media</a></li>
            </ul>
          </li>
        </ul>
      </div>
      <a href="/somatic-studios/" class="af-nav__link" data-i18n="nav.somatic_studios">For Somatic Studios</a>
      <a href="/contact.html" class="af-nav__cta">Get Started</a>
    </nav>
  </div>
</header>

<main id="main" tabindex="-1">
<div class="coach-shell coach-shell--chat">
<h1 class="sr-only">Discussing The Unified Field</h1>

<!-- Chat (issue #323): full-height app layout. The message list is the only
     scroll container; the bar and the composer stay pinned. -->
<div id="coach-chat" class="coach-card coach-chat-app">
    <div class="coach-bar">
        <!-- Conversation switcher (issue #731) -->
        <div class="coach-bar-lead">
            <label for="coach-session-select" class="sr-only">Conversation</label>
            <select id="coach-session-select" class="coach-session-select" title="Switch conversation">
                <option value="">New conversation</option>
            </select>
        </div>
        <div class="coach-bar-actions" role="toolbar" aria-label="Chat controls">
            <button type="button" id="coach-new-chat-btn" class="coach-icon-btn" aria-label="New chat" title="New chat">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <div class="coach-more-wrap">
                <button type="button" id="coach-more-btn" class="coach-icon-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="coach-more-menu" aria-label="More options" title="More">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>
                </button>
                <!-- More menu (issues #323/#324). #coach-more-menu is the popup container;
                     only the inner role="menu" holds menuitems (the language <select> and
                     the account header sit beside it, which ARIA menus do not allow inside).
                     Roving keyboard focus spans both, see coach-chat.js. -->
                <div id="coach-more-menu" class="coach-more-menu" hidden>
                    <!-- Account section -->
                    <div class="coach-menu-account">
                        <span id="coach-user-avatar" class="coach-menu-avatar" aria-hidden="true">?</span>
                        <span class="coach-menu-account-text">
                            <span id="coach-user-name" class="coach-menu-name">Account</span>
                            <span id="coach-user-info" class="coach-menu-email"></span>
                        </span>
                    </div>
                    <div class="coach-menu-sep" aria-hidden="true"></div>
                    <!-- Language selector -->
                    <div class="coach-menu-field">
                        <label for="coach-language-select" class="coach-menu-label">Response language</label>
                        <select id="coach-language-select" class="coach-menu-select" title="Overrides auto-detection. Leave as English to let the coach detect your language automatically.">
                            <option value="en">English (auto-detect)</option>
                        </select>
                    </div>
                    <div role="menu" aria-labelledby="coach-more-btn">
                        <button type="button" id="coach-features-btn" class="coach-menu-item" role="menuitem" tabindex="-1" title="Voice & new features — notify me" aria-label="Voice responses and other new features — notify me when available" aria-haspopup="dialog" aria-expanded="false">
                            <svg class="coach-menu-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            <span>New Features</span>
                        </button>
                        <!-- Environment switch (admin/reviewer) -->
                        <div id="coach-env-controls" class="coach-menu-env" role="none" hidden>
                            <button type="button" id="coach-env-toggle" class="coach-env-toggle" role="menuitem" tabindex="-1" title="Switch between staging and production">
                                <span class="coach-env-name">Environment</span>
                                <span class="coach-env-pills">
                                    <span class="coach-env-pill coach-env-prod">Prod</span>
                                    <span class="coach-env-pill coach-env-stg">Staging</span>
                                </span>
                            </button>
                        </div>
                        <div class="coach-menu-sep" role="separator"></div>
                        <button type="button" id="coach-clear-btn" class="coach-menu-item coach-menu-item--destructive" role="menuitem" tabindex="-1" title="Clear the conversation">
                            <svg class="coach-menu-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            <span>Clear conversation</span>
                        </button>
                        <div class="coach-menu-sep" role="separator"></div>
                        <a href="https://quantumaikido.com/profile" id="coach-profile-link" class="coach-menu-item" role="menuitem" tabindex="-1">Profile &amp; Settings</a>
                        <div class="coach-menu-sep" role="separator"></div>
                        <a href="https://quantumaikido.com/privacy" class="coach-menu-item" role="menuitem" tabindex="-1">Privacy</a>
                        <a href="https://quantumaikido.com/terms" class="coach-menu-item" role="menuitem" tabindex="-1">Terms</a>
                        <div class="coach-menu-sep" role="separator"></div>
                        <button type="button" id="coach-logout" class="coach-menu-item coach-logout-btn" role="menuitem" tabindex="-1">Sign Out</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- New Features popover (opened from the More menu). Kept outside the menu
         so it stays visible after the menu closes. -->
    <div class="coach-features-wrap" id="coach-features-wrap">
                <div id="coach-features-popover" class="coach-features-popover" hidden role="dialog" aria-modal="false" aria-labelledby="coach-features-title">
                    <div class="coach-features-header">
                        <h3 id="coach-features-title">New Features</h3>
                        <button type="button" class="coach-features-close" id="coach-features-close" aria-label="Close new features dialog">&times;</button>
                    </div>
                    <p class="coach-features-intro">Tap the thumbs-up on features you're interested in. Admins on staging can enable feature flags below.</p>
                    <div class="coach-features-columns">
                        <div class="coach-features-column">
                            <h4 class="coach-features-column-title">Under Consideration</h4>
                            <ul class="coach-features-list" id="coach-features-list">
                                <li class="coach-feature-item" data-feature="voice">
                                    <button type="button" class="coach-feature-thumb" data-feature="voice" aria-pressed="false" aria-label="Voice Responses — thumbs up if interested">
                                        <svg class="coach-thumb-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                    </button>
                                    <div class="coach-feature-info">
                                        <span class="coach-feature-name">Voice Responses</span>
                                        <span class="coach-feature-desc">Coach responds verbally using a clone of Richard Moon's voice</span>
                                    </div>
                                </li>
                                <li class="coach-feature-item" data-feature="journal">
                                    <button type="button" class="coach-feature-thumb" data-feature="journal" aria-pressed="false" aria-label="Reflection Journal — thumbs up if interested">
                                        <svg class="coach-thumb-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                    </button>
                                    <div class="coach-feature-info">
                                        <span class="coach-feature-name">Reflection Journal</span>
                                        <span class="coach-feature-desc">Private journal with prompts and past-entry review</span>
                                    </div>
                                </li>
                                <li class="coach-feature-item" data-feature="practice_cards">
                                    <button type="button" class="coach-feature-thumb" data-feature="practice_cards" aria-pressed="false" aria-label="Practice Cards — thumbs up if interested">
                                        <svg class="coach-thumb-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                    </button>
                                    <div class="coach-feature-info">
                                        <span class="coach-feature-name">Practice Cards</span>
                                        <span class="coach-feature-desc">Daily practice suggestions based on your conversation themes</span>
                                    </div>
                                </li>
                                <li class="coach-feature-item" data-feature="library">
                                    <button type="button" class="coach-feature-thumb" data-feature="library" aria-pressed="false" aria-label="Teaching Library — thumbs up if interested">
                                        <svg class="coach-thumb-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                    </button>
                                    <div class="coach-feature-info">
                                        <span class="coach-feature-name">Teaching Library</span>
                                        <span class="coach-feature-desc">Browse and bookmark teachings from the corpus</span>
                                    </div>
                                </li>
                                <li class="coach-feature-item" data-feature="multilang_voice">
                                    <button type="button" class="coach-feature-thumb" data-feature="multilang_voice" aria-pressed="false" aria-label="Multi-language Voice — thumbs up if interested">
                                        <svg class="coach-thumb-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                    </button>
                                    <div class="coach-feature-info">
                                        <span class="coach-feature-name">Multi-language Voice</span>
                                        <span class="coach-feature-desc">Voice responses in your detected language, not just English</span>
                                    </div>
                                </li>
                                <li class="coach-feature-item" data-feature="human_coach">
                                    <button type="button" class="coach-feature-thumb" data-feature="human_coach" aria-pressed="false" aria-label="Human Coach (Premium) — thumbs up if interested">
                                        <svg class="coach-thumb-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                    </button>
                                    <div class="coach-feature-info">
                                        <span class="coach-feature-name">Human Coach (Premium)</span>
                                        <span class="coach-feature-desc">Talk to a human Aikido coach for personalized, one-on-one guidance</span>
                                    </div>
                                </li>
                            </ul>
                        </div>
                        <div class="coach-features-column" id="coach-features-enable-column" hidden>
                            <h4 class="coach-features-column-title">Enable on Staging</h4>
                            <!-- Items are generated from GET /v1/admin/feature-flags — never
                                 hardcode flag keys here; the registry is the source of truth. -->
                            <ul class="coach-features-enable-list" id="coach-features-enable-list">
                            </ul>
                        </div>
                    </div>
                    <div id="coach-features-status" class="coach-features-status" hidden></div>
                </div>
            </div>

    <div id="coach-env-banner" class="coach-env-banner" hidden></div>
    <div class="coach-log-wrap">
        <div id="coach-messages" class="coach-messages is-empty" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Chat messages" aria-busy="false" tabindex="0">
            <!-- Empty-state card (issue #323): shown only while the conversation is
                 empty (#coach-messages.is-empty, managed by coach-chat.js). The
                 script never removes this node when it clears the message list. -->
            <section class="coach-intro-panel" id="coach-intro-panel" aria-labelledby="coach-intro-title">
                <div class="coach-intro-header">
                    <h2 id="coach-intro-title">Discussing The Unified Field</h2>
                    <button type="button" class="coach-intro-dismiss" id="coach-intro-dismiss" aria-label="Dismiss guidance panel" title="Dismiss">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <p class="coach-intro-subtitle">AI-supported guidance for embodied practice, awareness, and constructive interaction.</p>
                <ul class="coach-intro-features">
                    <li>AI-generated responses informed by the Quantum Aikido field of teachings</li>
                    <li>Ask in over 30 languages &mdash; the coach replies in the language you write in</li>
                    <li>Ask to speak with a human coach at any time, right in the chat</li>
                </ul>
            </section>
        </div>
        <button type="button" id="coach-scroll-bottom-btn" class="coach-scroll-bottom-btn" hidden aria-label="Jump to latest message">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
        </button>
        <!-- Clear / New chat undo toast (issue #324) -->
        <div id="coach-toast" class="coach-toast" role="status" aria-live="polite" hidden>
            <span id="coach-toast-msg" class="coach-toast-msg"></span>
            <button type="button" id="coach-toast-undo" class="coach-toast-undo">Undo</button>
        </div>
    </div>
    <div id="coach-queue-banner" class="coach-queue-banner" hidden></div>
    <form id="coach-chat-form" class="coach-composer-form" aria-label="Chat message form">
        <div class="coach-composer">
            <textarea id="coach-chat-input" class="coach-composer-input" placeholder="Ask anything…" maxlength="4000" rows="1" enterkeyhint="enter" aria-label="Type your message to the coach"></textarea>
            <button type="submit" id="coach-send-btn" class="coach-composer-send" aria-label="Send message" disabled>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            </button>
        </div>
        <div class="coach-composer-meta">
            <span class="coach-composer-count" hidden><span id="coach-char-count">0</span> / 4000</span>
        </div>
    </form>
</div>

</div>
</main>

<!-- Footer: hidden on this page by css/coach-chat.css (the chat fills the
     viewport); Privacy/Terms live in the chat's More menu. -->
<footer class="af-footer" role="contentinfo">
  <div class="af-footer__legal">&copy; 2026 AikiField. All rights reserved.</div>
</footer>

<script>
// Pass the API base + session to coach-chat.js. MUST run before it loads.
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
    isAdmin: <?= json_encode((bool) $qaIsAdmin) ?>,
    aeoAccess: false,
    premium: false
};
</script>
<script src="/coach-chat.js?v=20261005b"></script>
<script src="/js/nav-menu.js?v=20261002" defer></script>
</body>
</html>
