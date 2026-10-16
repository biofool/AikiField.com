<?php
/**
 * Twenty Practices data for /games/exercises/ (issue #114).
 *
 * data/exercises/practices.json holds the practice text. That directory is
 * denied to the web (data/exercises/.htaccess), so the text leaves the server
 * only through games/exercises/index.php, which asks this file what the
 * visitor may see:
 *
 *   - a signed-in member gets every practice in full;
 *   - everyone else gets the practices marked "free": true in full, and every
 *     other practice as a stub: id, title and part, with no meta, no body and
 *     nothing else.
 *
 * A stub is built from an allowlist (AF_EXERCISES_STUB_KEYS). A field added to
 * the data later (steps, video, a guide, ...) therefore stays on the server
 * until someone adds it to that list on purpose.
 *
 * The page shows a plain message when the file is missing or broken, so every
 * failure is logged and an empty list comes back. Nothing here ever throws.
 *
 * The studio list (data/exercises/studios.json, issue #112) is loaded the same
 * way. Only a studio's name and region are ever sent to the page: anything else
 * in the file (an address, a description) stays on the server.
 *
 * Tests: tests/unit/test-exercises-data.php (loader and visibility),
 *        tests/unit/test_exercises_data.py (data rules),
 *        tests/e2e/specs/exercises-preview.spec.js (every route).
 */

declare(strict_types=1);

/** The only fields an anonymous visitor gets for a practice that is not free. */
const AF_EXERCISES_STUB_KEYS = ['id', 'title', 'part'];

/** The longest Play Guided session the data may ask for (two hours). */
const AF_EXERCISES_MAX_GUIDE_SEC = 7200;

/**
 * Why one practice is unusable, or null when it is fine.
 *
 * @param mixed $item
 */
function af_exercises_problem($item): ?string
{
    if (!is_array($item)) {
        return 'not an object';
    }
    if (!isset($item['id']) || !is_int($item['id']) || $item['id'] < 1) {
        return 'id must be a positive integer';
    }
    foreach (['title', 'meta', 'body', 'part'] as $key) {
        if (!isset($item[$key]) || !is_string($item[$key]) || trim($item[$key]) === '') {
            return "missing $key";
        }
    }
    if (!isset($item['complexity']) || !is_int($item['complexity']) || $item['complexity'] < 1) {
        return 'complexity must be a positive integer';
    }
    return null;
}

/**
 * Why a practice's "guide" (the Play Guided timer data, issue #113) is unusable,
 * or null when it is fine. A guide has a duration in seconds and, optionally,
 * an opening phase and prompt, a meter, and timed steps. Each step names the
 * second it starts at and may change the phase, the prompt or the meter.
 *
 * @param mixed $guide
 */
function af_exercises_guide_problem($guide): ?string
{
    if (!is_array($guide)) {
        return 'guide must be an object';
    }
    $duration = $guide['duration_sec'] ?? null;
    if (!is_int($duration) || $duration < 1 || $duration > AF_EXERCISES_MAX_GUIDE_SEC) {
        return 'duration_sec must be a whole number of seconds from 1 to ' . AF_EXERCISES_MAX_GUIDE_SEC;
    }
    foreach (['phase', 'prompt'] as $key) {
        if (array_key_exists($key, $guide) && !is_string($guide[$key])) {
            return "$key must be text";
        }
    }
    $hasMeter = array_key_exists('meter', $guide);
    if ($hasMeter) {
        $meter = $guide['meter'];
        if (!is_array($meter)) {
            return 'meter must be an object';
        }
        foreach (['start', 'goal'] as $key) {
            if (!isset($meter[$key]) || !is_int($meter[$key]) || $meter[$key] < 0 || $meter[$key] > 100) {
                return "meter.$key must be a whole number from 0 to 100";
            }
        }
        if (!isset($meter['caption']) || !is_string($meter['caption'])) {
            return 'meter.caption must be text';
        }
    }
    if (array_key_exists('steps', $guide)) {
        $steps = $guide['steps'];
        if (!is_array($steps) || $steps !== array_values($steps)) {
            return 'steps must be a list';
        }
        $previous = 0;
        foreach ($steps as $index => $step) {
            if (!is_array($step)) {
                return "step #$index is not an object";
            }
            $at = $step['at_sec'] ?? null;
            if (!is_int($at) || $at <= $previous || $at >= $duration) {
                return "step #$index: at_sec must be a whole number after the previous step and before duration_sec";
            }
            $previous = $at;
            foreach (['phase', 'prompt'] as $key) {
                if (array_key_exists($key, $step) && !is_string($step[$key])) {
                    return "step #$index: $key must be text";
                }
            }
            if (array_key_exists('meter', $step)) {
                if (!$hasMeter) {
                    return "step #$index: meter needs a guide.meter";
                }
                if (!is_int($step['meter']) || $step['meter'] < 0 || $step['meter'] > 100) {
                    return "step #$index: meter must be a whole number from 0 to 100";
                }
            }
        }
    }
    return null;
}

/**
 * Every usable practice in the data file, in file order. Each one carries a
 * boolean "free" that is true only when the data says exactly true.
 *
 * @return list<array<string,mixed>>
 */
function af_exercises_load(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        error_log("exercises: data file missing or unreadable: $path");
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        error_log("exercises: could not read data file: $path");
        return [];
    }
    try {
        $data = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        error_log("exercises: invalid JSON in $path: " . $e->getMessage());
        return [];
    }
    if (!is_array($data) || !isset($data['practices']) || !is_array($data['practices'])) {
        error_log("exercises: no practices list in $path");
        return [];
    }

    $practices = [];
    $seen = [];
    foreach ($data['practices'] as $index => $item) {
        $problem = af_exercises_problem($item);
        if ($problem !== null) {
            error_log("exercises: skipping practice #$index in $path: $problem");
            continue;
        }
        if (isset($seen[$item['id']])) {
            error_log("exercises: skipping practice #$index in $path: duplicate id {$item['id']}");
            continue;
        }
        $seen[$item['id']] = true;
        $free = $item['free'] ?? false;
        if (!is_bool($free)) {
            error_log("exercises: practice {$item['id']} in $path: free must be true or false; treating it as not free");
            $free = false;
        }
        $item['free'] = $free;
        if (array_key_exists('guide', $item)) {
            $guideProblem = af_exercises_guide_problem($item['guide']);
            if ($guideProblem !== null) {
                error_log("exercises: practice {$item['id']} in $path: guide dropped: $guideProblem");
                unset($item['guide']);
            }
        }
        $practices[] = $item;
    }
    if ($practices === []) {
        error_log("exercises: no usable practices in $path");
    }
    return $practices;
}

/**
 * What a visitor may be sent. $member is true only for a visitor who passed
 * the session gate; everything else is treated as anonymous.
 *
 * @param list<array<string,mixed>> $practices from af_exercises_load()
 * @return list<array<string,mixed>>
 */
function af_exercises_visible(array $practices, bool $member): array
{
    if ($member) {
        return $practices;
    }
    $visible = [];
    foreach ($practices as $practice) {
        if (($practice['free'] ?? false) === true) {
            $visible[] = $practice;
            continue;
        }
        $stub = [];
        foreach (AF_EXERCISES_STUB_KEYS as $key) {
            $stub[$key] = $practice[$key];
        }
        $visible[] = $stub;
    }
    return $visible;
}

/**
 * The same list as a JSON literal that is safe inside a <script> block
 * (<, >, &, ' and " are escaped). Falls back to "[]" and logs on failure.
 *
 * @param list<array<string,mixed>> $practices
 */
function af_exercises_json(array $practices): string
{
    $json = json_encode(
        $practices,
        JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );
    if ($json === false) {
        error_log('exercises: could not encode practices as JSON: ' . json_last_error_msg());
        return '[]';
    }
    return $json;
}

/**
 * The studios the page may list: name and region only, in file order. A studio
 * without a name is skipped and logged; a missing region is left out. Anything
 * else in the file is dropped here on purpose.
 *
 * @return list<array{name:string,region?:string}>
 */
function af_exercises_studios(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        error_log("exercises: studio file missing or unreadable: $path");
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        error_log("exercises: could not read studio file: $path");
        return [];
    }
    try {
        $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        error_log("exercises: invalid JSON in $path: " . $e->getMessage());
        return [];
    }
    if (!is_array($data) || !isset($data['studios']) || !is_array($data['studios'])) {
        error_log("exercises: no studios list in $path");
        return [];
    }

    $studios = [];
    foreach ($data['studios'] as $index => $item) {
        if (!is_array($item) || !isset($item['name']) || !is_string($item['name']) || trim($item['name']) === '') {
            error_log("exercises: skipping studio #$index in $path: missing name");
            continue;
        }
        $studio = ['name' => trim($item['name'])];
        if (isset($item['region']) && is_string($item['region']) && trim($item['region']) !== '') {
            $studio['region'] = trim($item['region']);
        }
        $studios[] = $studio;
    }
    if ($studios === []) {
        error_log("exercises: no usable studios in $path");
    }
    return $studios;
}
