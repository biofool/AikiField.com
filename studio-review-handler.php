<?php
declare(strict_types=1);

/**
 * AikiField studio-review intake handler.
 *
 * Receives POST from /somatic-studios/ intake form, validates input, sends
 * email via PHP mail(), and redirects to /somatic-studios/thanks.html on
 * success or back to the form with ?status=error&msg=... on failure.
 *
 * Modeled on contact-handler.php — same honeypot, Turnstile, rate-limit and
 * staging-guard mechanics; field set matches the somatic-studios form.
 */

// --- Configuration ---
$RECIPIENT_EMAIL = 'kenneth@aikifield.com';
$FROM_EMAIL = 'contact@aikifield.com';
$FORM_URL = '/somatic-studios/index.html';
$SUCCESS_URL = '/somatic-studios/thanks.html';

// Shared coaching-auth config loader (TURNSTILE_SITE_KEY /
// TURNSTILE_SECRET_KEY — same pair contact-handler.php uses).
require __DIR__ . '/includes/coach-config.load.php';

// Cloudflare edge-IP trust decision — see contact-handler.php for why the
// limiter and notification email key on the real visitor address.
require __DIR__ . '/includes/cloudflare-ips.php';

// Input hygiene for the mail forms (AF #125): one Reply-To address, no NUL,
// encoded Subject, length limits.
require __DIR__ . '/includes/form-input.php';

function studio_client_ip(): string
{
    $remoteAddr = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if ($remoteAddr !== '' && qa_is_cloudflare_ip($remoteAddr)) {
        $cfIp = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
        if ($cfIp !== '') {
            return $cfIp;
        }
    }
    return $remoteAddr;
}

// --- Staging guard (same hostnames/contact-handler.php convention) ---
$_staging_host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$IS_STAGING = getenv('STAGING') === '1'
    || str_contains($_staging_host, 'aikifield.peec.biz')
    || str_contains($_staging_host, 'staging.peec.biz');
unset($_staging_host);

// --- Only accept POST ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Method not allowed. Please submit the form on the somatic studios page.');
}

// --- Helper: redirect back to the form with an error ---
function redirect_with_error(string $msg): void
{
    global $FORM_URL;
    header('Location: ' . $FORM_URL . '?status=error&msg=' . urlencode($msg));
    exit;
}

// --- Extract and sanitize fields ---
// See includes/form-input.php: a NUL byte is refused (it made mail() throw,
// HTTP 500), arrays count as empty, control characters are removed (CWE-93),
// and every field has a length limit.
if (af_form_has_nul($_POST)) {
    error_log('studio-review-handler.php: refused a submission containing a NUL byte');
    http_response_code(400);
    header('Content-Type: text/html; charset=utf-8');
    exit('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>400 Bad Request</title></head><body><h1>Bad Request</h1><p>The form contained characters we cannot accept. Please go back and try again.</p><p><a href="/somatic-studios/">Back to Free Services For Studios</a></p></body></html>');
}

$name = af_form_line($_POST['name'] ?? null);
$email = af_form_line($_POST['email'] ?? null);
$studio = af_form_line($_POST['studio'] ?? null);
$website = af_form_line($_POST['website'] ?? null);
$location = af_form_line($_POST['location'] ?? null);
$practice = af_form_line($_POST['practice'] ?? null);
$help = af_form_line($_POST['help'] ?? null);
$message = af_form_text($_POST['message'] ?? null);
$consentListing = ($_POST['consent_listing'] ?? '') === 'yes';
$consentUpdates = ($_POST['consent_updates'] ?? '') === 'yes';

// --- Rate limiting (same fixed-window limiter as contact-handler.php) ---
function studio_rate_limited(string $ip, int $maxRequests = 5, int $windowSeconds = 600): bool
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

if (studio_rate_limited(studio_client_ip())) {
    http_response_code(429);
    header('Retry-After: 600');
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">';
    echo '<title>429 Too Many Requests</title></head><body>';
    echo '<h1>Too Many Requests</h1>';
    echo '<p>You have submitted this form too many times. Please wait a few minutes and try again.</p>';
    echo '<p><a href="/somatic-studios/">Back to Free Services For Studios</a></p>';
    echo '</body></html>';
    exit;
}

// Honeypot — real users never see the fax field; bots fill it
$honeypot = trim($_POST['fax'] ?? '');
if ($honeypot !== '') {
    // Pretend success so bots don't retry
    header('Location: ' . $SUCCESS_URL);
    exit;
}

// --- Turnstile CAPTCHA verification (same fail-open semantics as
// contact-handler.php — a no-op until TURNSTILE_SECRET_KEY is configured) ---
function studio_verify_turnstile(string $token, string $remoteIp): bool
{
    if (!defined('TURNSTILE_SECRET_KEY') || TURNSTILE_SECRET_KEY === '') {
        error_log('studio-review-handler.php: TURNSTILE_SECRET_KEY is empty — skipping Turnstile verification (fail-open). Captcha is not configured for this deployment.');
        return true;
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
        error_log('studio-review-handler.php: Turnstile siteverify call failed http=' . (int) $code);
        return false;
    }
    $data = json_decode($resp, true);
    return is_array($data) && ($data['success'] ?? false) === true;
}

$turnstileToken = trim($_POST['cf-turnstile-response'] ?? '');
if (!studio_verify_turnstile($turnstileToken, studio_client_ip())) {
    redirect_with_error('CAPTCHA verification failed. Please try again.');
}

// --- Validation ---
$errors = [];

if ($name === '') {
    $errors[] = 'Name is required.';
}
if ($email === '') {
    $errors[] = 'Email is required.';
} elseif (af_reply_to_address($email) === null) {
    $errors[] = 'Please enter a valid email address.';
}
if ($website !== '' && !filter_var($website, FILTER_VALIDATE_URL)) {
    $errors[] = 'Please enter a valid website URL (including https://).';
}
$errors = array_merge($errors, af_form_too_long(
    ['name' => $name, 'email' => $email, 'studio' => $studio, 'website' => $website, 'location' => $location,
     'practice' => $practice, 'help' => $help, 'message' => $message],
    ['name' => 'Name', 'email' => 'Email', 'studio' => 'Studio', 'website' => 'Website', 'location' => 'Location',
     'practice' => 'Practice type', 'help' => 'Help wanted', 'message' => 'Message']
));

if (count($errors) > 0) {
    redirect_with_error(implode(' ', $errors));
}

// --- Build email ---
$subject = 'Studio Visibility Review request: ' . ($studio !== '' ? $studio : $name);

$body = "New Studio Visibility Review request from aikifield.com/somatic-studios/:\n\n";
$body .= "Name: " . $name . "\n";
$body .= "Email: " . $email . "\n";
if ($studio !== '') {
    $body .= "Studio: " . $studio . "\n";
}
if ($website !== '') {
    $body .= "Website: " . $website . "\n";
}
if ($location !== '') {
    $body .= "Location: " . $location . "\n";
}
if ($practice !== '') {
    $body .= "Practice type: " . $practice . "\n";
}
if ($help !== '') {
    $body .= "Wants help with: " . $help . "\n";
}
$body .= "World Studio Finder listing consent: " . ($consentListing ? 'yes' : 'no') . "\n";
$body .= "Occasional resources consent: " . ($consentUpdates ? 'yes' : 'no') . "\n";
if ($message !== '') {
    $body .= "\nMessage:\n" . $message . "\n";
}
$body .= "\n---\n";
$body .= "Submitted: " . date('Y-m-d H:i:s') . " (server time)\n";
$clientIpForLog = studio_client_ip();
$body .= "IP: " . ($clientIpForLog !== '' ? $clientIpForLog : 'unknown') . "\n";

// Reply-To is the bare, validated address (see contact-handler.php).
$headers = [
    'From: AikiField Contact <' . $FROM_EMAIL . '>',
    'Reply-To: ' . af_reply_to_address($email),
    'MIME-Version: 1.0',
    'X-Mailer: PHP/' . phpversion(),
    'Content-Type: text/plain; charset=UTF-8',
];

// --- Send ---
if ($IS_STAGING) {
    // No-op on staging — same convention as contact-handler.php.
    error_log(sprintf(
        'STAGING studio-review-handler: no-op, would have emailed %s — name=%s email=%s studio=%s',
        $RECIPIENT_EMAIL,
        $name,
        $email,
        $studio !== '' ? $studio : '(none)'
    ));
    header('Location: ' . $SUCCESS_URL);
    exit;
}

$sent = mail($RECIPIENT_EMAIL, af_mime_subject($subject), $body, implode("\r\n", $headers));

if ($sent) {
    header('Location: ' . $SUCCESS_URL);
    exit;
}

error_log('AikiField studio review form: mail() returned false for submission from ' . $email);
redirect_with_error('There was a problem sending your request.');
