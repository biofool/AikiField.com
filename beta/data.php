<?php
/**
 * Gated JSON delivery for beta/js/assessment.js. Static files under
 * beta/data/ are blocked at the server (see beta/data/.htaccess) because a
 * gated *.php page doesn't stop a direct fetch of the underlying .json —
 * this endpoint re-checks the same session before reading one.
 */

require dirname(__DIR__) . '/includes/beta-gate.load.php';

$allowed = ['crossview.json', 'practices.json', 'questions.json', 'scenarios.json'];
$file = $_GET['f'] ?? '';

if (!in_array($file, $allowed, true)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'not found']);
    exit;
}

header('Content-Type: application/json');
header('Cache-Control: no-cache');
readfile(__DIR__ . '/data/' . $file);
