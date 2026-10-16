<?php
/**
 * Standalone unit tests for includes/lightness.php (issue #110): the loader
 * behind the post-log "lightness" lines on /games/exercises/.
 *
 * Acceptance criterion under test: if lightness.json is missing or invalid
 * the page still works and the error is logged. The loader must therefore
 * return an empty list (never throw) and write a specific log line for every
 * kind of failure. It also checks that the JSON literal embedded in the page
 * cannot close the <script> block.
 *
 * Usage:
 *   php tests/unit/test-lightness-loader.php
 *
 * Exit code 0 = all assertions passed. Exit code 1 = at least one failure.
 */

declare(strict_types=1);

require __DIR__ . '/../../includes/lightness.php';

$failures = 0;
$passed = 0;

/**
 * @param mixed $expected
 * @param mixed $actual
 */
function lt_check(string $label, $expected, $actual): void
{
    global $failures, $passed;
    if ($expected === $actual) {
        $passed++;
        echo "PASS: $label\n";
        return;
    }
    $failures++;
    fwrite(STDERR, "FAIL: $label\n");
    fwrite(STDERR, '  expected: ' . var_export($expected, true) . "\n");
    fwrite(STDERR, '  actual:   ' . var_export($actual, true) . "\n");
}

$logFile = tempnam(sys_get_temp_dir(), 'ltlog');
ini_set('log_errors', '1');
ini_set('error_log', $logFile);

/** Everything logged since the last call. */
function lt_log(): string
{
    global $logFile;
    clearstatcache();
    $text = (string) file_get_contents($logFile);
    file_put_contents($logFile, '');
    return $text;
}

function lt_file(string $content): string
{
    $path = tempnam(sys_get_temp_dir(), 'ltdata');
    file_put_contents($path, $content);
    return $path;
}

function lt_data(array $items, array $extra = []): string
{
    return lt_file((string) json_encode($extra + ['items' => $items]));
}

/** A data file that shows every valid line (display.show_unapproved is an explicit true). */
function lt_open(array $items): string
{
    return lt_data($items, ['display' => ['show_unapproved' => true]]);
}

function lt_item(string $id, string $text, array $practices = [], bool $approved = false): array
{
    return ['id' => $id, 'text' => $text, 'kind' => 'twist', 'practices' => $practices, 'themes' => ['practice'], 'approved' => $approved];
}

// --- a good file ---------------------------------------------------------
$good = lt_open([lt_item('lt-001', 'First.', [1]), lt_item('lt-002', 'Second.'), lt_item('lt-003', 'Third.', [6, 12])]);
$items = af_lightness_items($good);
lt_check('good file: all items come back', ['lt-001', 'lt-002', 'lt-003'], array_column($items, 'id'));
lt_check('good file: only id, text and practices are exposed', ['id', 'practices', 'text'], (function () use ($items) {
    $keys = array_keys($items[0]);
    sort($keys);
    return $keys;
})());
lt_check('good file: practices stay a list of ints', [6, 12], $items[2]['practices']);
lt_check('good file: nothing logged', '', lt_log());

// --- missing, unreadable and broken files -------------------------------
lt_check('missing file: empty list', [], af_lightness_items('/nonexistent/lightness.json'));
lt_check('missing file: logged with the path', true, str_contains(lt_log(), 'lightness: data file missing or unreadable: /nonexistent/lightness.json'));

lt_check('invalid JSON: empty list', [], af_lightness_items(lt_file('{"items": [')));
lt_check('invalid JSON: logged', true, str_contains(lt_log(), 'lightness: invalid JSON in'));

lt_check('empty file: empty list', [], af_lightness_items(lt_file('')));
lt_check('empty file: logged', true, str_contains(lt_log(), 'lightness: invalid JSON in'));

lt_check('no items list: empty list', [], af_lightness_items(lt_file('{"version": 1}')));
lt_check('no items list: logged', true, str_contains(lt_log(), 'lightness: no items list in'));

lt_check('items is not a list: empty list', [], af_lightness_items(lt_file('{"items": "nope"}')));
lt_check('items is not a list: logged', true, str_contains(lt_log(), 'lightness: no items list in'));

lt_check('JSON scalar: empty list', [], af_lightness_items(lt_file('42')));
lt_check('JSON scalar: logged', true, str_contains(lt_log(), 'lightness: no items list in'));

// --- bad items are skipped one by one, the rest still show ---------------
$mixed = lt_open([
    lt_item('lt-001', 'Fine.', [1]),
    ['id' => 'lt-002', 'text' => '', 'practices' => []],
    ['id' => '', 'text' => 'No id.', 'practices' => []],
    ['id' => 'lt-004', 'text' => 'Bad practices.', 'practices' => ['one']],
    ['id' => 'lt-005', 'text' => 'Zero practice.', 'practices' => [0]],
    ['id' => 'lt-006', 'text' => 'Practices missing.'],
    'just a string',
    lt_item('lt-008', 'Also fine.'),
]);
lt_check('mixed file: only the good items survive', ['lt-001', 'lt-008'], array_column(af_lightness_items($mixed), 'id'));
$log = lt_log();
lt_check('mixed file: six skips are logged', 6, substr_count($log, 'lightness: skipping item #'));
lt_check('mixed file: the log names the item index', true, str_contains($log, 'skipping item #1 ') && str_contains($log, 'skipping item #6 '));

// --- approval switch -------------------------------------------------------
// Fail safe (issue #127): only an explicit true shows lines that are not approved.
$approvals = [lt_item('lt-001', 'A.', [], true), lt_item('lt-002', 'B.', [], false), lt_item('lt-003', 'C.', [3], true)];
$warning = 'lightness: WARNING: display.show_unapproved is missing or not true/false in';
lt_check('show_unapproved true: all items', 3, count(af_lightness_items(lt_data($approvals, ['display' => ['show_unapproved' => true]]))));
lt_check('show_unapproved true: no log noise', '', lt_log());
lt_check('show_unapproved false: only approved items', ['lt-001', 'lt-003'], array_column(af_lightness_items(lt_data($approvals, ['display' => ['show_unapproved' => false]])), 'id'));
lt_check('show_unapproved false: no log noise when some remain', '', lt_log());
lt_check('show_unapproved false with nothing approved: empty list', [], af_lightness_items(lt_data([lt_item('lt-001', 'A.')], ['display' => ['show_unapproved' => false]])));
$log = lt_log();
lt_check('show_unapproved false with nothing approved: logged', true, str_contains($log, 'lightness: no displayable items in'));
lt_check('show_unapproved false: an explicit false is not a warning', false, str_contains($log, $warning));

lt_check('key missing: only approved items load', ['lt-001', 'lt-003'], array_column(af_lightness_items(lt_data($approvals)), 'id'));
$log = lt_log();
lt_check('key missing: a warning is logged', true, str_contains($log, $warning));
lt_check('key missing with approved items left: nothing else is logged', false, str_contains($log, 'no displayable items'));
lt_check('key missing, nothing approved: empty list', [], af_lightness_items(lt_data([lt_item('lt-001', 'A.')])));
$log = lt_log();
lt_check('key missing, nothing approved: the warning is logged', true, str_contains($log, $warning));
lt_check('key missing, nothing approved: the empty result is logged too', true, str_contains($log, 'lightness: no displayable items in'));
lt_check('display present but the key is missing: only approved items load', ['lt-001', 'lt-003'], array_column(af_lightness_items(lt_data($approvals, ['display' => ['note' => 'x']])), 'id'));
lt_check('display present but the key is missing: warned', true, str_contains(lt_log(), $warning));

foreach (['string "true"' => 'true', 'string "yes"' => 'yes', 'number 1' => 1, 'null' => null, 'a list' => [true], 'an empty string' => ''] as $label => $value) {
    lt_check("show_unapproved is $label: only approved items load", ['lt-001', 'lt-003'], array_column(af_lightness_items(lt_data($approvals, ['display' => ['show_unapproved' => $value]])), 'id'));
    lt_check("show_unapproved is $label: warned", true, str_contains(lt_log(), $warning));
}
lt_check('a display value of the wrong type hides lines that are not approved', 0, count(af_lightness_items(lt_data([lt_item('lt-001', 'A.')], ['display' => 'oops']))));
$log = lt_log();
lt_check('a display value of the wrong type is warned about', true, str_contains($log, $warning));

// --- the JSON literal inside <script> -------------------------------------
$nasty = "</script><script>alert(1)</script> & 'quote' \"double\"";
$json = af_lightness_json(lt_open([lt_item('lt-001', $nasty, [1])]));
lt_check('script literal: no raw angle brackets', false, strpbrk($json, '<>') !== false);
lt_check('script literal: no raw ampersand or quotes inside the text', false, str_contains($json, '&') || str_contains($json, "'"));
$decoded = json_decode($json, true);
lt_check('script literal: decodes back to the same text', $nasty, $decoded[0]['text'] ?? null);
lt_check('script literal: missing file gives []', '[]', af_lightness_json('/nonexistent/lightness.json'));
lt_log();

// --- the real data file -----------------------------------------------------
$real = af_lightness_items(__DIR__ . '/../../data/exercises/lightness.json');
lt_check('real file: 100 items load', 100, count($real));
lt_check('real file: ids are unique', 100, count(array_unique(array_column($real, 'id'))));
lt_check('real file: nothing logged', '', lt_log());

unlink($logFile);
echo "\n$passed passed, $failures failed\n";
exit($failures === 0 ? 0 : 1);
