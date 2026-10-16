<?php
declare(strict_types=1);

/**
 * Unit tests for includes/coach-session.php (AF #123).
 *
 *   php tests/unit/test-coach-session.php
 *
 * The slow-backend, grace-period and logout behaviour is covered end to end by
 * tests/e2e/specs/session-reliability.spec.js.
 */

// session_start() refuses to run once output has started; buffer our own lines.
ob_start();

// The include needs the config constants; give it harmless ones.
define('COACH_BACKEND_URL', 'http://127.0.0.1:9');
define('COACH_PROXY_SECRET', 'test-proxy-secret');
define('COACH_VERIFY_TLS', false);
require __DIR__ . '/../../includes/coach-session.php';

$failures = 0;
function check(string $name, bool $ok, string $detail = ''): void
{
    global $failures;
    if ($ok) {
        echo "ok   $name\n";
        return;
    }
    $failures++;
    echo "FAIL $name" . ($detail !== '' ? " — $detail" : '') . "\n";
}

// ── Lifetime rules fit together ──────────────────────────────────────────────
// A session must outlive its revalidation interval plus the unknown-grace,
// or the gate would sign members out before it ever asked the backend.
check(
    'the cookie outlives revalidation + grace',
    AF_SESSION_LIFETIME_SECONDS > AF_SESSION_REVALIDATE_SECONDS + AF_SESSION_UNKNOWN_GRACE_SECONDS
);
check(
    'the check timeout is longer than a Cloud Run cold start (17 s)',
    AF_SESSION_CHECK_TIMEOUT_SECONDS >= 30
);

// ── The file lifetime follows the cookie lifetime ────────────────────────────
af_session_start();
check(
    'session.gc_maxlifetime matches the cookie lifetime',
    (int) ini_get('session.gc_maxlifetime') === AF_SESSION_LIFETIME_SECONDS,
    (string) ini_get('session.gc_maxlifetime')
);
$params = session_get_cookie_params();
check('cookie lifetime', $params['lifetime'] === AF_SESSION_LIFETIME_SECONDS);
check('cookie is HttpOnly and SameSite=Lax', $params['httponly'] === true && $params['samesite'] === 'Lax');
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

// ── Settings overrides ───────────────────────────────────────────────────────
check('a default is used when no override is defined', af_session_setting('COACH_SESSION_NOT_DEFINED', 42) === 42);
define('COACH_SESSION_TEST_OVERRIDE', 7);
check('an override wins', af_session_setting('COACH_SESSION_TEST_OVERRIDE', 42) === 7);
define('COACH_SESSION_TEST_BAD', 0);
check('a non-positive override is ignored', af_session_setting('COACH_SESSION_TEST_BAD', 42) === 42);

// ── Tier ─────────────────────────────────────────────────────────────────────
check('a missing tier means member (old backend)', af_session_tier(['ok' => true]) === 'member');
check('an empty tier means member', af_session_tier(['tier' => '']) === 'member');
check('member', af_session_tier(['tier' => 'member']) === 'member');
check('free', af_session_tier(['tier' => 'free']) === 'free');
check('case is normalised', af_session_tier(['tier' => 'FREE']) === 'free');
check('a non-string tier means member (old backend)', af_session_tier(['tier' => ['x']]) === 'member');
check('an unknown tier is kept as is (the gates then refuse it)', af_session_tier(['tier' => 'trial']) === 'trial');

// ── A dead backend is "could not tell", never "revoked" ──────────────────────
$res = af_coach_check_session('a@b.co', 'token', 1);
check('an unreachable backend gives status null', $res['status'] === null);
check('logout against an unreachable backend returns false', af_coach_logout('a@b.co', 'token', 1) === false);

ob_end_flush();
exit($failures === 0 ? 0 : 1);
