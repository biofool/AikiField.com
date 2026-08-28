<?php
/**
 * Coach API Proxy for AikiField — forwards /coach-api/* requests to the
 * AI Ki Questions Fielded backend (AIRichardMoon on Cloud Run).
 *
 * Ported from quantumaikido.com/web/coach-proxy.php, trimmed for AikiField:
 *   - No staging folder (AikiField has no /staging/ wrapper).
 *   - No dev mock OAuth block (not used here).
 *   - OAuth Location rewriting targets /projects.php (AikiField's login page)
 *     instead of QA's /members.php / /for-review/members.php / /dojos.php.
 *
 * URL mapping:
 *   /coach-api/v1/auth/verify        →  BACKEND/v1/auth/verify
 *   /coach-api/v1/auth/register-with-password
 *                                     →  BACKEND/v1/auth/register-with-password
 *   /coach-api/v1/chat-secure        →  BACKEND/v1/chat-secure
 *   /coach-api/v1/auth/google/callback → BACKEND/v1/auth/google/callback
 *
 * Requirements: PHP 8.0+ with cURL. Apache mod_rewrite routes /coach-api/* to
 * this file via .htaccess (see .htaccess at the web root).
 */

// Load config — coach-config.local.php (gitignored) → coach-config.php.
require __DIR__ . '/includes/coach-config.load.php';
require __DIR__ . '/includes/cloudflare-ips.php';
if (!defined('COACH_TIMEOUT')) {
    define('COACH_TIMEOUT', 30);
}

// Proxy shared secret — when set, sent as X-Proxy-Secret on every request so
// the backend can reject direct access to the Cloud Run URL and waive the
// registration captcha. Must match PROXY_SECRET in GCP Secret Manager.
if (!defined('COACH_PROXY_SECRET')) {
    define('COACH_PROXY_SECRET', '');
}
if (COACH_PROXY_SECRET === '' && PHP_SAPI !== 'cli') {
    error_log('WARNING: COACH_PROXY_SECRET is empty — proxy verification is disabled. Set it in coach-config.local.php to match PROXY_SECRET in GCP Secret Manager.');
}

// OAuth redirect URI — must point back to this proxy. Social login is
// currently disabled in coach-login.js, but keep this so enabling it later
// only requires backend/Google config, not proxy changes.
if (!defined('COACH_OAUTH_REDIRECT_URI')) {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    define('COACH_OAUTH_REDIRECT_URI', $scheme . '://' . $host . '/coach-api/v1/auth/google/callback');
}

// --- Headers to forward ---
// NOTE: cf-connecting-ip and x-forwarded-for are deliberately NOT in this
// list. This script has no way to tell, on its own, whether a request that
// reaches it actually came through Cloudflare or hit the origin directly —
// so forwarding those headers verbatim would let any client set them to
// whatever it likes and defeat the backend's IP-based rate limiting on auth
// endpoints. They're rebuilt from a trust-checked address below instead.
$FORWARD_REQ_HEADERS = [
    'content-type',
    'x-auth-email',
    'x-auth-session',
    'x-request-id',
    'authorization',
];

$FORWARD_RESP_HEADERS = [
    'content-type',
    'set-cookie',
    'location',       // OAuth redirects
    'retry-after',    // Rate limiting
    'x-request-id',
];

// --- Main ---
$method = $_SERVER['REQUEST_METHOD'];

// Reject any HTTP verb outside this allow-list before forwarding anything.
// Apache will happily hand this script TRACE, arbitrary custom verbs, etc.,
// and without this check they'd be forwarded to the backend as-is with no
// allow-list at all (only the body-reading branch below constrained itself
// to a method list). Defense in depth — the backend is expected to validate
// its own routes regardless.
$ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
if (!in_array($method, $ALLOWED_METHODS, true)) {
    http_response_code(405);
    header('Allow: ' . implode(', ', $ALLOWED_METHODS));
    header('Content-Type: application/json');
    echo json_encode(['detail' => 'Method not allowed.']);
    exit;
}

$uri = $_SERVER['REQUEST_URI'] ?? '/';

// Strip /coach-api prefix.
$path = $uri;
$prefix = '/coach-api';
if (str_starts_with($path, $prefix)) {
    $path = substr($path, strlen($prefix));
}
if ($path === '' || $path[0] !== '/') {
    $path = '/' . $path;
}

// Build backend URL. AikiField has no staging wrapper, so always use the
// production backend.
//
// This used to honour an unauthenticated, client-supplied X-Target-Environment
// header to switch to COACH_STAGING_URL. It was inert today only because
// AikiField's coach-config.php never defines COACH_STAGING_URL — the moment
// it did (e.g. via config copied from a sibling repo, a documented practice —
// see AGENTS.md), any visitor could redirect their own auth/chat traffic to a
// non-production backend with no allow-list or auth check gating that
// choice. Removed rather than gated: AikiField has no legitimate use for
// staging routing today, so there is no dead branch to protect.
$backendUrl = rtrim(COACH_BACKEND_URL, '/') . $path;

// Build headers to forward
$headers = [];
foreach (getallheaders() as $name => $value) {
    if (in_array(strtolower($name), $FORWARD_REQ_HEADERS)) {
        $headers[] = "$name: $value";
    }
}

// --- Client IP for backend rate limiting ---
// REMOTE_ADDR is the actual TCP peer address and cannot be spoofed by the
// client, unlike CF-Connecting-IP / X-Forwarded-For, which are ordinary
// request headers anyone can set. The actual trust decision (only forward
// the client-supplied values when REMOTE_ADDR is itself a genuine
// Cloudflare edge IP) lives in qa_resolve_client_ip_headers() in
// includes/cloudflare-ips.php — kept as a pure function, separate from this
// file's I/O, so it can be unit-tested directly (see
// tests/unit/test-cloudflare-ip-trust.php) without a real HTTP request.
$remoteAddr = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$clientCfConnectingIp = null;
$clientXForwardedFor = null;
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if ($lower === 'cf-connecting-ip') {
        $clientCfConnectingIp = $value;
    } elseif ($lower === 'x-forwarded-for') {
        $clientXForwardedFor = $value;
    }
}
foreach (qa_resolve_client_ip_headers($remoteAddr, $clientCfConnectingIp, $clientXForwardedFor) as $name => $value) {
    $headers[] = "$name: $value";
}

// Add proxy secret header so the backend knows this came through the proxy
if (COACH_PROXY_SECRET !== '') {
    $headers[] = 'X-Proxy-Secret: ' . COACH_PROXY_SECRET;
}

// For any OAuth authorize endpoint, pass the local redirect_uri to the
// backend so it constructs the OAuth URL with the correct callback address.
// Matches /v1/auth/{provider}/authorize for any provider.
if ($method === 'GET' && preg_match('#/v1/auth/([^/]+)/authorize$#', $path, $providerMatch)) {
    $provider = $providerMatch[1];
    $redirectUri = str_replace('/google/callback', '/' . $provider . '/callback', COACH_OAUTH_REDIRECT_URI);
    $sep = str_contains($backendUrl, '?') ? '&' : '?';
    $backendUrl .= $sep . 'redirect_uri=' . urlencode($redirectUri);
}

// Get request body
$body = '';
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'])) {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_starts_with($contentType, 'multipart/form-data')) {
        $body = file_get_contents('php://input');
        if ($body === false || $body === '') {
            // Fallback: reconstruct from $_FILES
            $body = '';
            $boundary = '';
            if (preg_match('/boundary=(.*)$/', $contentType, $m)) {
                $boundary = $m[1];
            }
            foreach ($_FILES as $key => $file) {
                if ($file['error'] === UPLOAD_ERR_OK) {
                    $content = file_get_contents($file['tmp_name']);
                    $body .= "--{$boundary}\r\n";
                    $body .= "Content-Disposition: form-data; name=\"{$key}\"; filename=\"{$file['name']}\"\r\n";
                    $body .= "Content-Type: {$file['type']}\r\n\r\n";
                    $body .= $content . "\r\n";
                }
            }
            if ($body) {
                $body .= "--{$boundary}--\r\n";
            }
        }
    } else {
        $body = file_get_contents('php://input');
        if ($body === false) $body = '';
    }
}

// cURL request
$ch = curl_init($backendUrl);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT        => COACH_TIMEOUT,
    CURLOPT_SSL_VERIFYPEER => COACH_VERIFY_TLS,
    CURLOPT_SSL_VERIFYHOST => COACH_VERIFY_TLS ? 2 : 0,
    CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
]);

if ($body !== '') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response   = curl_exec($ch);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$error      = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode([
        'detail' => 'Coach backend unavailable: ' . $error,
        'backendUrl' => COACH_BACKEND_URL,
    ]);
    exit;
}

// Split response
$rawHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);

// Parse and forward response headers
$headerLines = explode("\r\n", trim($rawHeaders));
foreach ($headerLines as $line) {
    if (str_starts_with($line, 'HTTP/')) continue;
    if (trim($line) === '') continue;
    $colonPos = strpos($line, ':');
    if ($colonPos === false) continue;
    $headerName  = substr($line, 0, $colonPos);
    $headerValue = trim(substr($line, $colonPos + 1));
    if (in_array(strtolower($headerName), $FORWARD_RESP_HEADERS)) {
        header("$headerName: $headerValue", false);
    }
}

// Rewrite OAuth Location header to send the user back to AikiField's login
// page (projects.php). The backend redirects to /login.html?oauth_code=<OTC>;
// we rewrite that to /projects.php so coach-login.js can complete the OTC
// exchange. Social login is currently disabled, but this keeps the proxy
// correct if it is re-enabled.
foreach ($headerLines as $line) {
    if (str_starts_with($line, 'HTTP/')) continue;
    if (trim($line) === '') continue;
    $colonPos = strpos($line, ':');
    if ($colonPos === false) continue;
    $headerName  = substr($line, 0, $colonPos);
    $headerValue = trim(substr($line, $colonPos + 1));
    if (strtolower($headerName) === 'location') {
        $rewritten = str_replace('/login.html', '/projects.php', $headerValue);
        if ($rewritten !== $headerValue) {
            header('Location: ' . $rewritten);
        }
    }
}

http_response_code($httpCode);
echo $responseBody;
