<?php
/**
 * Standalone unit tests for CloudflareLogsScanner::classifyError()
 * (CloudManagement#111). Payloads are real Cloudflare error shapes seen in
 * the 2026-10-09 credential audit. No HTTP calls, no framework.
 *
 * Usage:
 *   php tests/unit/test-cloudflare-logs-classify.php
 *
 * Exit code 0 = all assertions passed, 1 = at least one failure.
 */

declare(strict_types=1);

require __DIR__ . '/../../includes/cloudflare-logs.class.php';

$failures = 0;
$passed = 0;

function cf_check(string $label, string $expected, array $diag): void
{
    global $failures, $passed;
    if ($diag['category'] === $expected) {
        $passed++;
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL $label: expected $expected, got {$diag['category']}\n");
}

function cf_err(int $code, string $message): array
{
    return ['success' => false, 'errors' => [['code' => $code, 'message' => $message]]];
}

$c = fn(int $s, ?array $b) => CloudflareLogsScanner::classifyError($s, $b);

cf_check('ip filter', 'ip_blocked', $c(403, cf_err(9109, 'Cannot use the access token from location: 104.28.219.9')));
cf_check('account token on /user', 'wrong_token_type', $c(403, cf_err(9109, 'Valid user-level authentication not found')));
cf_check('9109 unauthorized', 'missing_scope', $c(403, cf_err(9109, 'Unauthorized to access requested resource')));
cf_check('10000 at 401', 'missing_scope', $c(401, cf_err(10000, 'Authentication error')));
cf_check('invalid token', 'invalid_token', $c(401, cf_err(1000, 'Invalid API Token')));
cf_check('malformed header', 'invalid_token', $c(400, cf_err(6111, 'Invalid format for Authorization header')));
cf_check('graphql 200 errors', 'graphql_error', $c(200, ['data' => null, 'errors' => [['message' => 'x']]]));
cf_check('network', 'network_error', $c(0, ['errors' => [['message' => 'cURL error: timeout']]]));
cf_check('rate limit', 'rate_limited', $c(429, null));
cf_check('server', 'server_error', $c(502, null));

$ip = $c(403, cf_err(9109, 'Cannot use the access token from location: 104.28.219.9'));
if (str_contains($ip['hint'], '104.28.219.9')) {
    $passed++;
} else {
    $failures++;
    fwrite(STDERR, "FAIL ip hint does not name the rejected address\n");
}

echo "$passed passed, $failures failed\n";
exit($failures > 0 ? 1 : 0);
