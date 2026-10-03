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

// Game-results stub state (see /v1/game-results/sync below).
$GR_FILE = dirname($LOG_FILE) . '/af-e2e-stub-game-results.json';
$GR_MISSING_FLAG = $GR_FILE . '.missing';
if ($path === '/__stub/game-results' && $method === 'DELETE') {
    @unlink($GR_FILE);
    @unlink($GR_MISSING_FLAG);
    @unlink($GR_FILE . '.last-request.json');
    stub_json(200, ['ok' => true]);
}
if ($path === '/__stub/game-results/last-request' && $method === 'GET') {
    $raw = @file_get_contents($GR_FILE . '.last-request.json');
    stub_json(200, ['body' => $raw === false ? null : json_decode($raw, true)]);
}
if ($path === '/__stub/game-results/missing' && $method === 'POST') {
    $on = (bool) (stub_body($rawBody)['missing'] ?? true);
    if ($on) {
        @touch($GR_MISSING_FLAG);
    } else {
        @unlink($GR_MISSING_FLAG);
    }
    stub_json(200, ['ok' => true, 'missing' => $on]);
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

// ── AI Chat (games/ai-coach.php → /v1/chat-secure) ──────────────────────────
// Requires the member's X-Auth-Email / X-Auth-Session like the real
// _require_session_owner dependency. Echoes the message it received so tests
// can assert the server composed it from the scores, and returns one cited
// source with a YouTube link + start offset (the "1 video").

if ($path === '/v1/chat-secure' && $method === 'POST') {
    $email = strtolower(trim((string) ($_SERVER['HTTP_X_AUTH_EMAIL'] ?? '')));
    $token = (string) ($_SERVER['HTTP_X_AUTH_SESSION'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        stub_json(401, ['detail' => 'Session expired.']);
    }
    $body = stub_body($rawBody);
    stub_json(200, [
        'sessionId' => (string) ($body['sessionId'] ?? 'stub'),
        'response'  => 'STUB CHAT modality=' . ($body['modality'] ?? '-') . ' :: ' . (string) ($body['message'] ?? ''),
        'intent'    => 'ai',
        'sources'   => [
            ['chunkId' => 'c1', 'title' => 'Corpus note', 'path' => 'notes/x.md'],
            ['chunkId' => 'c2', 'title' => 'Blending practice', 'path' => 'videos/blend.md',
             'youtubeUrl' => 'https://www.youtube.com/watch?v=stubVideo01', 'startSeconds' => 42],
        ],
    ]);
}

// ── Game results (AikiField games/results.php, games/ai-coach.php) ──────────
// Same request/response shape and auth as AIRichardMoon POST
// /v1/game-results/sync. Storage here is a plain per-email upsert by `at`
// so AikiField's proxying can be tested end to end; the real merge, cap,
// validation and isolation rules are tested in the backend's pytest
// (tests/test_game_results.py), not re-implemented here. The request body is
// logged so tests can assert what AikiField forwarded.

if ($path === '/v1/game-results/sync' && $method === 'POST') {
    if (is_file($GR_MISSING_FLAG)) {
        stub_json(404, ['detail' => 'Not Found']);
    }
    $email = strtolower(trim((string) ($_SERVER['HTTP_X_AUTH_EMAIL'] ?? '')));
    $token = (string) ($_SERVER['HTTP_X_AUTH_SESSION'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        stub_json(401, ['detail' => 'Invalid, inactive, or expired session. Please log in.']);
    }
    $body = stub_body($rawBody);
    @file_put_contents($GR_FILE . '.last-request.json', $rawBody);
    $all = is_file($GR_FILE) ? (json_decode((string) file_get_contents($GR_FILE), true) ?: []) : [];
    $mine = $all[$email] ?? [];
    $skipped = 0;
    foreach (($body['results'] ?? []) as $r) {
        if (!is_array($r) || !is_int($r['at'] ?? null) || !is_string($r['mode'] ?? null) || !is_array($r['scores'] ?? null)) {
            $skipped++;
            continue;
        }
        $mine[(string) $r['at']] = array_merge($mine[(string) $r['at']] ?? [], array_filter($r, fn ($v) => $v !== null));
    }
    $all[$email] = $mine;
    file_put_contents($GR_FILE, json_encode($all), LOCK_EX);
    $list = array_values($mine);
    usort($list, fn ($a, $b) => $a['at'] <=> $b['at']);
    stub_json(200, ['ok' => true, 'results' => $list, 'skipped' => $skipped]);
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
