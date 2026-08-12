<?php
declare(strict_types=1);

/**
 * AikiField contact form handler.
 *
 * Receives POST from contact.html form, validates input, sends email via
 * PHP mail(), and redirects back to contact.html with a status query param.
 *
 * Status codes:
 *   ?status=success — form submitted successfully
 *   ?status=error&msg=... — validation or send failure
 */

// --- Configuration ---
$RECIPIENT_EMAIL = 'kenneth@aikifield.com';
$FROM_EMAIL = 'contact@aikifield.com';
$REDIRECT_URL = 'contact.html';

// Shared coaching-auth config loader (same precedence login.php uses:
// coach-config.local.php overrides > coach-config.php defaults). Reused here
// only for TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY so the contact form's
// CAPTCHA shares one config source with login.php instead of a second one.
require __DIR__ . '/includes/coach-config.load.php';

// --- Staging guard ---
// The aikifield.peec.biz staging subdomain runs this exact same file (it's
// rsynced as-is, see sync.sh) so testing the contact form there must never
// reach the real inbox. Detected by hostname rather than an env var/config
// file so it works with zero extra cPanel configuration — whatever hostname
// the staging subdomain is created under, matching "aikifield.peec.biz" (or
// the STAGING=1 escape hatch below, for local/manual testing) is enough.
$IS_STAGING = getenv('STAGING') === '1'
    || str_contains(strtolower((string) ($_SERVER['HTTP_HOST'] ?? '')), 'aikifield.peec.biz');

// --- Only accept POST ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method not allowed. Please submit the form on the contact page.');
}

// --- Helper: redirect with status ---
function redirect_with_status(string $status, string $msg = ''): void
{
    global $REDIRECT_URL;
    $url = $REDIRECT_URL . '?status=' . urlencode($status);
    if ($msg !== '') {
        $url .= '&msg=' . urlencode($msg);
    }
    header('Location: ' . $url);
    exit;
}

// --- Extract and sanitize fields ---
// strip_header_injection: trim() only removes leading/trailing whitespace,
// not embedded CR/LF - a scripted (non-browser) POST can smuggle
// "\r\nBcc: victim@example.com" into any of these fields. They all end up
// either in a raw mail() header (name, via Reply-To) or in the body, so
// strip control characters from all of them for defense in depth (CWE-93).
function strip_header_injection(string $value): string
{
    return trim(str_replace(["\r", "\n"], '', $value));
}

$name = strip_header_injection($_POST['name'] ?? '');
$email = trim($_POST['email'] ?? '');
$organization = strip_header_injection($_POST['organization'] ?? '');
$interest = strip_header_injection($_POST['interest'] ?? '');
$message = trim($_POST['message'] ?? '');

// --- Rate limiting ---
// Turnstile CAPTCHA verification lives further down (after the honeypot
// check). This is a cheap, self-contained fixed-window limiter per IP, kept
// in addition to Turnstile so a scripted flood still can't call mail() on
// every request even before a CAPTCHA token is checked.
function contact_rate_limited(string $ip, int $maxRequests = 5, int $windowSeconds = 600): bool
{
    if ($ip === '') {
        return false; // nothing to key on - fail open rather than block everyone
    }
    $dir = __DIR__ . '/data/ratelimit';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return false; // fail open if local storage isn't available
    }
    $file = $dir . '/' . hash('sha256', $ip) . '.json';
    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        return false;
    }
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $data = $raw !== false && $raw !== '' ? json_decode($raw, true) : null;
    $now = time();
    $windowStart = is_array($data) ? (int) ($data['windowStart'] ?? $now) : $now;
    $count = is_array($data) ? (int) ($data['count'] ?? 0) : 0;
    if (($now - $windowStart) > $windowSeconds) {
        $windowStart = $now;
        $count = 0;
    }
    $count++;
    $limited = $count > $maxRequests;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode(['windowStart' => $windowStart, 'count' => $count]));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $limited;
}

if (contact_rate_limited((string) ($_SERVER['REMOTE_ADDR'] ?? ''))) {
    http_response_code(429);
    redirect_with_status('error', 'Too many submissions. Please wait a few minutes and try again.');
}

// Honeypot field — if filled, it's a bot
$honeypot = trim($_POST['website'] ?? '');
if ($honeypot !== '') {
    // Pretend success so bots don't retry
    redirect_with_status('success');
}

// --- Turnstile CAPTCHA verification ---
// Same TURNSTILE_SITE_KEY/TURNSTILE_SECRET_KEY pair login.php's widget uses
// (see includes/coach-config.load.php). Verified server-side against
// Cloudflare's siteverify endpoint, mirroring the cURL usage/timeout style
// of the backend calls in login.php and coach-proxy.php. Optional/fails open
// when TURNSTILE_SECRET_KEY is unset, exactly like the widget itself not
// rendering when TURNSTILE_SITE_KEY is unset — so this stays a no-op until
// an operator configures real keys in coach-config.local.php.
function contact_verify_turnstile(string $token, string $remoteIp): bool
{
    if (!defined('TURNSTILE_SECRET_KEY') || TURNSTILE_SECRET_KEY === '') {
        return true; // CAPTCHA not configured for this deployment - fail open
    }
    if ($token === '') {
        return false;
    }
    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => [
            'secret'   => TURNSTILE_SECRET_KEY,
            'response' => $token,
            'remoteip' => $remoteIp,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code !== 200) {
        error_log('contact-handler.php: Turnstile siteverify call failed http=' . (int) $code);
        return false; // transport/backend trouble - do not treat as verified
    }
    $data = json_decode($resp, true);
    return is_array($data) && ($data['success'] ?? false) === true;
}

$turnstileToken = trim($_POST['cf-turnstile-response'] ?? '');
if (!contact_verify_turnstile($turnstileToken, (string) ($_SERVER['REMOTE_ADDR'] ?? ''))) {
    redirect_with_status('error', 'CAPTCHA verification failed. Please try again.');
}

// --- Validation ---
$errors = [];

if ($name === '') {
    $errors[] = 'Name is required.';
}
if ($email === '') {
    $errors[] = 'Email is required.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Please enter a valid email address.';
}
if ($message === '') {
    $errors[] = 'Message is required.';
}

if (count($errors) > 0) {
    redirect_with_status('error', implode(' ', $errors));
}

// --- Build email ---
$subject = 'AikiField Inquiry: ' . ($interest !== '' ? $interest : 'General');

$body = "New inquiry from aikifield.com contact form:\n\n";
$body .= "Name: " . $name . "\n";
$body .= "Email: " . $email . "\n";
if ($organization !== '') {
    $body .= "Organization: " . $organization . "\n";
}
if ($interest !== '') {
    $body .= "Area of Interest: " . $interest . "\n";
}
$body .= "\nMessage:\n" . $message . "\n";
$body .= "\n---\n";
$body .= "Submitted: " . date('Y-m-d H:i:s') . " (server time)\n";
$body .= "IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n";

$headers = [
    'From: AikiField Contact <' . $FROM_EMAIL . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'X-Mailer: PHP/' . phpversion(),
    'Content-Type: text/plain; charset=UTF-8',
];

// --- Send ---
if ($IS_STAGING) {
    // No-op: log what would have been sent instead of calling mail(). This
    // keeps the form fully testable on staging (validation, redirects, the
    // success page) without ever touching kenneth@aikifield.com or a real
    // mail server.
    error_log(sprintf(
        'STAGING contact-handler: no-op, would have emailed %s — name=%s email=%s interest=%s',
        $RECIPIENT_EMAIL,
        $name,
        $email,
        $interest !== '' ? $interest : 'General'
    ));
    redirect_with_status('success');
}

$sent = mail($RECIPIENT_EMAIL, $subject, $body, implode("\r\n", $headers));

if ($sent) {
    redirect_with_status('success');
} else {
    error_log('AikiField contact form: mail() returned false for submission from ' . $email);
    redirect_with_status('error', 'There was a problem sending your message.');
}
