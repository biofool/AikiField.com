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
require dirname(__DIR__) . '/includes/cloudflare-ips.php';

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
    // Forward the trust-checked client IP so the backend's rate limiting is
    // keyed on the real visitor, not the shared-host egress IP (issue #100).
    foreach (qa_resolve_client_ip_headers(
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? (string) $_SERVER['HTTP_CF_CONNECTING_IP'] : null,
        isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? (string) $_SERVER['HTTP_X_FORWARDED_FOR'] : null
    ) as $hName => $hValue) {
        $reqHeaders[] = "$hName: $hValue";
    }
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => $reqHeaders,
        CURLOPT_RETURNTRANSFER => true,
        // Cloud Run cold start is ~10-17 s; a 10 s timeout turns every cold
        // backend into a mass sign-out (issue #123). 35 s covers the start.
        CURLOPT_TIMEOUT        => 35,
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
    // The session cookie promises 7 days; the default gc_maxlifetime (1440 s)
    // would let the server-side file die long before that (issue #123).
    ini_set('session.gc_maxlifetime', (string) (86400 * 7));
    // Honour the scheme the client actually used — behind a TLS-terminating
    // proxy (Cloudflare) $_SERVER['HTTPS'] is empty even for https visitors,
    // which would drop the Secure flag (issue #100).
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443)
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https'
        || str_contains((string) ($_SERVER['HTTP_CF_VISITOR'] ?? ''), '"https"');
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
// backend outage into a 35s-per-request (CURLOPT_TIMEOUT) storm across all of
// /beta/ on shared hosting with a small worker pool. Back off: only retry the
// check once per this interval, tracked separately from qa_session_checked_at
// so a failed attempt doesn't look like — or block — a later successful one.
// On a failed check, fail closed (redirect to login) unless the session was
// validated within BETA_CACHED_VALIDITY_SECONDS — a bounded cached-validity
// window that keeps a recently-verified session working through a backend
// outage without letting a revoked session retain access indefinitely.
// 24h: longer than the 6h re-check cadence so one cold start never kills a
// healthy session, and aligned with the backend's session-token TTL
// (auth_session_ttl_hours, default 24) — past that the token is dead anyway.
const BETA_REVALIDATE_RETRY_BACKOFF_SECONDS = 60;
const BETA_CACHED_VALIDITY_SECONDS = 24 * 3600; // bounded fail-open grace

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
            // clear the local session and force a fresh login. Carry an
            // error flag so login.php shows a message instead of a bare form.
            $_SESSION = [];
            session_destroy();
            $betaAuthed = false;
            $betaGateError = 'session_expired';
        } else {
            // $stillValid === null means the backend call itself failed
            // (network/timeout/non-200 — including Cloud Run cold starts).
            // Fail closed (redirect to login) unless the session was
            // validated within BETA_CACHED_VALIDITY_SECONDS — a bounded
            // cached-validity window that keeps a recently-verified session
            // working through a backend outage without letting a revoked
            // session retain access indefinitely during an extended outage.
            // Record the failure either way so we back off instead of
            // retrying on every request while the outage lasts.
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

/**
 * Member-tier gate (issue #122): for-review material and gated JSON are for
 * invited members. A `free` account (e.g. created automatically by LinkedIn
 * sign-in) gets a plain 403; a WARNING is logged. A missing qa_tier is
 * treated as 'member' until the backend ships the tier field — deploy order
 * is AIR first, then this repo.
 */
function af_require_member_tier(string $surface): void
{
    $tier = (string) ($_SESSION['qa_tier'] ?? 'member');
    if ($tier !== 'free') {
        return;
    }
    error_log('WARNING: ' . $surface . ': refused free-tier account '
        . (string) ($_SESSION['qa_email'] ?? '(unknown)'));
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo "This area is for invited members.\n";
    exit;
}

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
