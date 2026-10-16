<?php
declare(strict_types=1);

/**
 * The coaching session — one place for its lifetime rules and the two calls
 * to the backend (check-session, logout). AF #123.
 *
 * login.php establishes the PHP session; includes/beta-gate.load.php
 * revalidates it. Both used to carry their own copy of the cookie settings
 * and of the check-session request, and each copy had a different idea of
 * what a slow backend means. Cloud Run needs 10 to 17 seconds to start from
 * cold (coach-chat.js allows for that), but the check waited 10 seconds, and
 * a timeout destroyed a valid member's session.
 *
 * Needs includes/coach-config.load.php (COACH_BACKEND_URL, COACH_PROXY_SECRET,
 * COACH_VERIFY_TLS) to be loaded first.
 */

require_once __DIR__ . '/client-ip-signing.php';

/** How long a session (cookie and server-side file) lives. */
const AF_SESSION_LIFETIME_SECONDS = 7 * 86400;

/** The gate asks the backend again about a session this often. */
const AF_SESSION_REVALIDATE_SECONDS = 6 * 3600;

/**
 * When the backend cannot be reached at revalidation time, a session that was
 * valid at its last successful check is kept this much longer than the
 * revalidation interval, then signed out (fail closed after a long outage).
 */
const AF_SESSION_UNKNOWN_GRACE_SECONDS = 6 * 3600;

/** Seconds to wait for check-session: longer than a Cloud Run cold start. */
const AF_SESSION_CHECK_TIMEOUT_SECONDS = 35;

/** Seconds to wait for the backend to revoke a token at sign-out. */
const AF_SESSION_LOGOUT_TIMEOUT_SECONDS = 5;

/**
 * The configured value of a COACH_SESSION_* override, else the default. Tests
 * shorten the intervals through tests/e2e/config.test.php.
 */
function af_session_setting(string $constant, int $default): int
{
    if (defined($constant)) {
        $value = (int) constant($constant);
        if ($value > 0) {
            return $value;
        }
        error_log('coach-session: ' . $constant . ' must be a positive integer; using ' . $default);
    }
    return $default;
}

/** Start the PHP session with the site-wide cookie and a matching file lifetime. */
function af_session_start(): void
{
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443);
    // PHP deletes session files older than gc_maxlifetime (default 1440 s)
    // whatever the cookie says, which signed members out after 24 minutes of
    // silence. Hosts that run their own session cleaner must not use a shorter
    // limit; docs/coach-auth-prd.md lists the check.
    ini_set('session.gc_maxlifetime', (string) AF_SESSION_LIFETIME_SECONDS);
    session_set_cookie_params([
        'lifetime' => AF_SESSION_LIFETIME_SECONDS,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/**
 * POST a JSON body to the backend as this site's PHP host, signed with the
 * proxy secret and the visitor's address.
 *
 * @param array<string,mixed> $payload
 * @return array{code: int, body: string|false}  code 0 / body false = transport error
 */
function af_coach_post_json(string $path, array $payload, int $timeoutSeconds): array
{
    $headers = ['Content-Type: application/json'];
    if (defined('COACH_PROXY_SECRET') && COACH_PROXY_SECRET !== '') {
        $headers[] = 'X-Proxy-Secret: ' . COACH_PROXY_SECRET;
    }
    foreach (qa_signed_client_ip_headers(defined('COACH_PROXY_SECRET') ? (string) COACH_PROXY_SECRET : '') as $line) {
        $headers[] = $line;
    }
    $ch = curl_init(rtrim(COACH_BACKEND_URL, '/') . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeoutSeconds,
        CURLOPT_SSL_VERIFYPEER => COACH_VERIFY_TLS,
        CURLOPT_SSL_VERIFYHOST => COACH_VERIFY_TLS ? 2 : 0,
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = $body === false ? curl_error($ch) : '';
    curl_close($ch);
    if ($body === false) {
        error_log('coach-session: POST ' . $path . ' failed: ' . $error);
        return ['code' => 0, 'body' => false];
    }
    return ['code' => $code, 'body' => $body];
}

/**
 * Ask the backend whether a session token is still valid.
 *
 * status === true   the backend says the session is valid
 * status === false  the backend says it is not (revoked, expired, disabled)
 * status === null   could not tell: timeout, transport error, non-200, bad JSON
 *
 * "Could not tell" is not "revoked": a backend that is starting up must not
 * sign every member out.
 *
 * @return array{status: ?bool, data: array<string,mixed>}
 */
function af_coach_check_session(string $email, string $token, ?int $timeoutSeconds = null): array
{
    $timeout = $timeoutSeconds ?? af_session_setting('COACH_SESSION_CHECK_TIMEOUT', AF_SESSION_CHECK_TIMEOUT_SECONDS);
    $res = af_coach_post_json('/v1/auth/check-session', ['email' => $email, 'sessionToken' => $token], $timeout);
    if ($res['body'] === false || $res['code'] !== 200) {
        error_log('coach-session: check-session unavailable http=' . $res['code']
            . ' err=' . ($res['body'] === false ? 'transport' : 'status'));
        return ['status' => null, 'data' => []];
    }
    $data = json_decode($res['body'], true);
    if (!is_array($data)) {
        error_log('coach-session: check-session returned a body that is not JSON');
        return ['status' => null, 'data' => []];
    }
    return ['status' => (bool) ($data['ok'] ?? false), 'data' => $data];
}

/**
 * Revoke a session token at the backend. True only when the backend confirmed.
 * Failure is logged and returned; the caller still ends the PHP session.
 */
function af_coach_logout(string $email, string $token, ?int $timeoutSeconds = null): bool
{
    $res = af_coach_post_json('/v1/auth/logout', ['email' => $email, 'sessionToken' => $token],
        $timeoutSeconds ?? AF_SESSION_LOGOUT_TIMEOUT_SECONDS);
    if ($res['body'] === false || $res['code'] !== 200) {
        error_log('coach-session: WARNING logout was not confirmed by the backend http=' . $res['code']
            . '; the token stays valid there until it expires');
        return false;
    }
    $data = json_decode($res['body'], true);
    if (!is_array($data) || ($data['ok'] ?? false) !== true) {
        error_log('coach-session: WARNING the backend did not revoke the token at logout');
        return false;
    }
    return true;
}

/** The tier a check-session answer reports. A missing tier means "member" (old backend). */
function af_session_tier(array $checkData): string
{
    $tier = $checkData['tier'] ?? null;
    if (!is_string($tier) || $tier === '') {
        return 'member';
    }
    return strtolower(substr($tier, 0, 32));
}
