<?php
/**
 * Reports whether the visitor holds a valid coaching session — the same
 * PHP session login.php establishes and beta-gate.load.php revalidates
 * (6h cadence, fail-open grace). The exercises app fetches this to unlock
 * all practices for signed-in users; anonymous visitors keep the three
 * free practices.
 *
 * Returns: {"authed": true|false}
 */

define('AF_GATE_NO_REDIRECT', true);
require dirname(__DIR__, 2) . '/includes/beta-gate.load.php';

header('Content-Type: application/json');
echo json_encode(['authed' => $betaAuthed]);
