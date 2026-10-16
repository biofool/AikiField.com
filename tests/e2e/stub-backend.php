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
 *   4. /v1/auth/providers — LinkedIn only (the one provider AikiField offers);
 *      /__stub/providers switches it off to model a backend whose LinkedIn
 *      settings are not deployed (AikiField #105).
 *   5. /v1/auth/linkedin/{authorize,callback} and /v1/auth/oauth/exchange —
 *      the same redirect contract as AIRichardMoon, including the state-binding
 *      nonce cookie (AIR#941) the AikiField proxy has to relay.
 *   6. /v1/auth/logout, /v1/feature-flags and the passkey register routes, with
 *      the response shapes of AIRichardMoon.
 *   7. `tier` ("member" | "free") on check-session, like AIR#940.
 *
 * It also keeps a request log (QA_STUB_LOG) that tests read through
 * /__stub/requests to assert which backend was contacted and whether the
 * proxy secret and forwarded headers arrived — a much stronger check than
 * inspecting the DOM alone.
 *
 * Test accounts (password is the same for all):
 *   test@example.com           — standard member (beta access)
 *   admin@example.com          — admin user
 *   free@example.com           — free tier (a LinkedIn sign-up): games and chat, no for-review
 *   linkedin-user@example.com  — free tier; the account the LinkedIn stub flow signs in
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
        'tier'              => 'member',
    ],
    'admin@example.com' => [
        'username'          => 'admin',
        'admin'             => true,
        'active'            => true,
        'targetEnvironment' => 'both',
        'tier'              => 'member',
    ],
    'free@example.com' => [
        'username'          => 'freeuser',
        'admin'             => false,
        'active'            => true,
        'targetEnvironment' => 'both',
        'tier'              => 'free',
    ],
    'linkedin-user@example.com' => [
        'username'          => 'linkedinuser',
        'admin'             => false,
        'active'            => true,
        'targetEnvironment' => 'both',
        'tier'              => 'free',
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
    'origin'           => $_SERVER['HTTP_ORIGIN'] ?? '',
    // Cookie NAMES only, never values: proves the proxy forwards exactly the
    // OAuth state-binding cookie and nothing else (no PHP session id).
    'cookieNames'      => implode(',', array_keys($_COOKIE)),
    // Signed visitor address (AIR#943): X-AF-Client-IP / -Ts / -Sig, plus whether
    // the signature verifies with the shared proxy secret.
    'afClientIp'       => $_SERVER['HTTP_X_AF_CLIENT_IP'] ?? '',
    'afClientTs'       => $_SERVER['HTTP_X_AF_CLIENT_TS'] ?? '',
    'afClientSig'      => $_SERVER['HTTP_X_AF_CLIENT_SIG'] ?? '',
    'afClientSigValid' => ($SECRET !== '' && isset($_SERVER['HTTP_X_AF_CLIENT_IP'], $_SERVER['HTTP_X_AF_CLIENT_TS'], $_SERVER['HTTP_X_AF_CLIENT_SIG'])
        && hash_equals(
            hash_hmac('sha256', $_SERVER['HTTP_X_AF_CLIENT_IP'] . '|' . $_SERVER['HTTP_X_AF_CLIENT_TS'], $SECRET),
            (string) $_SERVER['HTTP_X_AF_CLIENT_SIG']
        )),
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

// Stub switches and server-side state (revoked tokens, OAuth states, flags).
// One JSON file next to the request log; /__stub/reset wipes it.
$STATE_FILE = dirname($LOG_FILE) . '/af-e2e-stub-state.json';

function stub_state_read(string $file): array
{
    if (!is_file($file)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($file), true);
    if (!is_array($decoded)) {
        error_log('stub-backend: state file is not JSON, starting empty: ' . $file);
        return [];
    }
    return $decoded;
}

function stub_state_write(string $file, array $state): void
{
    if (file_put_contents($file, json_encode($state), LOCK_EX) === false) {
        error_log('stub-backend: could not write state file ' . $file);
    }
}

if ($path === '/__stub/reset' && $method === 'POST') {
    @unlink($STATE_FILE);
    stub_json(200, ['ok' => true]);
}
// Control switches, all POST {…}: providers {linkedin:bool}, feature-flags
// {flags:{name:bool}}, check-session-delay {ms:int}, oauth/require-nonce {on:bool}.
if (str_starts_with($path, '/__stub/') && $method === 'POST'
    && in_array($path, ['/__stub/providers', '/__stub/feature-flags', '/__stub/check-session-delay', '/__stub/oauth/require-nonce'], true)) {
    $state = stub_state_read($STATE_FILE);
    $body = stub_body($rawBody);
    switch ($path) {
        case '/__stub/providers':
            $state['linkedinEnabled'] = (bool) ($body['linkedin'] ?? true);
            break;
        case '/__stub/feature-flags':
            $state['flags'] = is_array($body['flags'] ?? null) ? $body['flags'] : [];
            break;
        case '/__stub/check-session-delay':
            $state['checkSessionDelayMs'] = max(0, (int) ($body['ms'] ?? 0));
            break;
        case '/__stub/oauth/require-nonce':
            $state['requireNonce'] = (bool) ($body['on'] ?? true);
            break;
    }
    stub_state_write($STATE_FILE, $state);
    stub_json(200, ['ok' => true, 'state' => $state]);
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
    // LinkedIn is the only provider AikiField offers (and only for ?src=li).
    // /__stub/providers {linkedin:false} models production today: the LinkedIn
    // settings are not deployed, so the provider list is empty (AikiField #105).
    $state = stub_state_read($STATE_FILE);
    if (!($state['linkedinEnabled'] ?? true)) {
        stub_json(200, ['providers' => []]);
    }
    stub_json(200, ['providers' => [[
        'id'    => 'linkedin',
        'label' => 'LinkedIn',
        'icon'  => '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect width="24" height="24" rx="3" fill="#0a66c2"/></svg>',
    ]]]);
}

// ── OAuth (LinkedIn): authorize → callback → one-time code → exchange ───────
// Same redirect contract as AIRichardMoon. authorize sets the state-binding
// nonce cookie (AIR#941); callback checks it when the stub's require-nonce
// switch is on (AIR's oauth_state_binding_required). The consent screen is
// skipped: authorize redirects straight back to redirect_uri.

if ($path === '/v1/auth/linkedin/authorize' && $method === 'GET') {
    $state = stub_state_read($STATE_FILE);
    if (!($state['linkedinEnabled'] ?? true)) {
        stub_json(503, ['detail' => 'LinkedIn sign-in is not configured.']);
    }
    // Like AIR, the callback and landing URLs come from the backend's own
    // settings (linkedin_oauth_redirect_uri / linkedin_oauth_login_url), here
    // QA_STUB_APP_ORIGIN, never from the request.
    $appOrigin = rtrim((string) (getenv('QA_STUB_APP_ORIGIN') ?: ''), '/');
    if ($appOrigin === '') {
        error_log('stub-backend: QA_STUB_APP_ORIGIN is not set; the LinkedIn flow cannot redirect');
        stub_json(500, ['detail' => 'Stub is missing QA_STUB_APP_ORIGIN.']);
    }
    $redirectUri = $appOrigin . '/coach-api/v1/auth/linkedin/callback';
    $oauthState = bin2hex(random_bytes(12));
    $nonce = bin2hex(random_bytes(16));
    $state['oauth']['states'][$oauthState] = [
        'nonceHash' => hash('sha256', $nonce),
        'src'       => (string) ($_GET['src'] ?? ''),
    ];
    stub_state_write($STATE_FILE, $state);
    setcookie('oauth_nonce', $nonce, ['expires' => time() + 600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    $target = $redirectUri . '?'
        . (isset($_GET['stub_cancel'])
            ? 'error=access_denied&state=' . $oauthState
            : 'code=stubcode&state=' . $oauthState);
    http_response_code(302);
    header('Location: ' . $target);
    exit;
}

if ($path === '/v1/auth/linkedin/callback' && $method === 'GET') {
    $state = stub_state_read($STATE_FILE);
    $oauthState = (string) ($_GET['state'] ?? '');
    $rec = $state['oauth']['states'][$oauthState] ?? null;
    // AIR redirects to linkedin_oauth_login_url with ?error=<plain message> or
    // &oauth_code=<one-time code> appended (auth/oauth_config.py login_redirect_url).
    $login = static function (string $query): void {
        $appOrigin = rtrim((string) (getenv('QA_STUB_APP_ORIGIN') ?: ''), '/');
        http_response_code(302);
        header('Location: ' . $appOrigin . '/login.php?next=/digital-experience/' . $query);
        exit;
    };
    if (($_GET['error'] ?? '') !== '') {
        // The member cancelled at LinkedIn: no `code`. AIR#942 turns this into a
        // plain message on the login page instead of raw 422 JSON.
        unset($state['oauth']['states'][$oauthState]);
        stub_state_write($STATE_FILE, $state);
        $login('&error=' . rawurlencode('LinkedIn sign-in was cancelled.'));
    }
    if ($rec === null) {
        error_log('stub-backend: linkedin callback with unknown state');
        $login('&error=' . rawurlencode('That sign-in link has expired. Please start again.'));
    }
    unset($state['oauth']['states'][$oauthState]);   // state is single use
    $cookieNonce = (string) ($_COOKIE['oauth_nonce'] ?? '');
    $bound = $cookieNonce !== '' && hash_equals($rec['nonceHash'], hash('sha256', $cookieNonce));
    if (!$bound) {
        error_log('stub-backend: linkedin callback without a matching oauth_nonce cookie');
        if ($state['requireNonce'] ?? false) {
            stub_state_write($STATE_FILE, $state);
            $login('&error=' . rawurlencode('Sign-in could not be verified in this browser. Please start again.'));
        }
    }
    $otc = 'otc_' . bin2hex(random_bytes(12));
    $state['oauth']['otcs'][$otc] = 'linkedin-user@example.com';
    stub_state_write($STATE_FILE, $state);
    setcookie('oauth_nonce', '', ['expires' => time() - 3600, 'path' => '/']);
    $login('&oauth_code=' . $otc);
}

if ($path === '/v1/auth/oauth/exchange' && $method === 'POST') {
    $state = stub_state_read($STATE_FILE);
    $otc = (string) ($_GET['otc'] ?? '');
    $email = $state['oauth']['otcs'][$otc] ?? null;
    if ($email === null || !isset($USERS[$email])) {
        stub_json(410, ['detail' => 'OAuth code is invalid or expired']);   // AIR: HTTPException 410
    }
    unset($state['oauth']['otcs'][$otc], $state['revoked'][$email]);   // one-time code
    stub_state_write($STATE_FILE, $state);
    stub_json(200, [
        'ok'           => true,
        'token'        => stub_token($email),
        'sessionToken' => stub_token($email),
        'email'        => $email,
        'name'         => '',
        'username'     => $USERS[$email]['username'],
        'admin'        => $USERS[$email]['admin'],
        'expiresAt'    => date('c', time() + 86400),
    ]);
}

if ($path === '/v1/auth/verify' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $pass  = (string) ($body['password'] ?? '');
    if (!isset($USERS[$email]) || $pass !== STUB_PASSWORD) {
        stub_json(200, ['ok' => false, 'error' => 'Invalid email or password.']);
    }
    $user = $USERS[$email];
    // A fresh sign-in re-enables the (deterministic) stub token that a logout revoked.
    $state = stub_state_read($STATE_FILE);
    if (isset($state['revoked'][$email])) {
        unset($state['revoked'][$email]);
        stub_state_write($STATE_FILE, $state);
    }
    stub_json(200, [
        'ok'                => true,
        'email'             => $email,
        'sessionToken'      => stub_token($email),
        'admin'             => $user['admin'],
        'targetEnvironment' => $user['targetEnvironment'],
        'tier'              => $user['tier'],
    ]);
}

if ($path === '/v1/auth/check-session' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $token = (string) ($body['sessionToken'] ?? '');
    $state = stub_state_read($STATE_FILE);
    // /__stub/check-session-delay models a cold Cloud Run start (AikiField #123).
    if (($state['checkSessionDelayMs'] ?? 0) > 0) {
        usleep((int) $state['checkSessionDelayMs'] * 1000);
    }
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token) || isset($state['revoked'][$email])) {
        error_log('stub-backend: check-session rejected email=' . $email);
        stub_json(200, ['ok' => false, 'error' => 'Session is not valid.']);
    }
    $user = $USERS[$email];
    stub_json(200, [
        'ok'                => true,
        'email'             => $email,
        'admin'             => $user['admin'],
        'targetEnvironment' => $user['targetEnvironment'],
        'tier'              => $user['tier'],
    ]);
}

// POST /v1/auth/logout {email, sessionToken} → {ok}. Revokes the token, like
// the real backend (AikiField #123: sign-out must end the backend session).
if ($path === '/v1/auth/logout' && $method === 'POST') {
    $body  = stub_body($rawBody);
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $token = (string) ($body['sessionToken'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        stub_json(200, ['ok' => false]);
    }
    $state = stub_state_read($STATE_FILE);
    $state['revoked'][$email] = true;
    stub_state_write($STATE_FILE, $state);
    stub_json(200, ['ok' => true]);
}

// GET /v1/feature-flags → {flags:{name:bool}} (public, like AIR).
if ($path === '/v1/feature-flags' && $method === 'GET') {
    $state = stub_state_read($STATE_FILE);
    stub_json(200, ['flags' => array_merge(['passkey_login' => false], is_array($state['flags'] ?? null) ? $state['flags'] : [])]);
}

// Passkey registration (authenticated). Response shapes follow AIR's
// auth/_passkey_register.py: begin → {ok, challengeKey, options}; finish
// takes {credential (JSON string), challengeKey} → {ok}.
if (($path === '/v1/auth/passkey/register/begin' || $path === '/v1/auth/passkey/register/finish') && $method === 'POST') {
    $email = strtolower(trim((string) ($_SERVER['HTTP_X_AUTH_EMAIL'] ?? '')));
    $token = (string) ($_SERVER['HTTP_X_AUTH_SESSION'] ?? '');
    if (!isset($USERS[$email]) || !hash_equals(stub_token($email), $token)) {
        stub_json(401, ['detail' => 'Invalid, inactive, or expired session. Please log in.']);
    }
    $state = stub_state_read($STATE_FILE);
    if ($path === '/v1/auth/passkey/register/begin') {
        $key = 'ck_' . bin2hex(random_bytes(8));
        $state['passkeyChallenge'][$email] = $key;
        stub_state_write($STATE_FILE, $state);
        stub_json(200, [
            'ok'           => true,
            'challengeKey' => $key,
            'options'      => [
                'rp'                     => ['name' => 'AikiField', 'id' => 'localhost'],
                'user'                   => ['id' => 'dXNlcg', 'name' => $email, 'displayName' => $email],
                'challenge'              => 'Y2hhbGxlbmdl',
                'pubKeyCredParams'       => [['type' => 'public-key', 'alg' => -7]],
                'timeout'                => 60000,
                'excludeCredentials'     => [],
                'attestation'            => 'none',
                'authenticatorSelection' => ['authenticatorAttachment' => 'platform', 'userVerification' => 'preferred', 'residentKey' => 'preferred', 'requireResidentKey' => false],
            ],
        ]);
    }
    $body = stub_body($rawBody);
    if (!is_string($body['credential'] ?? null) || ($body['challengeKey'] ?? '') !== ($state['passkeyChallenge'][$email] ?? null)) {
        stub_json(200, ['ok' => false, 'error' => 'Registration challenge expired or invalid. Please try again.']);
    }
    unset($state['passkeyChallenge'][$email]);
    stub_state_write($STATE_FILE, $state);
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

// ── Health endpoints ────────────────────────────────────────────────────────

if ($path === '/healthz' || $path === '/health') {
    stub_json(200, ['status' => 'ok']);
}

// ── Fallback ────────────────────────────────────────────────────────────────

error_log('stub-backend: unhandled ' . $method . ' ' . $path);
stub_json(404, ['detail' => 'Stub backend has no handler for ' . $method . ' ' . $path]);
