<?php
/**
 * AikiField Operations Dashboard — Cloudflare Logs & Error Monitor
 *
 * Pulls HTTP error data (4xx/5xx), firewall/WAF events, and traffic
 * summaries from the Cloudflare GraphQL Analytics API for the
 * aikifield.com zone. Mirrors the quantumaikido.com dashboard pattern
 * but focused on Cloudflare edge logs rather than Apache access logs.
 *
 * Access: requires DASHBOARD_ADMIN_KEY (defined in coach-config.local.php,
 * gitignored). Sent via X-Dashboard-Key header, or once via ?key= which is
 * exchanged for an HttpOnly cookie — keeping the key in the URL leaked it
 * into access logs, CF edge logs and browser history (issue #100).
 * The page is blind — not linked from public nav.
 *
 * See docs/coach-auth-prd.md §Operations Dashboard.
 */

require __DIR__ . '/includes/coach-config.load.php';
require __DIR__ . '/includes/cloudflare-logs.class.php';

// --- Auth ---
$adminKey = defined('DASHBOARD_ADMIN_KEY') ? DASHBOARD_ADMIN_KEY : '';

if ($adminKey === '') {
    http_response_code(503);
    echo '<p>Dashboard not configured: DASHBOARD_ADMIN_KEY is not set in coach-config.local.php</p>';
    exit;
}

// Issue #100: a valid key is exchanged once for an HttpOnly cookie holding an
// HMAC of the key — after that the URL never carries the secret again, so it
// stays out of access logs, CF edge logs, browser history and Referer
// headers. The cookie stores a derived value, not the key itself.
$cookieName = 'af_dashboard_auth';
$cookieExpected = hash_hmac('sha256', $adminKey, 'aikifield-dashboard-v1');
$cookieSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? '') == 443)
    || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https'
    || str_contains((string) ($_SERVER['HTTP_CF_VISITOR'] ?? ''), '"https"');

$provided    = (string) ($_GET['key'] ?? '');
$providedHdr = (string) ($_SERVER['HTTP_X_DASHBOARD_KEY'] ?? '');
$viaCookie   = isset($_COOKIE[$cookieName])
    && hash_equals($cookieExpected, (string) $_COOKIE[$cookieName]);

if (!$viaCookie) {
    if ($provided !== '' && hash_equals($adminKey, $provided)) {
        // Valid ?key= — set the cookie and strip the key from the URL so it
        // never appears twice in logs/history.
        setcookie($cookieName, $cookieExpected, [
            'expires'  => time() + 8 * 3600,
            'path'     => '/dashboard.php',
            'secure'   => $cookieSecure,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        $qs = $_GET;
        unset($qs['key']);
        $target = ($_SERVER['SCRIPT_NAME'] ?? '/dashboard.php')
            . ($qs ? '?' . http_build_query($qs) : '');
        header('Location: ' . $target);
        exit;
    }
    if ($providedHdr === '' || !hash_equals($adminKey, $providedHdr)) {
        http_response_code(401);
        echo '<p>Unauthorized. Provide X-Dashboard-Key header, or ?key= once to establish a session.</p>';
        exit;
    }
}

// --- Config ---
$cfToken  = defined('CLOUDFLARE_API_TOKEN') ? CLOUDFLARE_API_TOKEN : '';
$cfZone   = defined('CLOUDFLARE_ZONE_ID') ? CLOUDFLARE_ZONE_ID : '';
$hours    = isset($_GET['hours']) ? max(1, min(168, (int)$_GET['hours'])) : 24;

// --- Run scan ---
if ($cfToken === '' || $cfZone === '') {
    $report = [
        'zone_id'        => $cfZone ?: 'NOT SET',
        'hours'          => $hours,
        'generated_at'   => gmdate('Y-m-d\TH:i:s\Z'),
        'error_requests' => [],
        'firewall_events'=> [],
        'daily_summary'  => [],
        'api_errors'     => ['CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not defined in coach-config.local.php'],
        'error_count'    => 0,
        'firewall_count' => 0,
    ];
    $html = '<div class="cf-section cf-api-errors"><h3>Configuration Error</h3><p>CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not defined in coach-config.local.php. Add them to enable Cloudflare log scanning.</p></div>';
} else {
    $scanner = new CloudflareLogsScanner($cfToken, $cfZone);
    $report  = $scanner->scan(hours: $hours);
    $html    = $scanner->render($report);
}

// --- JSON output mode ---
if (isset($_GET['format']) && $_GET['format'] === 'json') {
    header('Content-Type: application/json');
    echo json_encode($report, JSON_PRETTY_PRINT);
    exit;
}

// --- HTML page ---
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Robots-Tag: noindex, nofollow');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>AikiField Operations Dashboard</title>
  <style>
    :root {
      --bg: #0f2942;
      --panel: #1a3a5c;
      --text: #e0e8f0;
      --muted: #8a9bb0;
      --accent: #4a9eff;
      --error: #ff4444;
      --warn: #ffaa00;
      --ok: #00aa44;
      --border: #2a4a6c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 1rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; color: var(--muted); margin-bottom: 1rem; }
    h3 { font-size: 1rem; margin-bottom: 0.5rem; color: var(--accent); }
    .cf-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;
    }
    .cf-meta { font-size: 0.8rem; color: var(--muted); }
    .cf-controls { display: flex; gap: 0.5rem; align-items: center; }
    .cf-controls a {
      color: var(--accent); text-decoration: none; font-size: 0.85rem;
      padding: 0.25rem 0.5rem; border: 1px solid var(--border); border-radius: 4px;
    }
    .cf-controls a:hover { background: var(--panel); }
    .cf-section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .cf-ok { color: var(--ok); }
    .cf-api-errors { border-color: var(--error); }
    .cf-api-errors h3 { color: var(--error); }
    .cf-error { color: var(--error); }
    .cf-table {
      width: 100%; border-collapse: collapse; font-size: 0.85rem;
    }
    .cf-table th {
      text-align: left; padding: 0.5rem; border-bottom: 2px solid var(--border);
      color: var(--muted); font-weight: 600; white-space: nowrap;
    }
    .cf-table td {
      padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .cf-table tr:hover td { background: rgba(74, 158, 255, 0.05); }
    .cf-status-4xx { color: var(--warn); font-weight: 600; }
    .cf-status-5xx { color: var(--error); font-weight: 600; }
    .cf-status-ok  { color: var(--ok); font-weight: 600; }
    .cf-threat     { color: var(--error); font-weight: 600; }
    .cf-path       { font-family: monospace; word-break: break-all; max-width: 400px; }
    .cf-ip         { font-family: monospace; white-space: nowrap; }
    .cf-ua         { font-family: monospace; font-size: 0.75rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cf-ray        { font-family: monospace; font-size: 0.75rem; color: var(--muted); }
    .cf-fw-action  { font-weight: 600; text-transform: uppercase; }
    .cf-summary-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.5rem; margin-bottom: 1rem;
    }
    .cf-stat {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 6px; padding: 0.75rem; text-align: center;
    }
    .cf-stat-value { font-size: 1.5rem; font-weight: 700; }
    .cf-stat-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; }
    .cf-stat-errors .cf-stat-value { color: var(--error); }
    .cf-stat-firewall .cf-stat-value { color: var(--warn); }
    .cf-stat-requests .cf-stat-value { color: var(--accent); }
    @media (max-width: 768px) {
      .cf-table { font-size: 0.75rem; }
      .cf-path, .cf-ua { max-width: 150px; }
    }
  </style>
</head>
<body>
  <div class="cf-header">
    <div>
      <h1>AikiField Operations Dashboard</h1>
      <div class="cf-meta">
        Zone: <?php echo htmlspecialchars($report['zone_id']); ?> |
        Generated: <?php echo htmlspecialchars($report['generated_at']); ?> |
        Window: <?php echo $report['hours']; ?>h
      </div>
    </div>
    <div class="cf-controls">
      <a href="?hours=24">24h</a>
      <a href="?hours=48">48h</a>
      <a href="?hours=168">7d</a>
      <a href="?format=json">JSON</a>
    </div>
  </div>

  <div class="cf-summary-grid">
    <div class="cf-stat cf-stat-errors">
      <div class="cf-stat-value"><?php echo $report['error_count']; ?></div>
      <div class="cf-stat-label">Error Groups</div>
    </div>
    <div class="cf-stat cf-stat-firewall">
      <div class="cf-stat-value"><?php echo $report['firewall_count']; ?></div>
      <div class="cf-stat-label">Firewall Events</div>
    </div>
    <?php if (!empty($report['daily_summary'])): $today = $report['daily_summary'][0]; ?>
    <div class="cf-stat cf-stat-requests">
      <div class="cf-stat-value"><?php echo $today['requests']; ?></div>
      <div class="cf-stat-label">Today's Requests</div>
    </div>
    <div class="cf-stat">
      <div class="cf-stat-value"><?php echo $today['uniques']; ?></div>
      <div class="cf-stat-label">Today's Uniques</div>
    </div>
    <div class="cf-stat">
      <div class="cf-stat-value"><?php echo $today['threats']; ?></div>
      <div class="cf-stat-label">Today's Threats</div>
    </div>
    <?php endif; ?>
  </div>

  <?php echo $html; ?>

  <p style="font-size:0.75rem;color:var(--muted);margin-top:1rem;">
    Data source: Cloudflare GraphQL Analytics API.
    The dashboard is blind (not linked from public nav).
    Requires DASHBOARD_ADMIN_KEY, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ZONE_ID
    in coach-config.local.php (gitignored).
  </p>
</body>
</html>
