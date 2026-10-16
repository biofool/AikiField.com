<?php
declare(strict_types=1);

/**
 * Unit tests for includes/client-ip-signing.php (AIR#943).
 *
 *   php tests/unit/test-client-ip-signing.php
 *
 * Exits non-zero on the first failure.
 */

require __DIR__ . '/../../includes/client-ip-signing.php';

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

// ── The signature algorithm is a cross-repo contract ────────────────────────
// AIRichardMoon verifies hex(HMAC-SHA256(secret, "<ip>|<ts>")); keep the
// vectors below equal to the ones in AIR's tests (AIR#943).
$secret = 'test-proxy-secret';
$headers = qa_client_ip_signature_headers('203.0.113.7', $secret, 1700000000);
check('three headers', count($headers) === 3, json_encode($headers));
check('IP header', ($headers[0] ?? '') === 'X-AF-Client-IP: 203.0.113.7');
check('timestamp header', ($headers[1] ?? '') === 'X-AF-Client-Ts: 1700000000');
check(
    'signature matches the shared vector',
    ($headers[2] ?? '') === 'X-AF-Client-Sig: ' . hash_hmac('sha256', '203.0.113.7|1700000000', $secret)
);
// Computed independently with Python: hmac.new(b"test-proxy-secret",
// b"203.0.113.7|1700000000", sha256).hexdigest(). A literal, so a change to
// the message format cannot pass by accident.
check(
    'signature equals the independently computed vector',
    ($headers[2] ?? '') === 'X-AF-Client-Sig: 433c60b33fd31c54a34b208a2651de3ad8a5456cfea53d7c742461bb637993f6'
);

// Nothing to sign with → no headers (the backend then falls back to its own logic).
check('no secret → no headers', qa_client_ip_signature_headers('203.0.113.7', '', 1700000000) === []);
check('no address → no headers', qa_client_ip_signature_headers(null, $secret, 1700000000) === []);

// ── Which address is signed ─────────────────────────────────────────────────
// Direct to the origin (REMOTE_ADDR is not Cloudflare): the headers a client
// sent are ignored, REMOTE_ADDR wins.
check(
    'direct visitor: REMOTE_ADDR, forged headers ignored',
    qa_visitor_ip('198.51.100.20', '6.6.6.6', '7.7.7.7, 8.8.8.8') === '198.51.100.20'
);
// Through Cloudflare (REMOTE_ADDR is an edge address): CF-Connecting-IP wins.
check(
    'via Cloudflare: CF-Connecting-IP',
    qa_visitor_ip('173.245.48.10', '203.0.113.9', '203.0.113.9') === '203.0.113.9'
);
check(
    'via Cloudflare without CF-Connecting-IP: first X-Forwarded-For entry',
    qa_visitor_ip('173.245.48.10', null, '203.0.113.9, 173.245.48.10') === '203.0.113.9'
);
check(
    'via Cloudflare with a garbage CF-Connecting-IP: falls through to X-Forwarded-For',
    qa_visitor_ip('173.245.48.10', 'not-an-ip', '203.0.113.9') === '203.0.113.9'
);
check('IPv6 visitor', qa_visitor_ip('2001:db8::7', null, null) === '2001:db8::7');
check('nothing valid → null', qa_visitor_ip('', null, null) === null);
check('garbage REMOTE_ADDR → null', qa_visitor_ip('not-an-ip', null, null) === null);

exit($failures === 0 ? 0 : 1);
