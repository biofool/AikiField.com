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
    echo file_get_contents($dataFile);
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

    $comments = [];
    if (file_exists($dataFile)) {
        $comments = json_decode(file_get_contents($dataFile), true) ?: [];
    }
    $comments[] = $entry;

    file_put_contents($dataFile, json_encode($comments, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Invalid action']);
