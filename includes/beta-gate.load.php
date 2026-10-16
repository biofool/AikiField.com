<?php
/**
 * Session gate for /beta/. Reuses the same PHP session that login.php
 * establishes for the coaching login — no separate auth mechanism.
 *
 * Unauthenticated visitors are redirected to /login.php?next=<original path>
 * so they land back on the page they wanted after signing in.
 *
 * Usage (from beta/*.php): require dirname(__DIR__) . '/includes/beta-gate.load.php';
 * See docs/coach-auth-prd.md for the shared session contract.
 */

require dirname(__DIR__) . '/includes/coach-config.load.php';
require_once dirname(__DIR__) . '/includes/coach-session.php';

af_session_start();

$qaEmail         = $_SESSION['qa_email'] ?? null;
$qaSessionToken  = $_SESSION['qa_session_token'] ?? null;
$betaAuthed      = !empty($qaEmail) && !empty($qaSessionToken);
$betaGateError   = '';

// --- Periodic re-validation against the backend ---
// login.php only calls /v1/auth/check-session once, at sign-in. If the backend
// disables the account or revokes/rotates the token, that revocation would
// otherwise not take effect here for the whole 7-day cookie lifetime, so ask
// again on a cadence (AF_SESSION_REVALIDATE_SECONDS, 6 hours) rather than
// once per session (too coarse) or on every request (wasteful).
//
// The backend answers one of three ways (af_coach_check_session):
//   valid     -> remember the time, refresh the tier
//   rejected  -> sign out, with ?error=session_expired on the login page
//   unknown   -> timeout, transport error, non-200. Cloud Run needs 10-17 s to
//                start from cold, so this must not sign members out. The
//                session is kept while it was valid within the revalidation
//                interval plus AF_SESSION_UNKNOWN_GRACE_SECONDS (12 hours in
//                all), then fails closed so a revoked session cannot outlive a
//                long outage. login.php seeds beta_last_validated at sign-in,
//                so even a first check after a long idle period has a grace
//                to fall back on (it used to destroy the session instead).
// While the backend is down, the check runs at most once per
// BETA_REVALIDATE_RETRY_BACKOFF_SECONDS instead of on every request.
const BETA_REVALIDATE_RETRY_BACKOFF_SECONDS = 60;

if ($betaAuthed) {
    $revalidateAfter = af_session_setting('COACH_SESSION_REVALIDATE_SECONDS', AF_SESSION_REVALIDATE_SECONDS);
    $lastChecked = (int) ($_SESSION['qa_session_checked_at'] ?? 0);
    $lastFailedAt = (int) ($_SESSION['qa_session_check_failed_at'] ?? 0);
    $due = (time() - $lastChecked) > $revalidateAfter;
    $backedOff = $lastFailedAt !== 0 && (time() - $lastFailedAt) < BETA_REVALIDATE_RETRY_BACKOFF_SECONDS;
    if ($due && !$backedOff) {
        $check = af_coach_check_session($qaEmail, $qaSessionToken);
        if ($check['status'] === true) {
            $_SESSION['qa_session_checked_at'] = time();
            $_SESSION['beta_last_validated'] = time();
            $_SESSION['qa_tier'] = af_session_tier($check['data']);
            unset($_SESSION['qa_session_check_failed_at']);
        } elseif ($check['status'] === false) {
            // Backend explicitly said the session is no longer valid
            // (disabled account, rotated/expired token, de-invited, etc.).
            $_SESSION = [];
            session_destroy();
            $betaAuthed = false;
            $betaGateError = 'session_expired';
        } else {
            $_SESSION['qa_session_check_failed_at'] = time();
            $graceUntil = $revalidateAfter
                + af_session_setting('COACH_SESSION_UNKNOWN_GRACE', AF_SESSION_UNKNOWN_GRACE_SECONDS);
            $lastValidated = (int) ($_SESSION['beta_last_validated'] ?? $lastChecked);
            $sinceValid = $lastValidated === 0 ? PHP_INT_MAX : time() - $lastValidated;
            if ($sinceValid >= $graceUntil) {
                error_log('beta-gate: check-session unavailable and the session was last valid '
                    . ($lastValidated === 0 ? 'never' : $sinceValid . ' s ago') . '; signing out');
                $_SESSION = [];
                session_destroy();
                $betaAuthed = false;
                $betaGateError = 'session_expired';
            } else {
                error_log('beta-gate: WARNING check-session unavailable; keeping the session (last valid '
                    . $sinceValid . ' s ago, limit ' . $graceUntil . ' s)');
            }
        }
    }
}

// Tier of the signed-in account ("member" or "free"). Sessions created before
// the backend reported a tier are members, as they always were.
$qaTier = $betaAuthed ? (string) ($_SESSION['qa_tier'] ?? 'member') : '';
$betaIsMember = $betaAuthed && $qaTier === 'member';

// AF_GATE_NO_REDIRECT: defined by callers that want the session state
// ($betaAuthed) without the unauthenticated redirect — e.g. JSON status
// endpoints like games/exercises/auth-state.php.
if (!$betaAuthed && !defined('AF_GATE_NO_REDIRECT')) {
    // Send the visitor to the blind login page with the originally-requested
    // path so login.php can redirect them back after a successful sign-in.
    $requested = $_SERVER['REQUEST_URI'] ?? '/beta/';
    // REQUEST_URI includes the query string; keep it so deep links survive.
    $next = urlencode($requested);
    $loginUrl = '/login.php?next=' . $next;
    if ($betaGateError !== '') {
        $loginUrl .= '&error=' . urlencode($betaGateError);
    }
    header('Location: ' . $loginUrl);
    exit;
}
