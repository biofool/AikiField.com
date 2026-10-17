<?php
declare(strict_types=1);

/**
 * POST /games/translate-api.php — bridge between the games' language picker
 * (games/translate.js) and the AI Chat backend (AIRichardMoon), called as the
 * signed-in member from the PHP session via includes/coach-backend.php.
 *
 * Actions (JSON body {"action": ...}):
 *   "translate" → forwards {gameId, targetLang, items:[{id,text}]} to
 *                 POST /v1/games/translate. The backend translates via Gemini
 *                 and emails the structured JSON to the review recipients.
 *   "feedback"  → forwards {sessionId, messageId, label, note} to
 *                 POST /v1/feedback, so thumbs up/down on translated
 *                 paragraphs land in the coaching feedback digest.
 *
 * Signed out / expired session → 401 {"ok":false}; the page keeps working in
 * English. Never exposes session credentials to browser JS.
 *
 * The relay only forwards what the pages can legitimately send (AF #125): the
 * game ids and picker languages in games/translate-config.json, at most
 * TA_MAX_ITEMS items and TA_MAX_TOTAL_CHARS characters. Without that, any
 * signed-in account could make the backend run Gemini and email the review
 * recipients with a game id, a language and text of its own choosing.
 */

define('AF_GATE_NO_REDIRECT', true);
require dirname(__DIR__) . '/includes/beta-gate.load.php'; // sets $betaAuthed, $qaEmail, $qaSessionToken
require_once dirname(__DIR__) . '/includes/cloudflare-ips.php';
require_once dirname(__DIR__) . '/includes/coach-backend.php';

const TA_MAX_ITEMS = 200;      // backend GameTranslateRequest max_length
const TA_MAX_ITEM_CHARS = 4000;
// The games send about 12 KB today (exercises 11,355 bytes, Lucky Wave 11,890).
// The backend refuses bodies over its own limit for this route (65,536 bytes
// by default, AIR#946), so 24,000 characters leaves room to grow and stays
// well inside it.
const TA_MAX_TOTAL_CHARS = 24000;
const TA_ALLOWED_LABELS = ['translation_up', 'translation_down'];
const TA_CONFIG_FILE = __DIR__ . '/translate-config.json';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function ta_respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * The allow-lists from games/translate-config.json. A missing or broken file
 * is a server fault (logged, 500), never "allow everything".
 *
 * @return array{games: list<string>, languages: list<string>}
 */
function ta_load_config(): array
{
    $raw = @file_get_contents(TA_CONFIG_FILE);
    $cfg = $raw === false ? null : json_decode($raw, true);
    if (!is_array($cfg) || !is_array($cfg['games'] ?? null) || !is_array($cfg['languages'] ?? null)) {
        error_log('translate-api: ' . TA_CONFIG_FILE . ' is missing or not valid; refusing every request');
        ta_respond(500, ['ok' => false, 'error' => 'Translation is not available.']);
    }
    return [
        'games' => array_values(array_filter($cfg['games'], 'is_string')),
        'languages' => array_values(array_filter($cfg['languages'], 'is_string')),
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    ta_respond(405, ['ok' => false, 'error' => 'Method not allowed.']);
}
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$host = (string) ($_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('http://' . $host, PHP_URL_HOST)) {
    error_log('translate-api: rejected cross-origin request from ' . $origin);
    ta_respond(403, ['ok' => false, 'error' => 'Cross-origin requests are not allowed.']);
}

$in = json_decode((string) file_get_contents('php://input', false, null, 0, 1048576), true);
$action = is_array($in) ? ($in['action'] ?? null) : null;

if (empty($betaAuthed) || empty($qaEmail) || empty($qaSessionToken)) {
    ta_respond(401, ['ok' => false, 'error' => 'Not signed in.']);
}

if ($action === 'translate') {
    $cfg = ta_load_config();
    $gameId = $in['gameId'] ?? null;
    $lang = $in['targetLang'] ?? null;
    $items = $in['items'] ?? [];
    if (!is_string($gameId) || !in_array($gameId, $cfg['games'], true)
        || !is_string($lang) || !in_array($lang, $cfg['languages'], true)
        || !is_array($items) || $items === [] || count($items) > TA_MAX_ITEMS) {
        error_log('translate-api: refused a translate request (gameId='
            . (is_string($gameId) ? substr($gameId, 0, 40) : gettype($gameId)) . ' targetLang='
            . (is_string($lang) ? substr($lang, 0, 20) : gettype($lang)) . ')');
        ta_respond(400, ['ok' => false, 'error' => 'Invalid translate request.']);
    }
    $fwd = [];
    $dropped = 0;
    $totalChars = 0;
    foreach ($items as $it) {
        if (is_array($it) && is_string($it['id'] ?? null) && is_string($it['text'] ?? null)
            && $it['id'] !== '' && strlen($it['id']) <= 128 && $it['text'] !== ''
            && mb_strlen($it['text']) <= TA_MAX_ITEM_CHARS) {
            $fwd[] = ['id' => $it['id'], 'text' => $it['text']];
            $totalChars += mb_strlen($it['text']);
        } else {
            $dropped++;
        }
    }
    if ($dropped > 0) {
        error_log('translate-api: dropped ' . $dropped . ' invalid item(s) of ' . count($items) . ' for game ' . $gameId);
    }
    if ($fwd === []) {
        ta_respond(400, ['ok' => false, 'error' => 'No translatable items.']);
    }
    if ($totalChars > TA_MAX_TOTAL_CHARS) {
        error_log('translate-api: refused ' . $totalChars . ' characters (limit ' . TA_MAX_TOTAL_CHARS . ') for game ' . $gameId);
        ta_respond(400, ['ok' => false, 'error' => 'Too much text in one request.']);
    }
    $res = af_backend_post('/v1/games/translate', [
        'gameId' => $gameId, 'targetLang' => $lang, 'items' => $fwd,
    ], $qaEmail, $qaSessionToken, 120);
} elseif ($action === 'feedback') {
    $sessionId = $in['sessionId'] ?? null;
    $messageId = $in['messageId'] ?? '';
    $label = $in['label'] ?? null;
    $note = $in['note'] ?? '';
    if (!is_string($sessionId) || $sessionId === '' || strlen($sessionId) > 128
        || !is_string($messageId) || strlen($messageId) > 128
        || !in_array($label, TA_ALLOWED_LABELS, true)
        || !is_string($note) || strlen($note) > 2000) {
        ta_respond(400, ['ok' => false, 'error' => 'Invalid feedback request.']);
    }
    $res = af_backend_post('/v1/feedback', [
        'sessionId' => $sessionId, 'messageId' => $messageId,
        'label' => $label, 'note' => $note,
    ], $qaEmail, $qaSessionToken);
} else {
    ta_respond(400, ['ok' => false, 'error' => 'Unknown action.']);
}

if ($res['code'] === 0) {
    error_log('translate-api: backend unreachable action=' . $action . ' error=' . $res['error']);
    ta_respond(502, ['ok' => false, 'error' => 'Backend unreachable.']);
}
if (!is_array($res['data'])) {
    error_log('translate-api: non-JSON backend response action=' . $action . ' code=' . $res['code']);
    ta_respond(502, ['ok' => false, 'error' => 'Bad backend response.']);
}
$res['data']['ok'] = $res['data']['ok'] ?? ($res['code'] < 400);
ta_respond($res['code'], $res['data']);
