<?php
/**
 * Standalone unit tests for the Cloudflare-IP-trust decision logic in
 * includes/cloudflare-ips.php (qa_is_cloudflare_ip() and
 * qa_resolve_client_ip_headers(), which coach-proxy.php calls to decide
 * whether to forward the client's CF-Connecting-IP / X-Forwarded-For
 * headers as-is, or overwrite them with the real REMOTE_ADDR).
 *
 * This repo has no PHP unit-test framework (no phpunit/pest — confirmed by
 * a full tree search), and the Playwright e2e suite (tests/e2e/) cannot
 * exercise the "genuine Cloudflare IP" branch: it always drives the PHP
 * built-in server over loopback, so $_SERVER['REMOTE_ADDR'] there is always
 * 127.0.0.1/::1 and can never be a real Cloudflare edge IP. This script
 * fills that gap by calling the decision functions directly with synthetic
 * REMOTE_ADDR / header values — no HTTP request, no server, no framework.
 *
 * Usage:
 *   php tests/unit/test-cloudflare-ip-trust.php
 *
 * Exit code 0 = all assertions passed.
 * Exit code 1 = at least one failure (printed to stderr with the case name
 * and expected/actual values).
 */

declare(strict_types=1);

require __DIR__ . '/../../includes/cloudflare-ips.php';

$failures = 0;
$passed = 0;

/**
 * @param mixed $expected
 * @param mixed $actual
 */
function qa_check(string $label, $expected, $actual): void
{
    global $failures, $passed;
    if ($expected === $actual) {
        $passed++;
        echo "PASS: $label\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $label\n");
    fwrite(STDERR, '  expected: ' . var_export($expected, true) . "\n");
    fwrite(STDERR, '  actual:   ' . var_export($actual, true) . "\n");
}

// ---------------------------------------------------------------------
// qa_is_cloudflare_ip() — is a given REMOTE_ADDR a genuine Cloudflare edge IP?
// ---------------------------------------------------------------------

// Genuine Cloudflare IP, picked from inside a vendored CIDR range
// (173.245.48.0/20 covers 173.245.48.0 - 173.245.63.255).
qa_check(
    'genuine Cloudflare IPv4 (173.245.48.1, inside 173.245.48.0/20) is recognized',
    true,
    qa_is_cloudflare_ip('173.245.48.1')
);

// Genuine Cloudflare IPv6, inside 2606:4700::/32.
qa_check(
    'genuine Cloudflare IPv6 (2606:4700::1, inside 2606:4700::/32) is recognized',
    true,
    qa_is_cloudflare_ip('2606:4700::1')
);

// A real public IP well outside every vendored range (Google public DNS).
qa_check(
    'non-Cloudflare public IP (8.8.8.8) is rejected',
    false,
    qa_is_cloudflare_ip('8.8.8.8')
);

// Loopback — what the Playwright e2e harness always sees.
qa_check(
    'loopback (127.0.0.1) is rejected',
    false,
    qa_is_cloudflare_ip('127.0.0.1')
);

// The IPv4-mapped-IPv6 edge case fixed earlier this session: a dual-stack
// REMOTE_ADDR like "::ffff:173.245.48.1" must still resolve to the embedded
// IPv4 address and be recognized as Cloudflare.
qa_check(
    'IPv4-mapped IPv6 form of a genuine Cloudflare IP (::ffff:173.245.48.1) is recognized',
    true,
    qa_is_cloudflare_ip('::ffff:173.245.48.1')
);

// Same unwrap path, but the embedded address is loopback — must remain
// non-Cloudflare (the unwrap must not turn into a blanket "trust IPv4-mapped
// forms" bug).
qa_check(
    'IPv4-mapped IPv6 form of loopback (::ffff:127.0.0.1) is still rejected',
    false,
    qa_is_cloudflare_ip('::ffff:127.0.0.1')
);

// Fail-closed cases: malformed/empty input must never be treated as
// Cloudflare.
qa_check(
    'empty REMOTE_ADDR fails closed (not Cloudflare)',
    false,
    qa_is_cloudflare_ip('')
);

qa_check(
    'malformed REMOTE_ADDR ("not-an-ip") fails closed (not Cloudflare)',
    false,
    qa_is_cloudflare_ip('not-an-ip')
);

qa_check(
    'malformed REMOTE_ADDR ("999.999.999.999", out-of-range octets) fails closed (not Cloudflare)',
    false,
    qa_is_cloudflare_ip('999.999.999.999')
);

// ---------------------------------------------------------------------
// qa_resolve_client_ip_headers() — the actual coach-proxy.php decision:
// what headers get forwarded to the backend.
// ---------------------------------------------------------------------

// Genuine Cloudflare peer: trust and forward the client-supplied values
// as-is (these are the values Cloudflare itself attached).
qa_check(
    'genuine Cloudflare peer: client CF-Connecting-IP/X-Forwarded-For are forwarded as-is',
    ['CF-Connecting-IP' => '203.0.113.9', 'X-Forwarded-For' => '203.0.113.9, 173.245.48.1'],
    qa_resolve_client_ip_headers('173.245.48.1', '203.0.113.9', '203.0.113.9, 173.245.48.1')
);

// Same, but REMOTE_ADDR arrives in IPv4-mapped-IPv6 form — must still be
// recognized as Cloudflare and still forward the client headers as-is.
qa_check(
    'genuine Cloudflare peer via IPv4-mapped IPv6 REMOTE_ADDR still forwards client headers as-is',
    ['CF-Connecting-IP' => '203.0.113.9', 'X-Forwarded-For' => '203.0.113.9'],
    qa_resolve_client_ip_headers('::ffff:173.245.48.1', '203.0.113.9', '203.0.113.9')
);

// Genuine Cloudflare peer that omitted CF-Connecting-IP: must not invent a
// header the client never sent.
qa_check(
    'genuine Cloudflare peer that omitted CF-Connecting-IP: header is not invented',
    ['X-Forwarded-For' => '203.0.113.9'],
    qa_resolve_client_ip_headers('173.245.48.1', null, '203.0.113.9')
);

// Non-Cloudflare REMOTE_ADDR: client-supplied (spoofable) values are
// ignored entirely; both headers are overwritten with REMOTE_ADDR.
qa_check(
    'non-Cloudflare peer (8.8.8.8): client-supplied headers are ignored, REMOTE_ADDR used instead',
    ['CF-Connecting-IP' => '8.8.8.8', 'X-Forwarded-For' => '8.8.8.8'],
    qa_resolve_client_ip_headers('8.8.8.8', '1.2.3.4 (spoofed)', '1.2.3.4 (spoofed)')
);

// Loopback peer (direct-to-origin request, and what the Playwright e2e
// harness always sees): headers overwritten with REMOTE_ADDR, ignoring the
// spoofed client values.
qa_check(
    'loopback peer (direct-to-origin / e2e harness): headers overwritten with REMOTE_ADDR',
    ['CF-Connecting-IP' => '127.0.0.1', 'X-Forwarded-For' => '127.0.0.1'],
    qa_resolve_client_ip_headers('127.0.0.1', '9.9.9.9 (spoofed)', '9.9.9.9 (spoofed)')
);

// Malformed/empty REMOTE_ADDR fails closed: still overwrites with the
// (malformed/empty) REMOTE_ADDR rather than falling back to trusting the
// client-supplied values.
qa_check(
    'empty REMOTE_ADDR fails closed: still overwrites rather than trusting client headers',
    ['CF-Connecting-IP' => '', 'X-Forwarded-For' => ''],
    qa_resolve_client_ip_headers('', '1.2.3.4 (spoofed)', '1.2.3.4 (spoofed)')
);

qa_check(
    'malformed REMOTE_ADDR fails closed: still overwrites rather than trusting client headers',
    ['CF-Connecting-IP' => 'not-an-ip', 'X-Forwarded-For' => 'not-an-ip'],
    qa_resolve_client_ip_headers('not-an-ip', '1.2.3.4 (spoofed)', '1.2.3.4 (spoofed)')
);

echo "\n$passed passed, $failures failed.\n";
exit($failures === 0 ? 0 : 1);
