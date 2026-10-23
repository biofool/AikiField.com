<?php
// Session gate — same coaching login that protects /beta/ (existing Quantum
// Aikido accounts work). The /for-review/* dispatcher already ran this gate;
// require_once also covers direct hits if the rewrite is ever bypassed.
require_once dirname(__DIR__) . '/includes/beta-gate.load.php';
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
header('Content-Type: application/json');

// data/private/ is .htaccess-denied to the web and excluded from sync.sh's
// rsync --delete so comments survive deploys.
$dataFile = __DIR__ . '/../data/private/games-comments.json';

if (!is_dir(dirname($dataFile))) {
    mkdir(dirname($dataFile), 0755, true);
}

$action = $_GET['action'] ?? 'list';

if ($action === 'list') {
    if (!file_exists($dataFile)) {
        echo json_encode([]);
        exit;
    }
    // Shared lock so a concurrent 'add' can't serve a torn write (issue #100).
    $lfp = fopen($dataFile, 'r');
    if ($lfp !== false) {
        flock($lfp, LOCK_SH);
        echo stream_get_contents($lfp);
        flock($lfp, LOCK_UN);
        fclose($lfp);
    }
    exit;
}

if ($action === 'add' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    // CSRF validation
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!isset($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $token)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid CSRF token']);
        exit;
    }

    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid or empty request body']);
        exit;
    }

    $comment = trim($body['comment'] ?? '');
    if ($comment === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Comment is empty']);
        exit;
    }

    $allowed = ['v1', 'v2', 'both'];
    $version = in_array($body['version'] ?? '', $allowed) ? $body['version'] : 'both';
    $name    = substr(trim($body['name'] ?? ''), 0, 80);
    $comment = substr($comment, 0, 2000);

    $entry = [
        'name'    => $name ?: null,
        'version' => $version,
        'comment' => $comment,
        'date'    => date('Y-m-d'),
    ];

    // Read-modify-write under one exclusive lock (issue #100): a plain
    // file_get_contents + LOCK_EX file_put_contents let two concurrent adds
    // read the same snapshot so the second write clobbered the first.
    $fp = fopen($dataFile, 'c+');
    if ($fp === false) {
        error_log('games-comments: cannot open comment store for writing');
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Comment store unavailable']);
        exit;
    }
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $comments = ($raw === false || trim($raw) === '') ? [] : (json_decode($raw, true) ?: []);
    $comments[] = $entry;
    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($comments, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Invalid action']);
