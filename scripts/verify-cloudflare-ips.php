#!/usr/bin/env php
<?php
/**
 * Verifies that the Cloudflare IP ranges vendored in
 * includes/cloudflare-ips.php are still current against Cloudflare's live
 * published lists.
 *
 * Usage: php scripts/verify-cloudflare-ips.php
 *
 * Exit codes:
 *   0  vendored ranges match Cloudflare's live lists.
 *   1  vendored ranges are stale — a diff is printed to stdout. Update
 *      QA_CLOUDFLARE_IPV4_RANGES / QA_CLOUDFLARE_IPV6_RANGES in
 *      includes/cloudflare-ips.php from the URLs below.
 *   2  could not verify at all (couldn't fetch Cloudflare's live lists, or
 *      the vendored file/constants are missing/malformed). This is
 *      distinct from exit 1: it means "we don't know", not "they differ".
 *
 * Wired into sync.sh's `deploy` command right alongside the php -l lint
 * gate (see cloudflare_ip_check() there). Unlike that lint gate, a non-zero
 * exit here only warns rather than aborting the deploy — see sync.sh for
 * the rationale.
 */

declare(strict_types=1);

const CF_IPV4_URL = 'https://www.cloudflare.com/ips-v4/';
const CF_IPV6_URL = 'https://www.cloudflare.com/ips-v6/';
const CF_FETCH_TIMEOUT_SECONDS = 10;

/**
 * Fetches a URL's raw body over a stream context with a bounded timeout and
 * TLS verification. Returns the body string, or null on any failure — never
 * throws or triggers a fatal error, so a network hiccup can't crash the
 * caller (sync.sh) mid-deploy.
 */
function cf_fetch(string $url): ?string
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => CF_FETCH_TIMEOUT_SECONDS,
            'header' => "User-Agent: AikiField-cloudflare-ip-verify/1.0\r\n",
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    if ($body === false || trim($body) === '') {
        return null;
    }
    return $body;
}

/**
 * Parses a Cloudflare ips-v4/ips-v6 text response (one CIDR per line) into a
 * sorted, de-duplicated, lowercased array of CIDR strings.
 */
function cf_parse_cidr_list(string $body): array
{
    $lines = preg_split('/\r\n|\r|\n/', trim($body));
    $cidrs = [];
    foreach ($lines as $line) {
        $line = strtolower(trim($line));
        if ($line === '' || !str_contains($line, '/')) {
            continue;
        }
        $cidrs[$line] = true; // de-dupe via key
    }
    $result = array_keys($cidrs);
    sort($result);
    return $result;
}

/**
 * Normalizes an arbitrary CIDR array (e.g. the vendored PHP constants) the
 * same way cf_parse_cidr_list() normalizes a fetched list, so the two are
 * comparable regardless of casing/ordering in the source.
 */
function cf_normalize_cidr_list(array $cidrs): array
{
    $out = array_unique(array_map(
        static fn(string $c): string => strtolower(trim($c)),
        $cidrs
    ));
    sort($out);
    return array_values($out);
}

/**
 * Diffs two normalized, sorted CIDR arrays.
 *
 * @return array{added: string[], removed: string[]} "added" = present in
 *     $live but not $vendored (Cloudflare added a range we haven't
 *     vendored yet); "removed" = present in $vendored but not $live
 *     (Cloudflare retired a range we're still trusting).
 */
function cf_diff_cidrs(array $vendored, array $live): array
{
    return [
        'added' => array_values(array_diff($live, $vendored)),
        'removed' => array_values(array_diff($vendored, $live)),
    ];
}

function cf_print_family_diff(string $label, array $diff): void
{
    if (!$diff['added'] && !$diff['removed']) {
        return;
    }
    echo "{$label}:\n";
    foreach ($diff['added'] as $cidr) {
        echo "  + {$cidr}  (live now, not vendored)\n";
    }
    foreach ($diff['removed'] as $cidr) {
        echo "  - {$cidr}  (vendored, no longer live)\n";
    }
    echo "\n";
}

/**
 * Runs the full check. Returns the process exit code (0/1/2) rather than
 * exiting directly, so this file can be require()'d (e.g. by a test) without
 * terminating the process.
 */
function cf_run(): int
{
    $vendoredFile = __DIR__ . '/../includes/cloudflare-ips.php';
    if (!is_file($vendoredFile)) {
        fwrite(STDERR, "ERROR: {$vendoredFile} not found.\n");
        return 2;
    }
    require_once $vendoredFile;

    if (!defined('QA_CLOUDFLARE_IPV4_RANGES') || !defined('QA_CLOUDFLARE_IPV6_RANGES')) {
        fwrite(STDERR, "ERROR: QA_CLOUDFLARE_IPV4_RANGES / QA_CLOUDFLARE_IPV6_RANGES " .
            "not found in {$vendoredFile}.\n");
        return 2;
    }

    $vendoredV4 = cf_normalize_cidr_list(QA_CLOUDFLARE_IPV4_RANGES);
    $vendoredV6 = cf_normalize_cidr_list(QA_CLOUDFLARE_IPV6_RANGES);

    $liveV4Body = cf_fetch(CF_IPV4_URL);
    $liveV6Body = cf_fetch(CF_IPV6_URL);

    if ($liveV4Body === null || $liveV6Body === null) {
        fwrite(STDERR, "WARNING: could not fetch Cloudflare's live IP ranges from " .
            CF_IPV4_URL . " / " . CF_IPV6_URL . ". Vendored ranges were NOT " .
            "verified this run — this is not a mismatch, just an unknown.\n");
        return 2;
    }

    $liveV4 = cf_parse_cidr_list($liveV4Body);
    $liveV6 = cf_parse_cidr_list($liveV6Body);

    if (!$liveV4 || !$liveV6) {
        fwrite(STDERR, "WARNING: fetched Cloudflare's live IP range lists but couldn't " .
            "parse any CIDRs out of them (unexpected response format). Vendored " .
            "ranges were NOT verified this run.\n");
        return 2;
    }

    $diffV4 = cf_diff_cidrs($vendoredV4, $liveV4);
    $diffV6 = cf_diff_cidrs($vendoredV6, $liveV6);

    $hasDiff = $diffV4['added'] || $diffV4['removed'] || $diffV6['added'] || $diffV6['removed'];

    if (!$hasDiff) {
        echo "OK: vendored Cloudflare IP ranges in includes/cloudflare-ips.php match " .
            "the live published lists (" . count($vendoredV4) . " IPv4 / " .
            count($vendoredV6) . " IPv6 ranges).\n";
        return 0;
    }

    echo "MISMATCH: vendored Cloudflare IP ranges in includes/cloudflare-ips.php are " .
        "out of date.\n\n";
    cf_print_family_diff('IPv4', $diffV4);
    cf_print_family_diff('IPv6', $diffV6);
    echo "Update QA_CLOUDFLARE_IPV4_RANGES / QA_CLOUDFLARE_IPV6_RANGES in " .
        "includes/cloudflare-ips.php from " . CF_IPV4_URL . " and " . CF_IPV6_URL . ".\n";
    return 1;
}

// Only auto-run when this file is the script PHP was invoked with — so a
// future test harness can require() it to reuse cf_diff_cidrs() etc.
// without triggering a live network fetch or a process exit().
if (PHP_SAPI === 'cli' && isset($_SERVER['argv'][0]) && realpath($_SERVER['argv'][0]) === __FILE__) {
    exit(cf_run());
}
