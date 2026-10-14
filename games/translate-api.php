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
 */

define('AF_GATE_NO_REDIRECT', true);
require dirname(__DIR__) . '/includes/beta-gate.load.php'; // sets $betaAuthed, $qaEmail, $qaSessionToken
require_once dirname(__DIR__) . '/includes/cloudflare-ips.php';
require_once dirname(__DIR__) . '/includes/coach-backend.php';

const TA_MAX_ITEMS = 200;      // backend GameTranslateRequest max_length
const TA_MAX_ITEM_CHARS = 4000;
const TA_ALLOWED_LABELS = ['translation_up', 'translation_down'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function ta_respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
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
    $gameId = $in['gameId'] ?? null;
    $lang = $in['targetLang'] ?? null;
    $items = $in['items'] ?? [];
    if (!is_string($gameId) || $gameId === '' || strlen($gameId) > 64
        || !is_string($lang) || strlen($lang) < 2 || strlen($lang) > 16
        || !is_array($items) || $items === [] || count($items) > TA_MAX_ITEMS) {
        ta_respond(400, ['ok' => false, 'error' => 'Invalid translate request.']);
    }
    $fwd = [];
    foreach ($items as $it) {
        if (is_array($it) && is_string($it['id'] ?? null) && is_string($it['text'] ?? null)
            && $it['id'] !== '' && strlen($it['id']) <= 128 && $it['text'] !== ''
            && mb_strlen($it['text']) <= TA_MAX_ITEM_CHARS) {
            $fwd[] = ['id' => $it['id'], 'text' => $it['text']];
        }
    }
    if ($fwd === []) {
        ta_respond(400, ['ok' => false, 'error' => 'No translatable items.']);
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
