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
$name = trim($_POST['name'] ?? '');
$email = trim($_POST['email'] ?? '');
$organization = trim($_POST['organization'] ?? '');
$interest = trim($_POST['interest'] ?? '');
$message = trim($_POST['message'] ?? '');

// Honeypot field — if filled, it's a bot
$honeypot = trim($_POST['website'] ?? '');
if ($honeypot !== '') {
    // Pretend success so bots don't retry
    redirect_with_status('success');
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
$sent = mail($RECIPIENT_EMAIL, $subject, $body, implode("\r\n", $headers));

if ($sent) {
    redirect_with_status('success');
} else {
    error_log('AikiField contact form: mail() returned false for submission from ' . $email);
    redirect_with_status('error', 'There was a problem sending your message.');
}
