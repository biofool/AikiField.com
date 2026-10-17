<?php
declare(strict_types=1);

/**
 * Input hygiene for the public mail forms (contact-handler.php,
 * studio-review-handler.php) — AF #125.
 *
 * Everything a visitor types ends up in an email: some of it in a header
 * (Reply-To, Subject), the rest in the body. The handlers used to strip only
 * CR and LF, which left four holes:
 *
 *   1. The visitor's name went into `Reply-To: Name <address>`. A name such as
 *      `Kenneth <ceo@aikifield.com>, Mallory` made the owner's reply go to
 *      the attacker as well. Only the validated address goes into Reply-To now.
 *   2. A NUL byte made mail() throw a ValueError (HTTP 500). NUL is refused
 *      with a 400 now.
 *   3. A non-ASCII Subject was sent as raw 8-bit text. It is RFC 2047 encoded.
 *   4. No field had a length cap. Each field has a limit now, and a longer
 *      value is refused with a message rather than cut off silently.
 *
 * Pure functions (no I/O) so tests/unit/test-form-input.php can call them.
 */

/** Longest accepted value per field, in characters. One place for every form. */
const AF_FORM_LIMITS = [
    'name'         => 100,
    'email'        => 254,
    'organization' => 150,
    'interest'     => 100,
    'studio'       => 150,
    'website'      => 300,
    'location'     => 150,
    'practice'     => 100,
    'help'         => 200,
    'message'      => 5000,
];

/** Longest subject text we build, in characters (before encoding). */
const AF_MAIL_SUBJECT_MAX = 120;

/**
 * True when any submitted value contains a NUL byte. NUL has no legitimate use
 * in a form and breaks mail(); the handler answers 400.
 *
 * @param array<mixed> $post
 */
function af_form_has_nul(array $post): bool
{
    foreach ($post as $value) {
        if (is_array($value) ? af_form_has_nul($value) : (is_string($value) && str_contains($value, "\0"))) {
            return true;
        }
    }
    return false;
}

/**
 * A single-line text field: only a string counts (an array such as `name[]=x`
 * gives ''), every C0 control character and DEL becomes a space, runs of
 * whitespace collapse, and the result is trimmed.
 *
 * @param mixed $value
 */
function af_form_line($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $clean = (string) preg_replace('/[\x00-\x1f\x7f]+/', ' ', $value);
    return trim((string) preg_replace('/\s{2,}/', ' ', $clean));
}

/**
 * A multi-line text field: newlines and tabs stay, CRLF becomes LF, every
 * other control character is dropped.
 *
 * @param mixed $value
 */
function af_form_text($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $clean = str_replace(["\r\n", "\r"], "\n", $value);
    return trim((string) preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', '', $clean));
}

/** Length in characters (UTF-8); falls back to bytes when mbstring is missing. */
function af_form_length(string $value): int
{
    if (function_exists('mb_strlen')) {
        $len = @mb_strlen($value, 'UTF-8');
        return $len === false ? strlen($value) : $len;
    }
    return strlen($value);
}

/**
 * The fields (by key) whose value is longer than its limit, as a list of
 * human-readable messages. Empty when everything fits.
 *
 * @param array<string,string> $fields   key => cleaned value
 * @param array<string,string> $labels   key => label shown to the visitor
 * @return list<string>
 */
function af_form_too_long(array $fields, array $labels): array
{
    $errors = [];
    foreach ($fields as $key => $value) {
        $limit = AF_FORM_LIMITS[$key] ?? null;
        if ($limit !== null && af_form_length($value) > $limit) {
            $errors[] = ($labels[$key] ?? $key) . ' is too long (at most ' . $limit . ' characters).';
        }
    }
    return $errors;
}

/**
 * The value for a `Reply-To:` header: the bare address, or null when the
 * address is not safe to put in a header. No display name, no comma, no angle
 * bracket, nothing a mail client could read as a second recipient.
 */
function af_reply_to_address(string $email): ?string
{
    $email = trim($email);
    if ($email === '' || strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return null;
    }
    // FILTER_VALIDATE_EMAIL also accepts quoted local parts and comments;
    // none of that belongs in a header we build from visitor input.
    if (preg_match('/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/', $email) !== 1) {
        return null;
    }
    return $email;
}

/**
 * A Subject header value. Plain ASCII passes through (single line, capped);
 * anything else becomes an RFC 2047 encoded word, so a studio called "Zen
 * Dōjō" arrives readable instead of as raw 8-bit bytes.
 */
function af_mime_subject(string $subject): string
{
    $subject = af_form_line($subject);
    if (af_form_length($subject) > AF_MAIL_SUBJECT_MAX) {
        $subject = function_exists('mb_substr')
            ? mb_substr($subject, 0, AF_MAIL_SUBJECT_MAX, 'UTF-8')
            : substr($subject, 0, AF_MAIL_SUBJECT_MAX);
    }
    if (preg_match('/^[\x20-\x7e]*$/', $subject) === 1) {
        return $subject;
    }
    if (function_exists('mb_encode_mimeheader')) {
        // The 4th argument is the line break used between encoded words.
        return mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n ");
    }
    error_log('form-input: mbstring is missing; encoding the Subject as one RFC 2047 word');
    return '=?UTF-8?B?' . base64_encode($subject) . '?=';
}
