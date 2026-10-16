<?php
declare(strict_types=1);

/**
 * Signed visitor address for the backend's rate limiter (AIR#943).
 *
 * Every request AikiField sends to the coach backend (coach-proxy.php, the
 * server-side game calls, the session checks in login.php and the gate) comes
 * from this PHP host. The backend therefore saw one address for every
 * visitor, so its per-IP limits (18 auth requests a minute, 60 chat requests
 * a minute) acted as site-wide limits. The backend cannot trust a plain
 * "client IP" header, so this file signs the visitor address with the proxy
 * secret both sides already share:
 *
 *   X-AF-Client-IP:  <visitor address>
 *   X-AF-Client-Ts:  <unix seconds>
 *   X-AF-Client-Sig: hex(HMAC-SHA256(proxy secret, "<ip>|<ts>"))
 *
 * The backend uses the address only when the proxy secret header is valid,
 * the signature matches and the timestamp is within 300 seconds. Older
 * backends ignore the headers, so AikiField can deploy before or after AIR.
 *
 * The visitor address is the one the Cloudflare trust check already picks
 * (see qa_resolve_client_ip_headers() in cloudflare-ips.php): the
 * CF-Connecting-IP value when REMOTE_ADDR is a genuine Cloudflare edge,
 * otherwise REMOTE_ADDR itself. A client-supplied header is never signed
 * unless that trust check passed.
 *
 * Pure functions (no I/O except qa_signed_client_ip_headers(), which reads
 * $_SERVER) so tests/unit/test-client-ip-signing.php can call them directly.
 */

require_once __DIR__ . '/cloudflare-ips.php';

/**
 * The visitor address to sign, or null when no valid address is available.
 */
function qa_visitor_ip(string $remoteAddr, ?string $clientCfConnectingIp, ?string $clientXForwardedFor): ?string
{
    $resolved = qa_resolve_client_ip_headers($remoteAddr, $clientCfConnectingIp, $clientXForwardedFor);
    $candidates = [];
    if (isset($resolved['CF-Connecting-IP'])) {
        $candidates[] = $resolved['CF-Connecting-IP'];
    }
    if (isset($resolved['X-Forwarded-For'])) {
        $candidates[] = explode(',', $resolved['X-Forwarded-For'])[0];
    }
    $candidates[] = $remoteAddr;
    foreach ($candidates as $candidate) {
        $candidate = trim($candidate);
        if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP) !== false) {
            return $candidate;
        }
    }
    return null;
}

/**
 * "Name: value" header lines for a signed visitor address. Empty when there
 * is no address or no secret (nothing to sign with).
 *
 * @return list<string>
 */
function qa_client_ip_signature_headers(?string $ip, string $secret, int $now): array
{
    if ($ip === null || $secret === '') {
        return [];
    }
    $ts = (string) $now;
    return [
        'X-AF-Client-IP: ' . $ip,
        'X-AF-Client-Ts: ' . $ts,
        'X-AF-Client-Sig: ' . hash_hmac('sha256', $ip . '|' . $ts, $secret),
    ];
}

/**
 * The signed headers for the current request, read from $_SERVER.
 *
 * @return list<string>
 */
function qa_signed_client_ip_headers(string $secret): array
{
    $ip = qa_visitor_ip(
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? (string) $_SERVER['HTTP_CF_CONNECTING_IP'] : null,
        isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? (string) $_SERVER['HTTP_X_FORWARDED_FOR'] : null
    );
    if ($ip === null && $secret !== '' && PHP_SAPI !== 'cli') {
        error_log('client-ip-signing: no valid visitor address (REMOTE_ADDR='
            . substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64) . '); sending the request unsigned');
    }
    return qa_client_ip_signature_headers($ip, $secret, time());
}
