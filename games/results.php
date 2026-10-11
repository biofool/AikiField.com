<?php
declare(strict_types=1);

/**
 * POST /games/results.php — sync Ride the Lucky Wave results with the
 * player's AI Chat account. Thin proxy: the rounds are stored by the AI Chat
 * backend (AIRichardMoon POST /v1/game-results/sync, Firestore), called as
 * the signed-in member from the PHP session.
 *
 * Request:  {"game":"lucky-wave", "results":[{at, mode, scores}, …]}
 *           (results may be empty — that just fetches the account's list)
 * Response: signed in  → {"ok":true, "signedIn":true, "results":[… oldest first …], "skipped":n}
 *           otherwise  → {"ok":true, "signedIn":false}
 *
 * "Otherwise" covers signed out, an expired backend session, and the backend
 * being unreachable or not yet deployed (404) — the game then keeps working
 * on browser-only storage. Each non-signed-out case is logged at WARNING.
 *
 * Only at / mode / scores are forwarded: the AI Chat answer on a round is
 * written solely by games/ai-coach.php from the backend's own reply, never
 * from text the browser sends.
 */

define('AF_GATE_NO_REDIRECT', true);
require dirname(__DIR__) . '/includes/beta-gate.load.php'; // sets $betaAuthed, $qaEmail, $qaSessionToken
require_once dirname(__DIR__) . '/includes/cloudflare-ips.php';
require_once dirname(__DIR__) . '/includes/coach-backend.php';

const GR_GAMES = ['lucky-wave'];
const GR_MAX_FORWARD = 60; // backend GameResultsSyncRequest max_length

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function gr_respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    gr_respond(405, ['ok' => false, 'error' => 'Method not allowed.']);
}
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$host = (string) ($_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('http://' . $host, PHP_URL_HOST)) {
    error_log('game-results: rejected cross-origin request from ' . $origin);
    gr_respond(403, ['ok' => false, 'error' => 'Cross-origin requests are not allowed.']);
}

$in = json_decode((string) file_get_contents('php://input', false, null, 0, 65536), true);
$game = is_array($in) ? ($in['game'] ?? null) : null;
$results = is_array($in) ? ($in['results'] ?? []) : null;
if (!is_string($game) || !in_array($game, GR_GAMES, true) || !is_array($results) || count($results) > GR_MAX_FORWARD) {
    gr_respond(400, ['ok' => false, 'error' => 'Invalid request.']);
}

if (empty($betaAuthed)) {
    gr_respond(200, ['ok' => true, 'signedIn' => false]);
}

// Forward only the round itself; the backend validates every field.
$rounds = [];
foreach ($results as $r) {
    if (is_array($r)) {
        $rounds[] = ['at' => $r['at'] ?? null, 'mode' => $r['mode'] ?? null, 'scores' => $r['scores'] ?? null];
    }
}

$call = af_backend_post('/v1/game-results/sync', ['game' => $game, 'results' => $rounds], (string) $qaEmail, (string) $qaSessionToken);
$data = $call['data'];
if ($call['code'] === 200 && is_array($data) && is_array($data['results'] ?? null)) {
    gr_respond(200, ['ok' => true, 'signedIn' => true, 'results' => $data['results'], 'skipped' => (int) ($data['skipped'] ?? 0)]);
}

// Fall back to browser-only storage, but never silently.
error_log('game-results: account sync unavailable http=' . $call['code']
    . ($call['error'] !== '' ? ' transport=' . $call['error'] : '')
    . (in_array($call['code'], [401, 403], true) ? ' (backend rejected the session)' : ''));
gr_respond(200, ['ok' => true, 'signedIn' => false, 'unavailable' => true]);
