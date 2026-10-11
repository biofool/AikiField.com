<?php
/**
 * Tests for the Ask AikiField knowledge layer (issue #65).
 *
 * Run: php tests/test_ask.php
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/ask-lib.php';

$PASS = 0;
$FAIL = 0;

function ok(bool $cond, string $label): void
{
    global $PASS, $FAIL;
    if ($cond) {
        $PASS++;
        echo "  PASS  $label\n";
    } else {
        $FAIL++;
        echo "  FAIL  $label\n";
    }
}

echo "validate\n";
$errors = ask_validate();
ok($errors === [], 'validator reports no errors' . ($errors ? ': ' . $errors[0] : ''));

echo "published emit rules\n";
$published = ask_published_answers();
ok(isset($published['what-is-quantum-aikido']), 'ported QA record is published');
ok(isset($published['what-is-aikifield']), 'new AikiField record is published');
ok(!isset($published['aikido-as-extraordinary-listening']), 'unreviewed video is not published');

$paths = ask_all_published_paths();
ok(in_array('questions/what-is-quantum-aikido', $paths, true), 'published QA question is in emit list');
ok(in_array('questions/what-is-aikifield', $paths, true), 'published AF question is in emit list');

echo "html anatomy\n";
ob_start();
ask_render_document('questions/what-is-aikifield');
$html = ob_get_clean();
ok(str_contains($html, 'AikiField'), 'answer text is in the HTML');
ok(str_contains($html, 'application/ld+json'), 'JSON-LD is present');
ok(str_contains($html, '"@type": "QAPage"') || str_contains($html, '"@type":"QAPage"'), 'JSON-LD type is QAPage');
ok(str_contains($html, 'rel="canonical"'), 'canonical link is present');
ok(str_contains($html, 'https://aikifield.com/ask/questions/what-is-aikifield'), 'canonical host is aikifield.com/ask');
ok(str_contains($html, 'index, follow'), 'public pages are indexable');
ok(str_contains($html, 'not a person speaking') || str_contains($html, 'AI-assisted editorial'), 'AI disclosure is visible');

$ldStart = strpos($html, '<script type="application/ld+json">');
ok($ldStart !== false, 'JSON-LD script tag exists');
if ($ldStart !== false) {
    $ldStart = strpos($html, '>', $ldStart) + 1;
    $ldEnd = strpos($html, '</script>', $ldStart);
    $ld = json_decode(substr($html, $ldStart, $ldEnd - $ldStart), true);
    ok(is_array($ld), 'JSON-LD parses');
    $types = [];
    array_walk_recursive($ld, static function ($v, $k) use (&$types) {
        if ($k === '@type') {
            $types[] = $v;
        }
    });
    ok(in_array('Organization', $types, true), 'AF record attributes to Organization');
}

echo "attribution\n";
ob_start();
ask_render_document('questions/what-is-quantum-aikido');
$qaHtml = ob_get_clean();
ok(str_contains($qaHtml, 'quantumaikido.com/#author'), 'QA record keeps Richard Moon Person @id');

echo "\n$PASS passed, $FAIL failed\n";
exit($FAIL ? 1 : 0);
