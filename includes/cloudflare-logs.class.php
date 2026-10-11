<?php
/**
 * Cloudflare Logs Scanner — pulls error/issue data from the Cloudflare
 * GraphQL Analytics API for the aikifield.com zone.
 *
 * Surfaces:
 *   - HTTP requests with error status codes (4xx/5xx) grouped by path
 *   - Firewall/WAF events (blocked/challenged requests)
 *   - Daily traffic summary (requests, page views, threats, uniques)
 *
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID to be defined
 * (via coach-config.local.php — gitignored). See docs/coach-auth-prd.md.
 *
 * Usage:
 *   $scanner = new CloudflareLogsScanner($apiToken, $zoneId);
 *   $report  = $scanner->scan(hours: 24);
 *   $scanner->render($report);  // HTML output
 */

class CloudflareLogsScanner
{
    private string $apiToken;
    private string $zoneId;
    private string $graphqlUrl = 'https://api.cloudflare.com/client/v4/graphql';

    // Status codes that indicate real problems.
    private array $errorStatuses = [400, 401, 403, 404, 422, 429, 500, 502, 503, 504];

    public function __construct(string $apiToken, string $zoneId)
    {
        $trimmed = trim($apiToken);
        if ($trimmed !== $apiToken) {
            // A trailing newline yields a malformed Authorization header (6003/6111).
            error_log('cloudflare_logs_token_whitespace source=CLOUDFLARE_API_TOKEN stripped_chars='
                . (strlen($apiToken) - strlen($trimmed)));
        }
        $this->apiToken = $trimmed;
        $this->zoneId   = $zoneId;
    }

    /**
     * Classify a failed Cloudflare response (CloudManagement#111).
     *
     * Uses the error code plus message, never the HTTP status alone:
     * 9109 covers IP filtering, wrong token type and missing scope.
     *
     * @return array{category: string, hint: string, code: int|null}
     */
    public static function classifyError(int $status, ?array $body): array
    {
        $first = $body['errors'][0] ?? [];
        $code  = isset($first['code']) ? (int)$first['code'] : null;
        $msg   = (string)($first['message'] ?? '');
        $low   = strtolower($msg);
        if ($status === 0) {
            return ['category' => 'network_error', 'hint' => 'no response from Cloudflare: ' . $msg, 'code' => $code];
        }
        if ($code === 9109 && str_contains($low, 'location')) {
            $where = trim((string)substr($msg, (int)strpos($msg, ':') + 1));
            return ['category' => 'ip_blocked', 'code' => $code,
                    'hint' => "the token's Client IP Address Filtering rejects this server ($where); widen the filter on the token"];
        }
        if ($code === 9109 && str_contains($low, 'user-level authentication')) {
            return ['category' => 'wrong_token_type', 'code' => $code,
                    'hint' => 'account-owned token used on a /user/... endpoint'];
        }
        if ($code === 9109 || $code === 10000 || $status === 403) {
            return ['category' => 'missing_scope', 'code' => $code,
                    'hint' => 'token lacks Zone > Analytics:Read for this zone (or its zone resources exclude it)'];
        }
        if (in_array($code, [1000, 6003, 6111], true) || $status === 401) {
            return ['category' => 'invalid_token', 'code' => $code,
                    'hint' => 'token rejected - revoked, wrong value, or stray whitespace in CLOUDFLARE_API_TOKEN'];
        }
        if ($status === 200 && !empty($body['errors'])) {
            return ['category' => 'graphql_error', 'code' => $code, 'hint' => 'GraphQL error: ' . substr($msg, 0, 200)];
        }
        if ($status === 429) {
            return ['category' => 'rate_limited', 'code' => $code, 'hint' => 'rate limited; retry later'];
        }
        if ($status >= 500) {
            return ['category' => 'server_error', 'code' => $code, 'hint' => "Cloudflare server error ($status)"];
        }
        return ['category' => 'unknown', 'code' => $code, 'hint' => "unexpected Cloudflare response ($status)"];
    }

    /** Log one failure and return it as a dashboard error entry. */
    private function failure(int $status, ?array $body): array
    {
        $d = self::classifyError($status, $body);
        error_log(sprintf(
            'cloudflare_logs_api_failed zone=%s category=%s status=%d code=%s hint=%s',
            $this->zoneId, $d['category'], $status, $d['code'] ?? '-', $d['hint']
        ));
        return ['errors' => [['message' => '[' . $d['category'] . '] ' . $d['hint']]], 'data' => null];
    }

    /**
     * Query the Cloudflare GraphQL API.
     *
     * @param string $query GraphQL query string
     * @return array Decoded JSON response
     */
    private function graphql(string $query): array
    {
        $ch = curl_init($this->graphqlUrl);
        $payload = json_encode(['query' => $query]);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $this->apiToken,
                'Content-Type: application/json',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body = curl_exec($ch);
        $err  = curl_error($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err) {
            return $this->failure(0, ['errors' => [['message' => 'cURL error: ' . $err]]]);
        }
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if ($code !== 200) {
            return $this->failure((int)$code, is_array($decoded) ? $decoded : null);
        }
        if (!is_array($decoded)) {
            error_log('cloudflare_logs_api_failed zone=' . $this->zoneId . ' category=unknown status=200 hint=invalid JSON');
            return ['errors' => [['message' => 'Invalid JSON response']], 'data' => null];
        }
        if (!empty($decoded['errors'])) {
            return $this->failure(200, $decoded);
        }
        // A zone outside the token's zone resources returns zones: [] with
        // NO error - the tables would silently render empty.
        if (($decoded['data']['viewer']['zones'] ?? null) === []) {
            error_log('cloudflare_logs_api_failed zone=' . $this->zoneId
                . ' category=zone_not_visible hint=zone not visible to this token or does not exist');
            return ['errors' => [['message' => '[zone_not_visible] zone ' . $this->zoneId
                . ' is not visible to this token (zone resources exclude it) or does not exist']], 'data' => null];
        }
        return $decoded;
    }

    /**
     * Run a full scan of Cloudflare analytics for the zone.
     *
     * @param int $hours Number of hours to look back (default 24)
     * @return array Report with errorRequests, firewallEvents, dailySummary
     */
    public function scan(int $hours = 24): array
    {
        $now    = gmdate('Y-m-d\TH:i:s\Z');
        $since  = gmdate('Y-m-d\TH:i:s\Z', time() - $hours * 3600);
        $zoneId = $this->zoneId;

        // --- 1. HTTP requests with error status codes ---
        $errorReqQuery = <<<GRAPHQL
{ viewer { zones(filter: {zoneTag: "$zoneId"}) { httpRequestsAdaptiveGroups(limit: 100, filter: {datetime_geq: "$since", datetime_leq: "$now", edgeResponseStatus_in: [400,401,403,404,422,429,500,502,503,504]}) { dimensions { edgeResponseStatus clientRequestPath clientRequestHTTPMethodName clientCountryName } count } } } }
GRAPHQL;
        $errorReqData = $this->graphql($errorReqQuery);

        // --- 2. Firewall/WAF events ---
        $fwQuery = <<<GRAPHQL
{ viewer { zones(filter: {zoneTag: "$zoneId"}) { firewallEventsAdaptive(limit: 50, filter: {datetime_geq: "$since", datetime_leq: "$now"}) { action source clientCountryName clientIP userAgent rayName } } } }
GRAPHQL;
        $fwData = $this->graphql($fwQuery);

        // --- 3. Daily summary (last 7 days) ---
        $dateSince = gmdate('Y-m-d', time() - 7 * 86400);
        $dateUntil = gmdate('Y-m-d');
        $summaryQuery = <<<GRAPHQL
{ viewer { zones(filter: {zoneTag: "$zoneId"}) { httpRequests1dGroups(limit: 7, filter: {date_geq: "$dateSince", date_leq: "$dateUntil"}) { dimensions { date } sum { requests pageViews threats } uniq { uniques } } } } }
GRAPHQL;
        $summaryData = $this->graphql($summaryQuery);

        // --- Parse results ---
        $errorRequests = [];
        if (!($errorReqData['errors'] ?? null) && ($errorReqData['data']['viewer']['zones'][0]['httpRequestsAdaptiveGroups'] ?? null)) {
            foreach ($errorReqData['data']['viewer']['zones'][0]['httpRequestsAdaptiveGroups'] as $g) {
                $dim = $g['dimensions'];
                $errorRequests[] = [
                    'status'   => (int)$dim['edgeResponseStatus'],
                    'method'   => $dim['clientRequestHTTPMethodName'] ?? '?',
                    'path'     => $dim['clientRequestPath'] ?? '/',
                    'country'  => $dim['clientCountryName'] ?? '?',
                    'count'    => (int)$g['count'],
                ];
            }
        }
        // Sort by count descending
        usort($errorRequests, fn($a, $b) => $b['count'] <=> $a['count']);

        $firewallEvents = [];
        if (!($fwData['errors'] ?? null) && ($fwData['data']['viewer']['zones'][0]['firewallEventsAdaptive'] ?? null)) {
            foreach ($fwData['data']['viewer']['zones'][0]['firewallEventsAdaptive'] as $e) {
                $firewallEvents[] = [
                    'action'  => $e['action'] ?? '?',
                    'source'  => $e['source'] ?? '?',
                    'country' => $e['clientCountryName'] ?? '?',
                    'ip'      => $e['clientIP'] ?? '?',
                    'ua'      => substr($e['userAgent'] ?? '', 0, 80),
                    'ray'     => $e['rayName'] ?? '',
                ];
            }
        }

        $dailySummary = [];
        if (!($summaryData['errors'] ?? null) && ($summaryData['data']['viewer']['zones'][0]['httpRequests1dGroups'] ?? null)) {
            foreach ($summaryData['data']['viewer']['zones'][0]['httpRequests1dGroups'] as $g) {
                $s = $g['sum'];
                $dailySummary[] = [
                    'date'      => $g['dimensions']['date'],
                    'requests'  => (int)($s['requests'] ?? 0),
                    'pageViews' => (int)($s['pageViews'] ?? 0),
                    'threats'   => (int)($s['threats'] ?? 0),
                    'uniques'   => (int)($g['uniq']['uniques'] ?? 0),
                ];
            }
        }
        // Sort by date descending
        usort($dailySummary, fn($a, $b) => $b['date'] <=> $a['date']);

        // Collect any API errors
        $apiErrors = [];
        foreach ([$errorReqData, $fwData, $summaryData] as $d) {
            if (!empty($d['errors'])) {
                foreach ($d['errors'] as $e) {
                    $apiErrors[] = $e['message'] ?? 'Unknown error';
                }
            }
        }
        // The three queries usually fail for the same credential reason.
        $apiErrors = array_values(array_unique($apiErrors));

        return [
            'zone_id'        => $this->zoneId,
            'hours'          => $hours,
            'generated_at'   => gmdate('Y-m-d\TH:i:s\Z'),
            'error_requests' => $errorRequests,
            'firewall_events'=> $firewallEvents,
            'daily_summary'  => $dailySummary,
            'api_errors'     => $apiErrors,
            'error_count'    => count($errorRequests),
            'firewall_count' => count($firewallEvents),
        ];
    }

    /**
     * Render the report as HTML (for the dashboard page).
     *
     * @param array $report Scan result from scan()
     * @return string HTML
     */
    public function render(array $report): string
    {
        $h = function ($s): string {
            return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        };

        $statusClass = function (int $code): string {
            if ($code >= 500) return 'cf-status-5xx';
            if ($code >= 400) return 'cf-status-4xx';
            return 'cf-status-ok';
        };

        $html = '';

        // --- API errors ---
        if (!empty($report['api_errors'])) {
            $html .= '<div class="cf-section cf-api-errors">';
            $html .= '<h3>Cloudflare API Errors</h3><ul>';
            foreach ($report['api_errors'] as $err) {
                $html .= '<li class="cf-error">' . $h($err) . '</li>';
            }
            $html .= '</ul></div>';
        }

        // --- Daily summary ---
        if (!empty($report['daily_summary'])) {
            $html .= '<div class="cf-section">';
            $html .= '<h3>Traffic Summary (last 7 days)</h3>';
            $html .= '<table class="cf-table"><thead><tr>';
            $html .= '<th>Date</th><th>Requests</th><th>Page Views</th><th>Threats</th><th>Unique Visitors</th>';
            $html .= '</tr></thead><tbody>';
            foreach ($report['daily_summary'] as $day) {
                $html .= '<tr>';
                $html .= '<td>' . $h($day['date']) . '</td>';
                $html .= '<td>' . $day['requests'] . '</td>';
                $html .= '<td>' . $day['pageViews'] . '</td>';
                $html .= '<td class="' . ($day['threats'] > 0 ? 'cf-threat' : '') . '">' . $day['threats'] . '</td>';
                $html .= '<td>' . $day['uniques'] . '</td>';
                $html .= '</tr>';
            }
            $html .= '</tbody></table></div>';
        }

        // --- Error requests ---
        if (!empty($report['error_requests'])) {
            $html .= '<div class="cf-section">';
            $html .= '<h3>HTTP Errors (last ' . $report['hours'] . 'h) — ' . $report['error_count'] . ' groups</h3>';
            $html .= '<table class="cf-table"><thead><tr>';
            $html .= '<th>Count</th><th>Status</th><th>Method</th><th>Path</th><th>Country</th>';
            $html .= '</tr></thead><tbody>';
            foreach ($report['error_requests'] as $req) {
                $html .= '<tr>';
                $html .= '<td>' . $req['count'] . '</td>';
                $html .= '<td class="' . $statusClass($req['status']) . '">' . $req['status'] . '</td>';
                $html .= '<td>' . $h($req['method']) . '</td>';
                $html .= '<td class="cf-path">' . $h($req['path']) . '</td>';
                $html .= '<td>' . $h($req['country']) . '</td>';
                $html .= '</tr>';
            }
            $html .= '</tbody></table></div>';
        } elseif (empty($report['api_errors'])) {
            $html .= '<div class="cf-section cf-ok"><p>&#10003; No HTTP errors in the last ' . $report['hours'] . ' hours.</p></div>';
        }

        // --- Firewall events ---
        if (!empty($report['firewall_events'])) {
            $html .= '<div class="cf-section">';
            $html .= '<h3>Firewall/WAF Events (last ' . $report['hours'] . 'h) — ' . $report['firewall_count'] . ' events</h3>';
            $html .= '<table class="cf-table"><thead><tr>';
            $html .= '<th>Action</th><th>Source</th><th>Country</th><th>IP</th><th>User Agent</th><th>Ray ID</th>';
            $html .= '</tr></thead><tbody>';
            foreach ($report['firewall_events'] as $e) {
                $html .= '<tr>';
                $html .= '<td class="cf-fw-action">' . $h($e['action']) . '</td>';
                $html .= '<td>' . $h($e['source']) . '</td>';
                $html .= '<td>' . $h($e['country']) . '</td>';
                $html .= '<td class="cf-ip">' . $h($e['ip']) . '</td>';
                $html .= '<td class="cf-ua">' . $h($e['ua']) . '</td>';
                $html .= '<td class="cf-ray">' . $h($e['ray']) . '</td>';
                $html .= '</tr>';
            }
            $html .= '</tbody></table></div>';
        } elseif (empty($report['api_errors'])) {
            $html .= '<div class="cf-section cf-ok"><p>&#10003; No firewall events in the last ' . $report['hours'] . ' hours.</p></div>';
        }

        return $html;
    }
}
