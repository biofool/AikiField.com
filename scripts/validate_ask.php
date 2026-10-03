#!/usr/bin/env php
<?php
/**
 * Validate Ask AikiField source/answer records (issue #65).
 *
 * Exit 0 on success, 1 on errors.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/ask-lib.php';

$errors = ask_validate();
if ($errors) {
    fwrite(STDERR, "FAIL (" . count($errors) . ")\n- " . implode("\n- ", $errors) . "\n");
    exit(1);
}
$published = ask_published_answers();
echo 'OK sources=' . count(ask_sources())
    . ' answers=' . count(ask_answers())
    . ' published=' . count($published)
    . "\n";
