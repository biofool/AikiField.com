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

/**
 * Re-verify a /beta/ session against the backend's /v1/auth/check-session.
 * Same request shape login.php's POST handler already uses at sign-in.
 *
 * Returns true (still valid), false (backend explicitly rejected it), or
 * null (couldn't tell - transport/HTTP error, treat as "unknown" rather
 * than "revoked" so a backend hiccup doesn't log everyone out).
 */
function qa_revalidate_beta_session(string $email, string $token): ?bool
{
    $verifyUrl = rtrim(COACH_BACKEND_URL, '/') . '/v1/auth/check-session';
    $payload = json_encode(['email' => $email, 'sessionToken' => $token]);
    $ch = curl_init($verifyUrl);
    $reqHeaders = ['Content-Type: application/json'];
    if (defined('COACH_PROXY_SECRET') && COACH_PROXY_SECRET !== '') {
        $reqHeaders[] = 'X-Proxy-Secret: ' . COACH_PROXY_SECRET;
    }
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => $reqHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => COACH_VERIFY_TLS,
        CURLOPT_SSL_VERIFYHOST => COACH_VERIFY_TLS ? 2 : 0,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code !== 200) {
        error_log('beta-gate: check-session revalidation failed http=' . (int) $code
            . ' err=' . ($resp === false ? 'transport' : 'status'));
        return null;
    }
    $data = json_decode($resp, true);
    return (bool) ($data['ok'] ?? false);
}

if (session_status() === PHP_SESSION_NONE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443);
    session_set_cookie_params([
        'lifetime' => 86400 * 7,  // 7 days
        'path'     => '/',
        'domain'   => '',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

$qaEmail         = $_SESSION['qa_email'] ?? null;
$qaSessionToken  = $_SESSION['qa_session_token'] ?? null;
$betaAuthed      = !empty($qaEmail) && !empty($qaSessionToken);
$betaGateError   = '';

// --- Periodic re-validation against the backend ---
// login.php only calls /v1/auth/check-session once, at sign-in, then this
// gate trusted qa_email/qa_session_token for the full 7-day cookie lifetime
// with no further check. If the backend disables the account or
// revokes/rotates the token, that revocation would otherwise not take effect
// here for up to 7 days. Re-check on a cadence instead: once per PHP session
// is too coarse given the 7-day cookie, and re-checking on every single
// request is wasteful, so use a wall-clock interval stored alongside the
// token (login.php sets qa_session_checked_at at sign-in).
const BETA_REVALIDATE_INTERVAL_SECONDS = 6 * 3600; // re-check at most every 6h
// While the backend is unreachable, retrying on *every* request would turn a
// backend outage into a 10s-per-request (CURLOPT_TIMEOUT) storm across all of
// /beta/ on shared hosting with a small worker pool. Back off: only retry the
// check once per this interval, tracked separately from qa_session_checked_at
// so a failed attempt doesn't look like — or block — a later successful one.
// On a failed check, fail closed (redirect to login) unless the session was
// validated within BETA_CACHED_VALIDITY_SECONDS — a short cached-validity
// window that keeps a recently-verified session working through a transient
// backend hiccup without letting a revoked session retain access indefinitely.
const BETA_REVALIDATE_RETRY_BACKOFF_SECONDS = 60;
const BETA_CACHED_VALIDITY_SECONDS = 300; // 5 minutes — fail-open grace window

if ($betaAuthed) {
    $lastChecked = (int) ($_SESSION['qa_session_checked_at'] ?? 0);
    $lastFailedAt = (int) ($_SESSION['qa_session_check_failed_at'] ?? 0);
    $due = (time() - $lastChecked) > BETA_REVALIDATE_INTERVAL_SECONDS;
    $backedOff = $lastFailedAt !== 0 && (time() - $lastFailedAt) < BETA_REVALIDATE_RETRY_BACKOFF_SECONDS;
    if ($due && !$backedOff) {
        $stillValid = qa_revalidate_beta_session($qaEmail, $qaSessionToken);
        if ($stillValid === true) {
            $_SESSION['qa_session_checked_at'] = time();
            $_SESSION['beta_last_validated'] = time();
            unset($_SESSION['qa_session_check_failed_at']);
        } elseif ($stillValid === false) {
            // Backend explicitly said the session is no longer valid
            // (disabled account, rotated/expired token, de-invited, etc.) —
            // clear the local session and force a fresh login.
            $_SESSION = [];
            session_destroy();
            $betaAuthed = false;
        } else {
            // $stillValid === null means the backend call itself failed
            // (network/timeout/non-200). Fail closed (redirect to login)
            // unless the session was validated within
            // BETA_CACHED_VALIDITY_SECONDS — a short cached-validity window
            // that keeps a recently-verified session working through a
            // transient backend hiccup without letting a revoked session
            // retain access indefinitely during an extended outage. Record
            // the failure either way so we back off instead of retrying on
            // every request while the outage lasts.
            $_SESSION['qa_session_check_failed_at'] = time();
            $lastValidated = (int) ($_SESSION['beta_last_validated'] ?? 0);
            if ($lastValidated === 0 || (time() - $lastValidated) >= BETA_CACHED_VALIDITY_SECONDS) {
                $_SESSION = [];
                session_destroy();
                $betaAuthed = false;
                $betaGateError = 'session_expired';
            }
        }
    }
}

if (!$betaAuthed) {
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
