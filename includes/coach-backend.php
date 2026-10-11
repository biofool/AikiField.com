<?php
declare(strict_types=1);

/**
 * Server-side POST to the AI Chat backend (AIRichardMoon) as the signed-in
 * member — used by the Digital Experience game endpoints
 * (games/ai-coach.php, games/results.php). Sends the member's session from
 * the PHP session (X-Auth-Email / X-Auth-Session, never exposed to the page),
 * the proxy secret, and the Cloudflare-verified client IP headers, exactly as
 * coach-proxy.php does for browser traffic.
 *
 * Requires includes/coach-config.load.php (COACH_*) and
 * includes/cloudflare-ips.php (qa_resolve_client_ip_headers) to be loaded.
 *
 * Returns ['code' => int (0 on transport error), 'data' => array|null,
 *          'error' => string (transport error text, '' otherwise)].
 */
function af_backend_post(string $path, array $body, string $email, string $sessionToken, ?int $timeout = null): array
{
    $headers = [
        'Content-Type: application/json',
        'X-Auth-Email: ' . $email,
        'X-Auth-Session: ' . $sessionToken,
    ];
    if (COACH_PROXY_SECRET !== '') {
        $headers[] = 'X-Proxy-Secret: ' . COACH_PROXY_SECRET;
    }
    foreach (qa_resolve_client_ip_headers(
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? (string) $_SERVER['HTTP_CF_CONNECTING_IP'] : null,
        isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? (string) $_SERVER['HTTP_X_FORWARDED_FOR'] : null
    ) as $name => $value) {
        $headers[] = "$name: $value";
    }

    $ch = curl_init(rtrim(COACH_BACKEND_URL, '/') . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout ?? COACH_TIMEOUT,
        CURLOPT_SSL_VERIFYPEER => COACH_VERIFY_TLS,
        CURLOPT_SSL_VERIFYHOST => COACH_VERIFY_TLS ? 2 : 0,
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = $resp === false ? curl_error($ch) : '';
    curl_close($ch);
    $data = $resp === false ? null : json_decode((string) $resp, true);
    return ['code' => $resp === false ? 0 : $code, 'data' => is_array($data) ? $data : null, 'error' => $err];
}
