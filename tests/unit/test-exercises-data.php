<?php
/**
 * Standalone unit tests for includes/exercises-data.php (issue #114): the
 * loader behind /games/exercises/ and the rule for what each visitor may see.
 *
 * Acceptance criteria under test:
 *   - an anonymous visitor gets the practices marked free in full and every
 *     other practice as a stub (id, title, part) and nothing else;
 *   - a member gets every practice in full;
 *   - a field added to the data later never reaches an anonymous visitor
 *     unless someone adds it to the stub allowlist;
 *   - a missing or broken data file gives an empty list and a log line,
 *     never an exception;
 *   - the JSON literal embedded in the page cannot close the <script> block.
 *
 * Usage:
 *   php tests/unit/test-exercises-data.php
 *
 * Exit code 0 = all assertions passed. Exit code 1 = at least one failure.
 */

declare(strict_types=1);

require __DIR__ . '/../../includes/exercises-data.php';

$failures = 0;
$passed = 0;

/**
 * @param mixed $expected
 * @param mixed $actual
 */
function ex_check(string $label, $expected, $actual): void
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

$logFile = tempnam(sys_get_temp_dir(), 'exlog');
ini_set('log_errors', '1');
ini_set('error_log', $logFile);

/** Everything logged since the last call. */
function ex_log(): string
{
    global $logFile;
    clearstatcache();
    $text = (string) file_get_contents($logFile);
    file_put_contents($logFile, '');
    return $text;
}

function ex_file(string $content): string
{
    $path = tempnam(sys_get_temp_dir(), 'exdata');
    file_put_contents($path, $content);
    return $path;
}

function ex_data(array $practices): string
{
    return ex_file((string) json_encode(['practices' => $practices]));
}

/** @return array<string,mixed> */
function ex_item(int $id, string $title, array $extra = []): array
{
    return $extra + [
        'id' => $id,
        'title' => $title,
        'meta' => "Meta of $title",
        'body' => "Body of $title.\n\nSecond paragraph.",
        'complexity' => 2,
        'type' => 'exercise',
        'part' => 'Part I — centering & grounding',
    ];
}

// --- a good file -----------------------------------------------------------
$good = ex_data([
    ex_item(1, 'One', ['free' => true]),
    ex_item(2, 'Two'),
    ex_item(3, 'Three', ['free' => false]),
]);
$all = af_exercises_load($good);
ex_check('good file: all practices come back in order', [1, 2, 3], array_column($all, 'id'));
ex_check('good file: free is a boolean on every practice', [true, false, false], array_column($all, 'free'));
ex_check('good file: the text is untouched', "Body of Two.\n\nSecond paragraph.", $all[1]['body']);
ex_check('good file: nothing logged', '', ex_log());

// --- who sees what ----------------------------------------------------------
$member = af_exercises_visible($all, true);
ex_check('member: every practice in full', $all, $member);

$anon = af_exercises_visible($all, false);
ex_check('anonymous: same number of entries, same order', [1, 2, 3], array_column($anon, 'id'));
ex_check('anonymous: a free practice is complete', $all[0], $anon[0]);
ex_check('anonymous: a locked practice is a stub with exactly id, title, part', ['id', 'part', 'title'], (function () use ($anon) {
    $keys = array_keys($anon[1]);
    sort($keys);
    return $keys;
})());
ex_check('anonymous: the stub keeps title and part', ['Two', 'Part I — centering & grounding'], [$anon[1]['title'], $anon[1]['part']]);
ex_check('anonymous: an explicit free:false is a stub too', ['id', 'part', 'title'], (function () use ($anon) {
    $keys = array_keys($anon[2]);
    sort($keys);
    return $keys;
})());

$serialized = (string) json_encode($anon);
ex_check('anonymous: no locked meta or body anywhere in the payload', false, str_contains($serialized, 'Meta of Two') || str_contains($serialized, 'Body of Two') || str_contains($serialized, 'Body of Three'));
ex_check('anonymous: the free practice text is in the payload', true, str_contains($serialized, 'Body of One'));

// A field added to the data later must stay on the server for a stub.
$future = ex_data([ex_item(1, 'One', ['free' => true, 'video' => 'v1', 'steps' => ['a']]), ex_item(2, 'Two', ['video' => 'secret-video', 'steps' => ['secret step'], 'guide' => ['duration_sec' => 60], 'notes' => 'secret note'])]);
$futureAnon = af_exercises_visible(af_exercises_load($future), false);
ex_check('future fields: a free practice keeps them', 'v1', $futureAnon[0]['video'] ?? null);
$futureJson = (string) json_encode($futureAnon[1]);
ex_check('future fields: a stub gets none of them', false, str_contains($futureJson, 'secret') || str_contains($futureJson, 'duration_sec'));
ex_check('future fields: the stub allowlist is exactly id, title, part', ['id', 'title', 'part'], AF_EXERCISES_STUB_KEYS);
ex_log();

// --- only a real boolean true makes a practice free ---------------------------
$tricky = ex_data([
    ex_item(1, 'String yes', ['free' => 'yes']),
    ex_item(2, 'Number one', ['free' => 1]),
    ex_item(3, 'String true', ['free' => 'true']),
    ex_item(4, 'List', ['free' => [true]]),
    ex_item(5, 'Real true', ['free' => true]),
]);
$trickyAll = af_exercises_load($tricky);
ex_check('free must be exactly true: only the real boolean counts', [false, false, false, false, true], array_column($trickyAll, 'free'));
ex_check('free of the wrong type is logged for each practice', 4, substr_count(ex_log(), 'free must be true or false'));
$trickyAnon = af_exercises_visible($trickyAll, false);
ex_check('free of the wrong type: those practices are stubs for an anonymous visitor', [false, false, false, false, true], array_map(fn ($p) => isset($p['body']), $trickyAnon));

// --- missing, unreadable and broken files -------------------------------------
ex_check('missing file: empty list', [], af_exercises_load('/nonexistent/practices.json'));
ex_check('missing file: logged with the path', true, str_contains(ex_log(), 'exercises: data file missing or unreadable: /nonexistent/practices.json'));

ex_check('invalid JSON: empty list', [], af_exercises_load(ex_file('{"practices": [')));
ex_check('invalid JSON: logged', true, str_contains(ex_log(), 'exercises: invalid JSON in'));

ex_check('empty file: empty list', [], af_exercises_load(ex_file('')));
ex_check('empty file: logged', true, str_contains(ex_log(), 'exercises: invalid JSON in'));

ex_check('no practices list: empty list', [], af_exercises_load(ex_file('{"version": 1}')));
ex_check('no practices list: logged', true, str_contains(ex_log(), 'exercises: no practices list in'));

ex_check('practices is not a list: empty list', [], af_exercises_load(ex_file('{"practices": "nope"}')));
ex_check('practices is not a list: logged', true, str_contains(ex_log(), 'exercises: no practices list in'));

ex_check('JSON scalar: empty list', [], af_exercises_load(ex_file('42')));
ex_check('JSON scalar: logged', true, str_contains(ex_log(), 'exercises: no practices list in'));

ex_check('every practice bad: empty list', [], af_exercises_load(ex_data(['x'])));
$log = ex_log();
ex_check('every practice bad: the skip and the empty result are logged', true, str_contains($log, 'skipping practice #0') && str_contains($log, 'no usable practices'));

// --- bad practices are skipped one by one, the rest still show ----------------
$mixed = ex_data([
    ex_item(1, 'Fine'),
    ex_item(2, 'No body', ['body' => '']),
    ['id' => 3, 'title' => 'No meta', 'body' => 'x', 'complexity' => 1, 'part' => 'Part I'],
    ex_item(4, 'Bad id', ['id' => '4']),
    ex_item(0, 'Zero id'),
    ex_item(6, 'Bad complexity', ['complexity' => 'high']),
    'just a string',
    ex_item(1, 'Duplicate id'),
    ex_item(9, 'Also fine'),
]);
$kept = af_exercises_load($mixed);
ex_check('mixed file: only the good practices survive', [1, 9], array_column($kept, 'id'));
ex_check('mixed file: the first practice with an id wins', 'Fine', $kept[0]['title']);
$log = ex_log();
ex_check('mixed file: seven skips are logged', 7, substr_count($log, 'exercises: skipping practice #'));
ex_check('mixed file: the log names the reason', true, str_contains($log, 'duplicate id 1') && str_contains($log, 'missing body') && str_contains($log, 'missing meta'));

// --- the JSON literal inside <script> ---------------------------------------------
$nasty = "</script><script>alert(1)</script> & 'quote' \"double\"";
$json = af_exercises_json(af_exercises_visible(af_exercises_load(ex_data([ex_item(1, $nasty, ['free' => true])])), false));
ex_check('script literal: no raw angle brackets', false, strpbrk($json, '<>') !== false);
ex_check('script literal: no raw ampersand or quotes inside the text', false, str_contains($json, '&') || str_contains($json, "'"));
$decoded = json_decode($json, true);
ex_check('script literal: decodes back to the same title', $nasty, $decoded[0]['title'] ?? null);
ex_check('script literal: an empty list is []', '[]', af_exercises_json([]));
ex_log();

// --- the real data file -------------------------------------------------------------
$real = af_exercises_load(__DIR__ . '/../../data/exercises/practices.json');
ex_check('real file: 15 practices load', 15, count($real));
ex_check('real file: ids are 1 to 15', range(1, 15), array_column($real, 'id'));
ex_check('real file: nothing logged', '', ex_log());
ex_check('real file: exactly practices 1, 6 and 12 are free', [1, 6, 12], array_values(array_column(array_filter($real, fn ($p) => $p['free']), 'id')));

$realAnon = af_exercises_visible($real, false);
ex_check('real file, anonymous: 15 entries', 15, count($realAnon));
$fullIds = [];
foreach ($realAnon as $entry) {
    if (isset($entry['body'])) {
        $fullIds[] = $entry['id'];
    }
}
ex_check('real file, anonymous: only practices 1, 6 and 12 carry text', [1, 6, 12], $fullIds);
$anonJson = af_exercises_json($realAnon);
// A phrase that a free practice also uses (a shared source title, say) is fine.
$freeText = '';
foreach ($real as $practice) {
    if ($practice['free']) {
        $freeText .= "\n" . $practice['title'] . "\n" . $practice['meta'] . "\n" . $practice['body'];
    }
}
$leaks = [];
foreach ($real as $practice) {
    if ($practice['free']) {
        continue;
    }
    // Plain-character runs survive JSON escaping, so they can be searched for.
    foreach (['body' => '/[A-Za-z0-9 ,.]{25,}/', 'meta' => '/[A-Za-z0-9 ,.-]{15,}/'] as $field => $pattern) {
        preg_match_all($pattern, $practice[$field], $runs);
        foreach ($runs[0] as $run) {
            if (!str_contains($freeText, $run) && str_contains($anonJson, $run)) {
                $leaks[] = $practice['id'] . " ($field)";
            }
        }
    }
}
ex_check('real file, anonymous: no sentence of a locked body or meta is in the payload', [], $leaks);
ex_check('real file, member: all 15 carry text', 15, count(array_filter(af_exercises_visible($real, true), fn ($p) => isset($p['body']))));

// --- the guide block: Play Guided data (issue #113) ------------------------------
$validGuide = [
    'duration_sec' => 300,
    'phase' => 'Phase: start',
    'prompt' => 'Begin',
    'meter' => ['start' => 50, 'goal' => 60, 'caption' => '{value}% of {goal}%'],
    'steps' => [
        ['at_sec' => 15, 'prompt' => 'One', 'phase' => 'A', 'meter' => 50],
        ['at_sec' => 30, 'prompt' => 'Two'],
        ['at_sec' => 120, 'meter' => 55],
    ],
];
ex_check('guide: a complete guide is fine', null, af_exercises_guide_problem($validGuide));
ex_check('guide: duration alone is fine', null, af_exercises_guide_problem(['duration_sec' => 30]));
ex_check('guide: the longest allowed session is fine', null, af_exercises_guide_problem(['duration_sec' => AF_EXERCISES_MAX_GUIDE_SEC]));

$badGuides = [
    'not an object' => 'text',
    'no duration' => ['prompt' => 'x'],
    'duration zero' => ['duration_sec' => 0],
    'duration negative' => ['duration_sec' => -5],
    'duration too long' => ['duration_sec' => AF_EXERCISES_MAX_GUIDE_SEC + 1],
    'duration as text' => ['duration_sec' => '300'],
    'duration as float' => ['duration_sec' => 30.5],
    'phase not text' => ['duration_sec' => 30, 'phase' => 5],
    'prompt not text' => ['duration_sec' => 30, 'prompt' => ['x']],
    'meter not an object' => ['duration_sec' => 30, 'meter' => 50],
    'meter start out of range' => ['duration_sec' => 30, 'meter' => ['start' => 101, 'goal' => 60, 'caption' => 'c']],
    'meter goal missing' => ['duration_sec' => 30, 'meter' => ['start' => 50, 'caption' => 'c']],
    'meter caption missing' => ['duration_sec' => 30, 'meter' => ['start' => 50, 'goal' => 60]],
    'steps not a list' => ['duration_sec' => 30, 'steps' => ['a' => ['at_sec' => 5]]],
    'step not an object' => ['duration_sec' => 30, 'steps' => ['x']],
    'step without at_sec' => ['duration_sec' => 30, 'steps' => [['prompt' => 'x']]],
    'step at zero' => ['duration_sec' => 30, 'steps' => [['at_sec' => 0, 'prompt' => 'x']]],
    'step not after the previous one' => ['duration_sec' => 30, 'steps' => [['at_sec' => 10], ['at_sec' => 10]]],
    'steps out of order' => ['duration_sec' => 30, 'steps' => [['at_sec' => 20], ['at_sec' => 10]]],
    'step at the end' => ['duration_sec' => 30, 'steps' => [['at_sec' => 30, 'prompt' => 'x']]],
    'step prompt not text' => ['duration_sec' => 30, 'steps' => [['at_sec' => 5, 'prompt' => 7]]],
    'step phase not text' => ['duration_sec' => 30, 'steps' => [['at_sec' => 5, 'phase' => 7]]],
    'step meter without a guide meter' => ['duration_sec' => 30, 'steps' => [['at_sec' => 5, 'meter' => 50]]],
    'step meter out of range' => ['duration_sec' => 30, 'meter' => ['start' => 1, 'goal' => 2, 'caption' => 'c'], 'steps' => [['at_sec' => 5, 'meter' => 101]]],
];
foreach ($badGuides as $label => $guide) {
    ex_check("guide: $label is refused", true, af_exercises_guide_problem($guide) !== null);
}

$withGuides = af_exercises_load(ex_data([
    ex_item(1, 'Good guide', ['free' => true, 'guide' => $validGuide]),
    ex_item(2, 'Bad guide', ['free' => true, 'guide' => ['duration_sec' => 0]]),
    ex_item(3, 'No guide', ['free' => true]),
    ex_item(4, 'Locked with a guide', ['guide' => $validGuide]),
]));
ex_check('guide: a practice with a bad guide is still loaded', [1, 2, 3, 4], array_column($withGuides, 'id'));
ex_check('guide: the good guide is kept as written', $validGuide, $withGuides[0]['guide']);
ex_check('guide: the bad guide is dropped', false, array_key_exists('guide', $withGuides[1]));
ex_check('guide: a practice without a guide stays without one', false, array_key_exists('guide', $withGuides[2]));
$guideLog = ex_log();
ex_check('guide: the drop is logged with the practice and the reason', true, str_contains($guideLog, 'practice 2 in') && str_contains($guideLog, 'guide dropped: duration_sec must be a whole number'));
ex_check('guide: only the bad guide is logged', 1, substr_count($guideLog, 'guide dropped'));
$guideAnon = af_exercises_visible($withGuides, false);
ex_check('guide: a free practice sends its guide to an anonymous visitor', $validGuide, $guideAnon[0]['guide']);
ex_check('guide: a locked practice sends no guide to an anonymous visitor', ['id', 'part', 'title'], (function () use ($guideAnon) {
    $keys = array_keys($guideAnon[3]);
    sort($keys);
    return $keys;
})());
ex_check('guide: a member gets the locked practice guide too', $validGuide, af_exercises_visible($withGuides, true)[3]['guide']);

$realWithGuides = af_exercises_load(__DIR__ . '/../../data/exercises/practices.json');
ex_check('real file: every practice keeps a guide with a duration', 15, count(array_filter($realWithGuides, fn ($p) => isset($p['guide']['duration_sec']))));
ex_check('real file: nothing was logged while loading the guides', '', ex_log());
$wrist = array_values(array_filter($realWithGuides, fn ($p) => $p['id'] === 6))[0];
ex_check('real file: Wrist Grab Grounding keeps its steps and meter', [true, true], [count($wrist['guide']['steps']) > 0, isset($wrist['guide']['meter'])]);

// --- the studio list (issue #112) ------------------------------------------------
function ex_studio_file(array $studios): string
{
    return ex_file((string) json_encode(['studios' => $studios]));
}

$studios = af_exercises_studios(ex_studio_file([
    ['name' => 'City Aikido', 'region' => 'SF Bay', 'cat' => 'Aikido dojo', 'about' => '1514 University Ave, a blurb', 'address' => '182 Thorndon Quay'],
    ['name' => '  Padded Name  ', 'region' => ''],
    ['name' => 'No Region'],
    ['name' => '', 'region' => 'Nowhere'],
    ['region' => 'No name'],
    'just a string',
    ['name' => 42, 'region' => 'Bad name'],
    ['name' => 'Bad Region', 'region' => ['x']],
]));
ex_check('studios: usable studios survive in order', ['City Aikido', 'Padded Name', 'No Region', 'Bad Region'], array_column($studios, 'name'));
ex_check('studios: only name and region are kept', ['name', 'region'], array_keys($studios[0]));
ex_check('studios: nothing but the name and region is in the payload', false, str_contains((string) json_encode($studios), 'University') || str_contains((string) json_encode($studios), 'Thorndon') || str_contains((string) json_encode($studios), 'blurb') || str_contains((string) json_encode($studios), 'Aikido dojo'));
ex_check('studios: an empty or missing region leaves the key out', [['name' => 'Padded Name'], ['name' => 'No Region'], ['name' => 'Bad Region']], array_slice($studios, 1));
$log = ex_log();
ex_check('studios: four bad entries are logged', 4, substr_count($log, 'exercises: skipping studio #'));
ex_check('studios: missing file is logged and empty', [[], true], [af_exercises_studios('/nonexistent/studios.json'), str_contains(ex_log(), 'exercises: studio file missing or unreadable: /nonexistent/studios.json')]);
ex_check('studios: invalid JSON is empty', [], af_exercises_studios(ex_file('{"studios": [')));
ex_check('studios: invalid JSON is logged', true, str_contains(ex_log(), 'exercises: invalid JSON in'));
ex_check('studios: no list is empty', [], af_exercises_studios(ex_file('{"version": 1}')));
ex_check('studios: no list is logged', true, str_contains(ex_log(), 'exercises: no studios list in'));
ex_check('studios: only bad entries is empty', [], af_exercises_studios(ex_studio_file(['x'])));
ex_check('studios: only bad entries logs the empty result', true, str_contains(ex_log(), 'exercises: no usable studios in'));

$realStudios = af_exercises_studios(__DIR__ . '/../../data/exercises/studios.json');
ex_check('real studios: 20 load', 20, count($realStudios));
ex_check('real studios: nothing logged', '', ex_log());
ex_check('real studios: every one has a name and a region and nothing else', true, (function () use ($realStudios) {
    foreach ($realStudios as $studio) {
        $keys = array_keys($studio);
        sort($keys);
        if ($keys !== ['name', 'region']) {
            return false;
        }
    }
    return true;
})());
ex_check('real studios: names are unique', 20, count(array_unique(array_column($realStudios, 'name'))));

unlink($logFile);
echo "\n$passed passed, $failures failed\n";
exit($failures === 0 ? 0 : 1);
