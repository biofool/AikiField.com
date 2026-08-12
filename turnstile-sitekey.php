<?php
declare(strict_types=1);

/**
 * Public Turnstile site key delivery for static pages.
 *
 * contact.html is plain static HTML (no PHP templating), so it can't read
 * the TURNSTILE_SITE_KEY constant directly the way login.php does. This
 * tiny endpoint exposes that same (non-secret) config value as JSON so
 * contact.html's inline script can fetch it and render the widget only
 * when a site key is configured — mirroring how beta/js/assessment.js
 * fetches beta/data.php instead of reading its JSON files directly.
 *
 * Only the site key is ever exposed here. TURNSTILE_SECRET_KEY (used by
 * contact-handler.php to verify tokens server-side) never leaves the server.
 */

require __DIR__ . '/includes/coach-config.load.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

echo json_encode([
    'siteKey' => defined('TURNSTILE_SITE_KEY') ? TURNSTILE_SITE_KEY : '',
]);
