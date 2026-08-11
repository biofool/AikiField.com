<?php
/**
 * Stub AIRichardMoon backend for the AikiField e2e suite.
 *
 *   php -S 0.0.0.0:8201 tests/e2e/stub-backend.php
 *
 * Mirrors the behaviours of the real backend that the AikiField auth flow
 * depends on:
 *
 *   1. X-Proxy-Secret enforcement (backend/app/main.py log_request middleware).
 *      Every non-exempt path 403s without a matching secret. This catches
 *      "the proxy never loaded coach-config.php" as a red test.
 *   2. /v1/auth/verify — returns a fake session token for known test users.
 *   3. /v1/auth/check-session — validates the token (called by login.php to
 *      establish the PHP session).
 *   4. /v1/auth/providers — returns an empty provider list (no social login
 *      in tests).
 *
 * It also keeps a request log (QA_STUB_LOG) that tests read through
 * /__stub/requests to assert which backend was contacted and whether the
 * proxy secret and forwarded headers arrived — a much stronger check than
 * inspecting the DOM alone.
 *
 * Test accounts (password is the same for both):
 *   test@example.com  — standard user (beta access)
 *   admin@example.com — admin user
 */
declare(strict_types=1);

const STUB_PASSWORD = 'testpass123';

$SECRET   = (string) (getenv('QA_STUB_PROXY_SECRET') ?: '');
$LOG_FILE = (string) (getenv('QA_STUB_LOG') ?: sys_get_temp_dir() . '/af-e2e-stub.jsonl');

$USERS = [
    'test@example.com' => [
        'username'          => 'testuser',
        'admin'             => false,
        'active'            => true,
        'targetEnvironment' => 'both',
    ],
    'admin@example.com' => [
        'username'          => 'admin',
        'admin'             => true,
        'active'            => true,
        'targetEnvironment' => 'both',
    ],
];

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path   = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$sent   = (string) ($_SERVER['HTTP_X_PROXY_SECRET'] ?? '');
$rawBody = (string) file_get_contents('php://input');

/** Mint a session token for an email. */
function stub_token(string $email): string
{
    return 'stub|' . $email;
}

/** Send a JSON response and stop. */
function stub_json(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Decode a JSON request body; [] when absent or malformed (logged, never silent). */
function stub_body(string $raw): array
{
    if (trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        error_log('stub-backend: request body is not JSON: ' . substr($raw, 0, 200));
        return [];
    }
    return $decoded;
}

// ── Request log ─────────────────────────────────────────────────────────────
// Recorded before the secret check so a rejected request is visible too.
// Captures forwarded headers so proxy.spec.js can assert client-IP forwarding
// (issue #262).
$record = [
    'ts'               => date('c'),
    'method'           => $method,
    'path'             => $path,
    'query'            => $_SERVER['QUERY_STRING'] ?? '',
    'secretOk'         => ($SECRET === '' || hash_equals($SECRET, $sent)),
    'secretSent'       => $sent !== '',
    'authEmail'        => $_SERVER['HTTP_X_AUTH_EMAIL'] ?? '',
    'authSession'      => $_SERVER['HTTP_X_AUTH_SESSION'] ?? '',
    'cfConnectingIp'   => $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
    'xForwardedFor'    => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
    'requestId'        => $_SERVER['HTTP_X_REQUEST_ID'] ?? '',
    'contentType'      => $_SERVER['HTTP_CONTENT_TYPE'] ?? '',
    'authorization'    => $_SERVER['HTTP_AUTHORIZATION'] ?? '',
];
if (!str_starts_with($path, '/__stub/')) {
    if (@file_put_contents($LOG_FILE, json_encode($record) . "\n", FILE_APPEND | LOCK_EX) === false) {
        error_log('stub-backend: could not append to request log ' . $LOG_FILE);
    }
}

// ── Harness control plane ───────────────────────────────────────────────────

if ($path === '/__stub/health') {
    stub_json(200, ['ok' => true, 'log' => $LOG_FILE]);
}

if ($path === '/__stub/requests') {
    if ($method === 'DELETE') {
        @unlink($LOG_FILE);
        stub_json(200, ['ok' => true, 'cleared' => true]);
    }
    $entries = [];
    if (is_file($LOG_FILE)) {
        foreach (file($LOG_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $decoded = json_decode($line, true);
            if (is_array($decoded)) {
                $entries[] = $decoded;
            }
        }
    }
    stub_json(200, ['count' => count($entries), 'requests' => $entries]);
}

// ── Proxy-secret enforcement (mirrors backend/app/main.py) ───────────────────

$isExempt = str_starts_with($path, '/v1/auth/')
    || str_ends_with($path, '.html')
    || str_ends_with($path, '.css')
    || str_ends_with($path, '.js')
    || $path === '/'
    || $path === '/healthz'
    || $path === '/health';

if ($SECRET !== '' && !$isExempt && !hash_equals($SECRET, $sent)) {
    error_log('stub-backend: proxy secret missing/mismatched for ' . $method . ' ' . $path);
    stub_json(403, ['detail' => 'Direct access is not permitted. Please use aikifield.com.']);
}

// ── Auth endpoints ──────────────────────────────────────────────────────────

if ($path === '/v1/auth/providers') {
    // No social providers in tests — coach-login.js hides the social block.
    stub_json(200, ['providers' => []]);
}

if ($path === '/v1/auth/verify' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $pass  = (string) ($body['password'] ?? '');
    if (!isset($USERS[$email]) || $pass !== STUB_PASSWORD) {
        stub_json(200, ['ok' => false, 'error' => 'Invalid email or password.']);
    }
    $user = $USERS[$email];
    stub_json(200, [
        'ok'                => true,
        'email'             => $email,
        'sessionToken'      => stub_token($email),
        'admin'             => $user['admin'],
        'targetEnvironment' => $user['targetEnvironment'],
    ]);
}

if ($path === '/v1/auth/check-session' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $token = (string) ($body['sessionToken'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        error_log('stub-backend: check-session rejected email=' . $email);
        stub_json(200, ['ok' => false, 'error' => 'Session is not valid.']);
    }
    $user = $USERS[$email];
    stub_json(200, [
        'ok'                => true,
        'email'             => $email,
        'admin'             => $user['admin'],
        'targetEnvironment' => $user['targetEnvironment'],
    ]);
}

if ($path === '/v1/auth/register-with-password' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    if ($email === '') {
        stub_json(200, ['ok' => false, 'error' => 'Email is required.']);
    }
    stub_json(200, [
        'ok'      => true,
        'message' => 'Check your email for a confirmation link.',
        'email'   => $email,
    ]);
}

if ($path === '/v1/auth/request-reset' && $method === 'POST') {
    stub_json(200, ['ok' => true, 'message' => 'If that email exists, a reset link has been sent.']);
}

if ($path === '/v1/auth/confirm-email' && $method === 'POST') {
    stub_json(200, ['ok' => true, 'message' => 'Email confirmed.']);
}

if ($path === '/v1/auth/rate-limit-status') {
    stub_json(200, ['recentHits' => []]);
}

// ── Health endpoints ────────────────────────────────────────────────────────

if ($path === '/healthz' || $path === '/health') {
    stub_json(200, ['status' => 'ok']);
}

// ── Fallback ────────────────────────────────────────────────────────────────

error_log('stub-backend: unhandled ' . $method . ' ' . $path);
stub_json(404, ['detail' => 'Stub backend has no handler for ' . $method . ' ' . $path]);
