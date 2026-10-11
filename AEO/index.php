<?php
/**
 * AEO review landing — one page for Ask AikiField records that still need
 * editorial review, plus an operator walk of published pages. Sign-in
 * required: coaching admin OR aeoAccess (same flags as quantumaikido.com).
 *
 * Production path: /AEO/  Public knowledge pages live at /ask/.
 */
declare(strict_types=1);

$root = dirname(__DIR__);

// Session gate: redirects unauthed visitors to /login.php?next=/AEO/
require $root . '/includes/beta-gate.load.php';

// Role check: admin or aeoAccess, verified against the backend's
// check-session (beta-gate already validated the session; this call also
// returns the role flags).
$email = $_SESSION['qa_email'] ?? '';
$token = $_SESSION['qa_session_token'] ?? '';
$allowed = false;
if ($email !== '' && $token !== '') {
    $verifyUrl = rtrim(COACH_BACKEND_URL, '/') . '/v1/auth/check-session';
    $payload = json_encode(['email' => $email, 'sessionToken' => $token]);
    $reqHeaders = ['Content-Type: application/json'];
    if (defined('COACH_PROXY_SECRET') && COACH_PROXY_SECRET !== '') {
        $reqHeaders[] = 'X-Proxy-Secret: ' . COACH_PROXY_SECRET;
    }
    $ch = curl_init($verifyUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $reqHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => COACH_VERIFY_TLS,
        CURLOPT_SSL_VERIFYHOST => COACH_VERIFY_TLS ? 2 : 0,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code !== 200) {
        // Backend hiccup — fall back to the session's admin flag (logged,
        // fail-open only for admins since aeoAccess is not session-cached).
        error_log('AEO gate: check-session failed http=' . (int) $code . ' — using cached admin flag');
        $allowed = !empty($_SESSION['qa_is_admin']);
    } else {
        $data = json_decode($resp, true);
        $allowed = !empty($data['admin']) || !empty($data['aeoAccess']);
    }
}
if (!$allowed) {
    header('Location: /login.php?next=' . urlencode('/AEO/') . '&error=aeo_required');
    exit;
}

require $root . '/includes/ask-lib.php';
ask_render_aeo_review_document();
