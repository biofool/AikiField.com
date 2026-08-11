<?php
/**
 * Cloudflare edge IP ranges.
 *
 * Used by coach-proxy.php to verify that a request's REMOTE_ADDR (the real,
 * unspoofable TCP peer) is actually Cloudflare before trusting any
 * client-supplied CF-Connecting-IP / X-Forwarded-For header — a request that
 * bypasses Cloudflare and hits the origin directly can set those headers to
 * anything, which would otherwise defeat the backend's IP-based rate
 * limiting on auth endpoints.
 *
 * Source: https://www.cloudflare.com/ips-v4/ and https://www.cloudflare.com/ips-v6/
 * Snapshot taken: 2026-08-11. Cloudflare changes this list occasionally
 * (rarely, but it happens) — re-fetch both URLs and update the two arrays
 * below periodically (e.g. quarterly), or if Cloudflare-origin traffic
 * starts getting misclassified as non-Cloudflare.
 *
 * Run `php scripts/verify-cloudflare-ips.php` to check these are still
 * current against Cloudflare's live lists; it's wired into sync.sh as a
 * pre-deploy check right alongside the php -l lint gate.
 */

const QA_CLOUDFLARE_IPV4_RANGES = [
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
];

const QA_CLOUDFLARE_IPV6_RANGES = [
    '2400:cb00::/32',
    '2606:4700::/32',
    '2803:f800::/32',
    '2405:b500::/32',
    '2405:8100::/32',
    '2a06:98c0::/29',
    '2c0f:f248::/32',
];

/**
 * True when $ip falls inside the CIDR block $cidr. Works for both IPv4 and
 * IPv6 (the two never match each other's ranges).
 */
function qa_ip_in_cidr(string $ip, string $cidr): bool
{
    if (!str_contains($cidr, '/')) {
        return false;
    }
    [$subnet, $maskBitsRaw] = explode('/', $cidr, 2);
    if (!ctype_digit($maskBitsRaw)) {
        return false;
    }
    $maskBits = (int) $maskBitsRaw;

    $ipBin = @inet_pton($ip);
    $subnetBin = @inet_pton($subnet);
    if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
        // Unparsable address, or an IPv4 address compared against an IPv6
        // range (or vice versa) — never a match.
        return false;
    }

    $maxBits = strlen($ipBin) * 8;
    if ($maskBits < 0 || $maskBits > $maxBits) {
        return false;
    }

    $fullBytes = intdiv($maskBits, 8);
    if ($fullBytes > 0 && substr($ipBin, 0, $fullBytes) !== substr($subnetBin, 0, $fullBytes)) {
        return false;
    }

    $remainderBits = $maskBits % 8;
    if ($remainderBits === 0) {
        return true;
    }

    $mask = chr((0xFF << (8 - $remainderBits)) & 0xFF);
    return (substr($ipBin, $fullBytes, 1) & $mask) === (substr($subnetBin, $fullBytes, 1) & $mask);
}

/**
 * True when $ip (a REMOTE_ADDR-style address, e.g. "198.51.100.7") is a
 * genuine Cloudflare edge IP per the ranges above. Only when this returns
 * true is it safe to trust a client-supplied CF-Connecting-IP /
 * X-Forwarded-For header for that request.
 */
function qa_is_cloudflare_ip(string $ip): bool
{
    if ($ip === '') {
        return false;
    }
    // Some dual-stack server configurations report an IPv4 peer's
    // REMOTE_ADDR in IPv4-mapped-IPv6 form (e.g. "::ffff:173.245.48.1")
    // rather than plain dotted-quad. inet_pton() on that form produces a
    // 16-byte address that never matches our 4-byte IPv4 CIDRs, which would
    // otherwise misclassify a genuine Cloudflare edge IP as untrusted.
    // Unwrap it to the embedded IPv4 address before matching so both forms
    // are recognized; this can only make detection more accurate (an
    // address that isn't really IPv4-mapped is left untouched), it can
    // never turn a non-Cloudflare address into a false positive.
    if (stripos($ip, '::ffff:') === 0) {
        $embedded = substr($ip, 7);
        if (filter_var($embedded, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $ip = $embedded;
        }
    }
    foreach (QA_CLOUDFLARE_IPV4_RANGES as $cidr) {
        if (qa_ip_in_cidr($ip, $cidr)) {
            return true;
        }
    }
    foreach (QA_CLOUDFLARE_IPV6_RANGES as $cidr) {
        if (qa_ip_in_cidr($ip, $cidr)) {
            return true;
        }
    }
    return false;
}
