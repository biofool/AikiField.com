<?php
/**
 * Post-log "lightness" lines for Twenty Practices (issue #110).
 *
 * games/exercises/data/lightness.json holds short, kind lines. The page shows
 * one after a member logs a session. The page must keep working when the file
 * is missing or broken, so every failure is logged and an empty list comes
 * back. Nothing here ever throws.
 *
 * Tests: tests/unit/test-lightness-loader.php (loader),
 *        tests/unit/test_lightness_data.py (data rules).
 */

declare(strict_types=1);

/**
 * Why one item is unusable, or null when it is fine.
 *
 * @param mixed $item
 */
function af_lightness_problem($item): ?string
{
    if (!is_array($item)) {
        return 'not an object';
    }
    if (!isset($item['id']) || !is_string($item['id']) || trim($item['id']) === '') {
        return 'missing id';
    }
    if (!isset($item['text']) || !is_string($item['text']) || trim($item['text']) === '') {
        return 'missing text';
    }
    if (!isset($item['practices']) || !is_array($item['practices'])) {
        return 'practices must be a list';
    }
    foreach ($item['practices'] as $practice) {
        if (!is_int($practice) || $practice < 1) {
            return 'practices must be positive integers';
        }
    }
    return null;
}

/**
 * The lines the page may show.
 *
 * Honors display.show_unapproved in the data file: when it is false, only
 * items with approved === true come back.
 *
 * @return list<array{id:string,text:string,practices:list<int>}>
 */
function af_lightness_items(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        error_log("lightness: data file missing or unreadable: $path");
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        error_log("lightness: could not read data file: $path");
        return [];
    }
    try {
        $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        error_log("lightness: invalid JSON in $path: " . $e->getMessage());
        return [];
    }
    if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
        error_log("lightness: no items list in $path");
        return [];
    }

    $showUnapproved = ($data['display']['show_unapproved'] ?? true) !== false;
    $items = [];
    foreach ($data['items'] as $index => $item) {
        $problem = af_lightness_problem($item);
        if ($problem !== null) {
            error_log("lightness: skipping item #$index in $path: $problem");
            continue;
        }
        if (!$showUnapproved && ($item['approved'] ?? false) !== true) {
            continue;
        }
        $items[] = [
            'id' => $item['id'],
            'text' => $item['text'],
            'practices' => array_values($item['practices']),
        ];
    }
    if ($items === []) {
        error_log("lightness: no displayable items in $path");
    }
    return $items;
}

/**
 * The same lines as a JSON literal that is safe inside a <script> block
 * (<, >, &, ' and " are escaped). Falls back to "[]" and logs on failure.
 */
function af_lightness_json(string $path): string
{
    $json = json_encode(
        af_lightness_items($path),
        JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );
    if ($json === false) {
        error_log('lightness: could not encode items as JSON: ' . json_last_error_msg());
        return '[]';
    }
    return $json;
}
