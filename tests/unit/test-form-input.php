<?php
declare(strict_types=1);

/**
 * Unit tests for includes/form-input.php (AF #125).
 *
 *   php tests/unit/test-form-input.php
 *
 * The HTTP-level behaviour of the two handlers (one Reply-To address, 400 on
 * NUL, encoded Subject, length refusal) is covered by
 * tests/e2e/specs/forms.spec.js with a capturing sendmail.
 */

require __DIR__ . '/../../includes/form-input.php';

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

// ── Reply-To: one bare address, never a name or a second recipient ────────────
check('plain address', af_reply_to_address('mallory@evil.example') === 'mallory@evil.example');
check('surrounding space is trimmed', af_reply_to_address("  a@b.co \n") === 'a@b.co');
foreach ([
    'display name and angle brackets' => 'Kenneth <ceo@aikifield.com>',
    'two recipients' => 'a@b.co, c@d.co',
    'name + comma + second address' => 'Kenneth <ceo@aikifield.com>, Mallory <mallory@evil.example>',
    'quoted local part' => '"a b"@example.com',
    'CRLF header injection' => "a@b.co\r\nBcc: x@y.zz",
    'empty' => '',
    'no domain dot' => 'a@localhost',
    'too long' => str_repeat('a', 250) . '@b.co',
] as $label => $bad) {
    check("Reply-To refuses $label", af_reply_to_address($bad) === null);
}

// ── Single-line fields ───────────────────────────────────────────────────────
check('CRLF + Bcc becomes spaces', af_form_line("Kenneth\r\nBcc: x@y.zz") === 'Kenneth Bcc: x@y.zz');
check('TAB and runs of space collapse', af_form_line("a\t\t  b") === 'a b');
check('NUL, DEL and other controls become spaces', af_form_line("a\0b\x07c\x7fd") === 'a b c d');
check('array input is empty, not an error', af_form_line(['x']) === '');
check('null input is empty', af_form_line(null) === '');
check('UTF-8 text is kept', af_form_line("  Zen Dōjō ") === 'Zen Dōjō');

// ── Multi-line fields ────────────────────────────────────────────────────────
check('newlines and tabs stay, CRLF -> LF', af_form_text("l1\r\nl2\tx") === "l1\nl2\tx");
check('other controls are dropped', af_form_text("a\x07b\x0bc\x7fd") === 'abcd');
check('array input is empty', af_form_text(['x']) === '');

// ── NUL detection (the handlers answer 400) ──────────────────────────────────
check('NUL in a field', af_form_has_nul(['name' => "a\0b"]) === true);
check('NUL in a nested array value', af_form_has_nul(['name' => ['x' => "a\0"]]) === true);
check('no NUL', af_form_has_nul(['name' => 'a', 'n' => 3]) === false);

// ── Length limits ────────────────────────────────────────────────────────────
$errors = af_form_too_long(['name' => str_repeat('a', 101), 'message' => 'ok'], ['name' => 'Name']);
check('over-long name is reported', $errors === ['Name is too long (at most 100 characters).'], json_encode($errors));
check('a value at the limit passes', af_form_too_long(['name' => str_repeat('a', 100)], []) === []);
check('limit counts characters, not bytes', af_form_too_long(['name' => str_repeat('é', 100)], []) === []);
check('unknown keys have no limit', af_form_too_long(['zzz' => str_repeat('a', 99999)], []) === []);

// ── Subject encoding ─────────────────────────────────────────────────────────
check('ASCII subject is unchanged', af_mime_subject('Studio Visibility Review request: Acme') === 'Studio Visibility Review request: Acme');
$enc = af_mime_subject('Studio request: Zen Dōjō');
check('non-ASCII subject is an RFC 2047 word', preg_match('/=\?UTF-8\?B\?[A-Za-z0-9+\/=]+\?=/', $enc) === 1, $enc);
check('encoded subject has only ASCII', preg_match('/^[\x20-\x7e\r\n]*$/', $enc) === 1, $enc);
$decoded = iconv_mime_decode('Subject: ' . $enc, 0, 'UTF-8');
check('encoded subject decodes to the original', $decoded === 'Subject: Studio request: Zen Dōjō', (string) $decoded);
check('subject is capped', af_form_length(af_mime_subject(str_repeat('x', 500))) === AF_MAIL_SUBJECT_MAX);
check('CRLF in a subject cannot start a header', !str_contains(af_mime_subject("a\r\nBcc: x@y.zz"), "\n"));

exit($failures === 0 ? 0 : 1);
