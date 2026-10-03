<?php
declare(strict_types=1);

/**
 * POST /games/ai-coach.php — the "Ask the AI Chat" button in the Digital
 * Experience games (Ride the Lucky Wave V1/V2, Verbal Aikido).
 *
 * AI help is for Unified Field Chat account holders only. The visitor's
 * AikiField coaching session (the one /login.php creates — same session that
 * gates /members, /beta/ and /for-review/) is read server-side; signed-out
 * visitors get 401 + a sign-up/sign-in URL that returns them to the game.
 *
 * For signed-in visitors this sends ONE message to the AI Chat
 * (AIRichardMoon POST /v1/chat-secure, as that user) describing their lowest
 * scores and asking for exactly 1 video and 1 exercise to improve them. The
 * browser sends only ids and integers — the message is composed here from
 * games/ai-coach.json — so this cannot be used to relay free text, and the
 * session token never reaches the page.
 *
 * Request (JSON), one of:
 *   {"game":"lucky-wave", "mode":"rmoone"|"standard",
 *    "scores":{"activate":1-5,"access":1-5,"declare":1-5,"launch":1-5}, "returnTo":"/games/…",
 *    "resultAt": <ms epoch of the stored result, optional>}
 *   — with resultAt, the AI Chat answer is also saved on that round in the
 *     member's account (AI Chat backend POST /v1/game-results/sync).
 *   {"game":"verbal-aikido", "kind":"story", "chapter":"ch1",
 *    "reactive":{"J":0-99,"C":0-99,…}, "returnTo":"/games/verbal-aikido/"}
 *   {"game":"verbal-aikido", "kind":"quiz", "lesson":"disc_…",
 *    "score":0-50, "total":1-50, "returnTo":"/games/verbal-aikido/"}
 * Response (JSON):
 *   200 {"ok":true, "response":"…", "video":{"title","url"}|null, "chatUrl":"/members"}
 *   401 {"ok":false, "needsAccount":true, "loginUrl":"/login.php?next=…"}
 *   400/403/405/502/503/504 {"ok":false, "error":"…"}
 */

define('AF_GATE_NO_REDIRECT', true);
require dirname(__DIR__) . '/includes/beta-gate.load.php'; // sets $betaAuthed, $qaEmail, $qaSessionToken
require_once dirname(__DIR__) . '/includes/cloudflare-ips.php';
require_once dirname(__DIR__) . '/includes/coach-backend.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function aic_respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function aic_bad_request(string $why): void
{
    // Not logged at WARNING: malformed input from the public is expected noise.
    aic_respond(400, ['ok' => false, 'error' => 'Invalid request.', 'reason' => $why]);
}

function aic_int_in($v, int $min, int $max): bool
{
    return is_int($v) && $v >= $min && $v <= $max;
}

// --- Method + origin -------------------------------------------------------
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    aic_respond(405, ['ok' => false, 'error' => 'Method not allowed.']);
}
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$host = (string) ($_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('http://' . $host, PHP_URL_HOST)) {
    error_log('ai-coach: rejected cross-origin request from ' . $origin);
    aic_respond(403, ['ok' => false, 'error' => 'Cross-origin requests are not allowed.']);
}

// --- Vocabulary + input ----------------------------------------------------
$vocabRaw = @file_get_contents(__DIR__ . '/ai-coach.json');
$vocab = $vocabRaw === false ? null : json_decode($vocabRaw, true);
if (!is_array($vocab) || !isset($vocab['games'], $vocab['ask'], $vocab['goals']['improve'], $vocab['goals']['deepen'])) {
    error_log('ai-coach: games/ai-coach.json missing or invalid');
    aic_respond(500, ['ok' => false, 'error' => 'AI help is misconfigured.']);
}

$in = json_decode((string) file_get_contents('php://input', false, null, 0, 4096), true);
if (!is_array($in)) {
    aic_bad_request('body');
}
$gameId = $in['game'] ?? null;
if (!is_string($gameId) || !isset($vocab['games'][$gameId])) {
    aic_bad_request('game');
}
$game = $vocab['games'][$gameId];
$returnTo = $in['returnTo'] ?? '';
if (!is_string($returnTo) || !in_array($returnTo, $game['returnPaths'], true)) {
    $returnTo = $game['returnPaths'][0];
}

// --- Account required ------------------------------------------------------
if (empty($betaAuthed)) {
    aic_respond(401, [
        'ok' => false,
        'needsAccount' => true,
        'error' => 'AI help is for Unified Field Chat members.',
        'loginUrl' => '/login.php?next=' . rawurlencode($returnTo),
    ]);
}

// --- Compose the message from the lowest scores ----------------------------
$facts = '';
$goal = 'improve'; // 'deepen' when there is nothing low to improve
if ($gameId === 'lucky-wave') {
    $mode = $in['mode'] ?? null;
    $scores = $in['scores'] ?? null;
    if (!is_string($mode) || !isset($game['modes'][$mode]) || !is_array($scores)) {
        aic_bad_request('mode/scores');
    }
    $m = $game['modes'][$mode];
    if (count($scores) !== count($m['phases'])) {
        aic_bad_request('scores');
    }
    foreach ($m['phases'] as $id => $_) {
        if (!aic_int_in($scores[$id] ?? null, 1, 5)) {
            aic_bad_request('scores');
        }
    }
    // "Lowest scores" = every phase sharing the minimum score.
    $min = min(array_map(fn ($id) => $scores[$id], array_keys($m['phases'])));
    $low = [];
    foreach ($m['phases'] as $id => $label) {
        if ($scores[$id] === $min) {
            $low[] = sprintf('%s — %d/5 (%s)', $label, $min, $m['scoreLabels'][(string) $min]);
        }
    }
    $facts = sprintf('I just played %s (%s). My lowest-scoring %s: %s.',
        $game['title'], $m['label'], count($low) > 1 ? 'phases were' : 'phase was', implode('; ', $low));
} elseif ($gameId === 'verbal-aikido') {
    $kind = $in['kind'] ?? null;
    if ($kind === 'story') {
        $chapter = $in['chapter'] ?? null;
        $reactive = $in['reactive'] ?? null;
        if (!is_string($chapter) || !isset($game['chapters'][$chapter]) || !is_array($reactive)) {
            aic_bad_request('chapter/reactive');
        }
        $counts = [];
        foreach ($reactive as $type => $n) {
            if (!is_string($type) || $type === 'A' || !isset($game['responseTypes'][$type]) || !aic_int_in($n, 0, 99)) {
                aic_bad_request('reactive');
            }
            if ($n > 0) {
                $counts[$type] = $n;
            }
        }
        arsort($counts);
        if ($counts) {
            $parts = [];
            foreach ($counts as $type => $n) {
                $parts[] = sprintf('%s (%d×)', $game['responseTypes'][$type], $n);
            }
            $facts = sprintf('I just finished "%s" in %s. Instead of an Aikido response, I fell into these reactive responses: %s.',
                $game['chapters'][$chapter], $game['title'], implode(', ', $parts));
        } else {
            $facts = sprintf('I just finished "%s" in %s and answered with an Aikido response every time.',
                $game['chapters'][$chapter], $game['title']);
            $goal = 'deepen';
        }
    } elseif ($kind === 'quiz') {
        $lesson = $in['lesson'] ?? null;
        $score = $in['score'] ?? null;
        $total = $in['total'] ?? null;
        if (!is_string($lesson) || !isset($game['lessons'][$lesson])
            || !aic_int_in($total, 1, 50) || !aic_int_in($score, 0, $total)) {
            aic_bad_request('quiz');
        }
        $facts = sprintf('On the %s Discovery quiz "%s" I scored %d/%d.',
            $game['title'], $game['lessons'][$lesson], $score, $total);
    } else {
        aic_bad_request('kind');
    }
}
$message = $facts . ' ' . str_replace('{goal}', $vocab['goals'][$goal], $vocab['ask']);

// --- Ask the AI Chat as this user -----------------------------------------
$call = af_backend_post('/v1/chat-secure', [
    'message'     => $message,
    // Own conversation per request so game asks don't interleave with the
    // member's /members chat history. `game_` ids are real member traffic,
    // not test sessions (AIRichardMoon app/session_ids.py).
    'sessionId'   => 'game_' . $gameId . '_' . str_replace('.', '', sprintf('%.6F', microtime(true))),
    'modality'    => 'blended', // exercise + video deep links on cited sources
    'specificity' => 'brief',
], (string) $qaEmail, (string) $qaSessionToken);
$code = $call['code'];

if ($code === 0) {
    error_log('ai-coach: chat-secure transport error game=' . $gameId . ' err=' . $call['error']);
    aic_respond(502, ['ok' => false, 'error' => 'The AI Chat is not reachable right now.']);
}
if ($code === 401 || $code === 403) {
    // Backend no longer accepts this session — send them back through login.
    error_log('ai-coach: chat-secure rejected session http=' . $code . ' game=' . $gameId);
    aic_respond(401, [
        'ok' => false,
        'needsAccount' => true,
        'error' => 'Your AI Chat session has expired.',
        'loginUrl' => '/login.php?error=session_expired&next=' . rawurlencode($returnTo),
    ]);
}
$data = $call['data'];
if ($code !== 200 || !is_array($data) || !is_string($data['response'] ?? null) || trim($data['response']) === '') {
    error_log('ai-coach: chat-secure failed http=' . $code . ' game=' . $gameId);
    $status = in_array($code, [429, 503, 504], true) ? $code : 502;
    $detail = is_array($data) && is_string($data['detail'] ?? null) ? $data['detail'] : 'The AI Chat could not answer right now.';
    aic_respond($status, ['ok' => false, 'error' => $detail]);
}

// First cited source with a playable video link, as the "1 video".
$video = null;
foreach (($data['sources'] ?? []) as $src) {
    $url = is_array($src) ? ($src['youtubeUrl'] ?? null) : null;
    if (is_string($url) && preg_match('#^https://(www\.)?(youtube\.com|youtu\.be)/#', $url)) {
        $start = $src['startSeconds'] ?? null;
        if (is_int($start) && $start > 0 && !str_contains($url, 't=')) {
            $url .= (str_contains($url, '?') ? '&' : '?') . 't=' . $start . 's';
        }
        $video = ['title' => (string) ($src['title'] ?? 'Video'), 'url' => $url];
        break;
    }
}

// Lucky Wave: keep the answer with the round in the member's account (AI Chat
// backend), so it follows them to other devices. The mode + scores were
// validated above; the answer is the backend's own reply, never browser text.
// A failure is logged and does not block the answer.
$resultAt = $in['resultAt'] ?? null;
if ($gameId === 'lucky-wave' && is_int($resultAt)) {
    $save = af_backend_post('/v1/game-results/sync', [
        'game'    => 'lucky-wave',
        'results' => [[
            'at'         => $resultAt,
            'mode'       => $in['mode'],
            'scores'     => $in['scores'],
            'aiResponse' => trim($data['response']),
            'aiVideo'    => $video,
        ]],
    ], (string) $qaEmail, (string) $qaSessionToken);
    if ($save['code'] !== 200) {
        error_log('ai-coach: saving the answer on the round failed http=' . $save['code']
            . ($save['error'] !== '' ? ' transport=' . $save['error'] : ''));
    } elseif ((int) ($save['data']['skipped'] ?? 0) > 0) {
        // 200 but the backend rejected the round (e.g. resultAt out of range).
        error_log('ai-coach: backend skipped the round, answer not saved resultAt=' . $resultAt);
    }
}

aic_respond(200, [
    'ok' => true,
    'response' => trim($data['response']),
    'video' => $video,
    'chatUrl' => '/members',
]);
