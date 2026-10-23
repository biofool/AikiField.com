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
        'tier'              => 'member',
        'targetEnvironment' => 'both',
    ],
    'admin@example.com' => [
        'username'          => 'admin',
        'admin'             => true,
        'active'            => true,
        'tier'              => 'member',
        'targetEnvironment' => 'both',
    ],
    // Issue #122: free-tier account (the kind LinkedIn sign-in auto-creates)
    // for member-gate tests.
    'free@example.com' => [
        'username'          => 'freebie',
        'admin'             => false,
        'active'            => true,
        'tier'              => 'free',
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

// Feature flags (issue #124 passkey-registration tests). The real
// GET /v1/feature-flags is public and returns only {key: bool} for registry
// keys; here the flags live in a control-plane file so a spec can turn
// passkey_login on without affecting the other specs' pages (the login
// visual baselines must keep the passkey button hidden).
$FLAGS_FILE = dirname($LOG_FILE) . '/af-e2e-stub-flags.json';
function stub_flags(string $file): array
{
    $raw = @file_get_contents($file);
    $flags = $raw === false ? [] : (json_decode($raw, true) ?: []);
    return is_array($flags) ? $flags : [];
}
if ($path === '/__stub/feature-flags') {
    if ($method === 'DELETE') {
        @unlink($FLAGS_FILE);
        stub_json(200, ['ok' => true]);
    }
    if ($method === 'POST') {
        $flags = stub_flags($FLAGS_FILE);
        foreach (stub_body($rawBody) as $k => $v) {
            $flags[(string) $k] = (bool) $v;
        }
        @file_put_contents($FLAGS_FILE, json_encode($flags), LOCK_EX);
        stub_json(200, ['ok' => true, 'flags' => $flags]);
    }
    stub_json(200, ['flags' => stub_flags($FLAGS_FILE)]);
}

// Revoked session tokens (issue #123 logout-revocation tests).
$REVOKE_FILE = dirname($LOG_FILE) . '/af-e2e-stub-revoked.json';
if ($path === '/__stub/revoked' && $method === 'DELETE') {
    @unlink($REVOKE_FILE);
    stub_json(200, ['ok' => true]);
}
function stub_revoked_tokens(string $file): array
{
    $raw = @file_get_contents($file);
    $list = $raw === false ? [] : (json_decode($raw, true) ?: []);
    return is_array($list) ? $list : [];
}
function stub_unrevoke(string $file, string $token): void
{
    $revoked = array_values(array_filter(
        stub_revoked_tokens($file),
        static fn ($t) => $t !== $token
    ));
    @file_put_contents($file, json_encode($revoked), LOCK_EX);
}

// ── Proxy-secret enforcement (mirrors backend/app/main.py) ───────────────────

$isExempt = str_starts_with($path, '/v1/auth/')
    || str_ends_with($path, '.html')
    || str_ends_with($path, '.css')
    || str_ends_with($path, '.js')
    || $path === '/'
    || $path === '/v1/feature-flags'   // public in the real backend (issue #657)
    || $path === '/healthz'
    || $path === '/health';

if ($SECRET !== '' && !$isExempt && !hash_equals($SECRET, $sent)) {
    error_log('stub-backend: proxy secret missing/mismatched for ' . $method . ' ' . $path);
    stub_json(403, ['detail' => 'Direct access is not permitted. Please use aikifield.com.']);
}

// ── Auth endpoints ──────────────────────────────────────────────────────────

if ($path === '/v1/auth/providers') {
    // LinkedIn is the only social provider, and coach-login.js only renders
    // its button for ?src=li visitors — returning it unconditionally is safe.
    stub_json(200, ['providers' => [['id' => 'linkedin', 'label' => 'LinkedIn']]]);
}

if ($path === '/v1/auth/verify' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $pass  = (string) ($body['password'] ?? '');
    if (!isset($USERS[$email]) || $pass !== STUB_PASSWORD) {
        stub_json(200, ['ok' => false, 'error' => 'Invalid email or password.']);
    }
    $user = $USERS[$email];
    // A successful sign-in supersedes any earlier sign-out — the real
    // backend mints a fresh token; our token is deterministic per email so
    // lift the email's prior revocation or a logout test would poison every
    // later login for that user.
    stub_unrevoke($REVOKE_FILE, stub_token($email));
    stub_json(200, [
        'ok'                => true,
        'email'             => $email,
        'sessionToken'      => stub_token($email),
        'admin'             => $user['admin'],
        'tier'              => $user['tier'],
        'targetEnvironment' => $user['targetEnvironment'],
    ]);
}

if ($path === '/v1/auth/check-session' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $token = (string) ($body['sessionToken'] ?? '');
    $revoked = in_array($token, stub_revoked_tokens($REVOKE_FILE), true);
    if ($revoked || !isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        error_log('stub-backend: check-session rejected email=' . $email
            . ($revoked ? ' (revoked)' : ''));
        stub_json(200, ['ok' => false, 'error' => 'Session is not valid.']);
    }
    $user = $USERS[$email];
    stub_json(200, [
        'ok'                => true,
        'email'             => $email,
        'admin'             => $user['admin'],
        'tier'              => $user['tier'],
        'targetEnvironment' => $user['targetEnvironment'],
    ]);
}

// Sign-out — mirrors /v1/auth/logout: the token stops working immediately.
if ($path === '/v1/auth/logout' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $token = (string) ($body['sessionToken'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        stub_json(200, ['ok' => false, 'error' => 'Session is not valid.']);
    }
    $revoked = stub_revoked_tokens($REVOKE_FILE);
    if (!in_array($token, $revoked, true)) {
        $revoked[] = $token;
        if (@file_put_contents($REVOKE_FILE, json_encode($revoked), LOCK_EX) === false) {
            error_log('stub-backend: could not write revoke file ' . $REVOKE_FILE);
            stub_json(500, ['detail' => 'revoke store unavailable']);
        }
    }
    stub_json(200, ['ok' => true]);
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
            // Issue #106: a source titled by a bare YouTube ID must render the
            // verified English title from data/youtube-titles.json.
            ['chunkId' => 'c3', 'title' => '2MU3b6LUi6Y',
             'youtubeUrl' => 'https://www.youtube.com/watch?v=2MU3b6LUi6Y'],
            // A YouTube source whose title is an opaque hash falls back to YT.
            ['chunkId' => 'c4', 'title' => 'a1b2c3d4e5f6a1b2c3d4',
             'youtubeUrl' => 'https://www.youtube.com/watch?v=stubVideo02'],
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

// Public feature flags — same shape as the real GET /v1/feature-flags
// ({flags: {key: bool}} only, no environment/actor). Values come from the
// /__stub/feature-flags control plane; empty by default so every flag reads
// as off unless a spec turns one on.
if ($path === '/v1/feature-flags' && $method === 'GET') {
    stub_json(200, ['flags' => stub_flags($FLAGS_FILE)]);
}

// ── Passkey registration (issue #124, AIR #650) ─────────────────────────────
// Same shapes as the real /v1/auth/passkey/register/{begin,finish}: begin is
// session-gated and returns {ok, challengeKey, options} where options mirrors
// PublicKeyCredentialCreationOptions; finish takes {credential, challengeKey}
// and returns {ok}. The challenge itself is fixed — the spec stubs
// navigator.credentials.create, so no real attestation is verified.

if ($path === '/v1/auth/passkey/register/begin' && $method === 'POST') {
    $email = strtolower(trim((string) ($_SERVER['HTTP_X_AUTH_EMAIL'] ?? '')));
    $token = (string) ($_SERVER['HTTP_X_AUTH_SESSION'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        stub_json(401, ['detail' => 'Session expired.']);
    }
    stub_json(200, [
        'ok'           => true,
        'challengeKey' => 'stub-challenge-key',
        'options'      => [
            'rp'         => ['name' => 'AikiField', 'id' => 'aikifield.com'],
            'user'       => [
                'id'          => 'c3R1Yi11c2VyLWlk',
                'name'        => $email,
                'displayName' => $email,
            ],
            'challenge'  => 'c3R1Yi1jaGFsbGVuZ2U',
            'pubKeyCredParams' => [
                ['type' => 'public-key', 'alg' => -7],
                ['type' => 'public-key', 'alg' => -257],
            ],
            'timeout'        => 60000,
            'excludeCredentials' => [],
            'attestation'    => 'none',
            'authenticatorSelection' => [
                'authenticatorAttachment' => 'platform',
                'userVerification'        => 'preferred',
                'residentKey'             => 'preferred',
                'requireResidentKey'      => false,
            ],
        ],
    ]);
}

if ($path === '/v1/auth/passkey/register/finish' && $method === 'POST') {
    $email = strtolower(trim((string) ($_SERVER['HTTP_X_AUTH_EMAIL'] ?? '')));
    $token = (string) ($_SERVER['HTTP_X_AUTH_SESSION'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        stub_json(401, ['detail' => 'Session expired.']);
    }
    $body = stub_body($rawBody);
    if (($body['challengeKey'] ?? '') !== 'stub-challenge-key' || ($body['credential'] ?? '') === '') {
        stub_json(200, ['ok' => false, 'error' => 'Registration challenge expired or invalid. Please try again.']);
    }
    stub_json(200, [
        'ok'           => true,
        'credentialId' => 'stub-cred-id',
        'message'      => 'Passkey registered.',
    ]);
}

// ── Health endpoints ────────────────────────────────────────────────────────

if ($path === '/healthz' || $path === '/health') {
    stub_json(200, ['status' => 'ok']);
}

// ── Fallback ────────────────────────────────────────────────────────────────

error_log('stub-backend: unhandled ' . $method . ' ' . $path);
stub_json(404, ['detail' => 'Stub backend has no handler for ' . $method . ' ' . $path]);
