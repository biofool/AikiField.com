<?php
/**
 * AikiField AEO knowledge layer — load, validate, and render (issue #65).
 *
 * Ported from quantumaikido.com includes/ask-richard-moon-lib.php.
 * Two corpora share one pipeline:
 *   - records with "attribution": "richard-moon" are the Quantum Aikido /
 *     Richard Moon Q&A ported from quantumaikido.com (their sources stay
 *     cited to quantumaikido.com public pages)
 *   - records with "attribution": "aikifield" (or absent) are AikiField's
 *     own sourced Q&A from public aikifield.com pages
 *
 * Public URL prefix: /ask/ (no sign-in). /AEO/ is the gated review index.
 * Only records with review_status "published" emit public HTML.
 */

declare(strict_types=1);

const ASK_REVIEW_PUBLISHED = 'published';
const ASK_BASE_PATH = '/ask';
const ASK_CANONICAL_HOST = 'https://aikifield.com';

// Question-kind slugs surfaced on the /ask/concepts/ index.
const ASK_CONCEPT_SLUGS = [
    'what-is-the-quantum-pause',
    'what-is-wigo',
    'what-is-quantum-aikido',
    'how-are-awareness-and-response-related',
];

function ask_root(): string
{
    return dirname(__DIR__);
}

function ask_data_dir(): string
{
    return ask_root() . '/data/ask';
}

function ask_h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function ask_load_json_dir(string $dir): array
{
    $out = [];
    if (!is_dir($dir)) {
        return $out;
    }
    foreach (glob($dir . '/*.json') ?: [] as $file) {
        $raw = file_get_contents($file);
        if ($raw === false) {
            error_log('ask: failed to read ' . $file);
            continue;
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            error_log('ask: invalid JSON in ' . $file);
            continue;
        }
        $data['_file'] = basename($file);
        $out[] = $data;
    }
    return $out;
}

function ask_sources(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $byId = [];
    foreach (ask_load_json_dir(ask_data_dir() . '/sources') as $row) {
        if (!empty($row['source_id'])) {
            $byId[$row['source_id']] = $row;
        }
    }
    $cache = $byId;
    return $cache;
}

function ask_answers(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $bySlug = [];
    foreach (ask_load_json_dir(ask_data_dir() . '/answers') as $row) {
        if (!empty($row['canonical_slug'])) {
            $bySlug[$row['canonical_slug']] = $row;
        }
    }
    $cache = $bySlug;
    return $cache;
}

function ask_published_answers(?string $kind = null): array
{
    $rows = [];
    foreach (ask_answers() as $slug => $row) {
        if (($row['review_status'] ?? '') !== ASK_REVIEW_PUBLISHED) {
            continue;
        }
        if ($kind !== null && ($row['kind'] ?? '') !== $kind) {
            continue;
        }
        $rows[$slug] = $row;
    }
    return $rows;
}

/**
 * Validate source/answer records. Returns a list of error strings (empty = ok).
 */
function ask_validate(): array
{
    $errors = [];
    $sources = ask_sources();
    $answers = ask_answers();
    $allowedStatus = ['draft', 'needs_editorial_review', 'reviewed', 'published', 'deprecated'];
    $allowedKinds = ['question', 'book', 'video', 'concept'];
    $allowedAttribution = ['richard-moon', 'aikifield'];

    if ($sources === []) {
        $errors[] = 'No source records found';
    }
    if ($answers === []) {
        $errors[] = 'No answer records found';
    }

    foreach ($sources as $id => $src) {
        foreach (['source_id', 'source_type', 'title', 'public_url', 'license_status', 'exact_source_text'] as $key) {
            if (!isset($src[$key]) || $src[$key] === '') {
                $errors[] = "source {$id}: missing {$key}";
            }
        }
        $text = (string) ($src['exact_source_text'] ?? '');
        if (strlen($text) < 20) {
            $errors[] = "source {$id}: exact_source_text too short";
        }
    }

    foreach ($answers as $slug => $ans) {
        foreach (['question', 'canonical_slug', 'short_answer', 'answer_markdown', 'claims', 'related_questions', 'review_status', 'last_reviewed', 'kind'] as $key) {
            if (!array_key_exists($key, $ans)) {
                $errors[] = "answer {$slug}: missing {$key}";
            }
        }
        if (($ans['canonical_slug'] ?? '') !== $slug) {
            $errors[] = "answer {$slug}: canonical_slug mismatch";
        }
        if (!in_array($ans['review_status'] ?? '', $allowedStatus, true)) {
            $errors[] = "answer {$slug}: bad review_status";
        }
        if (!in_array($ans['kind'] ?? '', $allowedKinds, true)) {
            $errors[] = "answer {$slug}: bad kind";
        }
        $attribution = $ans['attribution'] ?? 'aikifield';
        if (!in_array($attribution, $allowedAttribution, true)) {
            $errors[] = "answer {$slug}: bad attribution {$attribution}";
        }
        $claims = $ans['claims'] ?? [];
        if (!is_array($claims) || $claims === []) {
            $errors[] = "answer {$slug}: claims must be a non-empty array";
            continue;
        }
        foreach ($claims as $i => $claim) {
            $sid = $claim['source_id'] ?? '';
            if ($sid === '' || !isset($sources[$sid])) {
                $errors[] = "answer {$slug} claim {$i}: unknown source_id " . (string) $sid;
                continue;
            }
            $quote = $claim['quote'] ?? '';
            if ($quote !== '') {
                $hay = (string) $sources[$sid]['exact_source_text'];
                if (!str_contains($hay, $quote)) {
                    $errors[] = "answer {$slug} claim {$i}: quote not found in source {$sid}";
                }
            }
        }
        foreach ($ans['related_questions'] ?? [] as $rel) {
            if (!isset($answers[$rel])) {
                $errors[] = "answer {$slug}: related_questions missing record {$rel}";
            }
        }
    }

    return $errors;
}

function ask_md_to_html(string $md): string
{
    $escaped = ask_h($md);
    $escaped = preg_replace('/\*\*(.+?)\*\*/s', '<strong>$1</strong>', $escaped) ?? $escaped;
    $escaped = preg_replace('/\*(.+?)\*/s', '<em>$1</em>', $escaped) ?? $escaped;
    $parts = preg_split("/\n{2,}/", trim($escaped)) ?: [];
    $html = '';
    foreach ($parts as $p) {
        $html .= '<p>' . nl2br(trim($p), false) . "</p>\n";
    }
    return $html;
}

function ask_kind_dir(string $kind): string
{
    if ($kind === 'book') {
        return 'books';
    }
    if ($kind === 'video') {
        return 'videos';
    }
    return 'questions';
}

function ask_url(string $path = ''): string
{
    $path = trim($path, '/');
    return $path === '' ? ASK_BASE_PATH . '/' : ASK_BASE_PATH . '/' . $path;
}

function ask_youtube_watch(string $id, int $t = 0): string
{
    $url = 'https://www.youtube.com/watch?v=' . rawurlencode($id);
    if ($t > 0) {
        $url .= '&t=' . $t . 's';
    }
    return $url;
}

function ask_parse_path(?string $override = null): string
{
    if (is_string($override) && $override !== '') {
        return trim($override, '/');
    }
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
    $needle = '/ask';
    $pos = strpos($uri, $needle);
    if ($pos === false) {
        return '';
    }
    return trim(substr($uri, $pos + strlen($needle)), '/');
}

function ask_page_meta(string $path): array
{
    $path = trim($path, '/');
    if ($path === '' || $path === 'index') {
        return ['type' => 'hub', 'hub' => 'overview', 'title' => 'Ask AikiField'];
    }
    $hubs = [
        'about' => 'About Ask AikiField',
        'how-it-works' => 'How Ask AikiField works',
        'sources' => 'Sources and methodology',
        'books' => 'Books',
        'videos' => 'Videos',
        'concepts' => 'Core concepts',
        'questions' => 'Questions',
    ];
    if (isset($hubs[$path])) {
        return ['type' => 'hub', 'hub' => $path, 'title' => $hubs[$path]];
    }
    if (preg_match('#^(questions|books|videos|concepts)/([a-z0-9-]+)$#', $path, $m)) {
        $slug = $m[2];
        $answers = ask_published_answers();
        if (!isset($answers[$slug])) {
            return ['type' => 'missing', 'title' => 'Not found'];
        }
        return [
            'type' => 'record',
            'kind' => $answers[$slug]['kind'],
            'slug' => $slug,
            'record' => $answers[$slug],
            'title' => $answers[$slug]['question'],
        ];
    }
    return ['type' => 'missing', 'title' => 'Not found'];
}

/**
 * JSON-LD author node for a record: the QA-ported corpus attributes to the
 * Richard Moon Person entity on quantumaikido.com; AikiField's own records
 * attribute to the AikiField Organization entity.
 */
function ask_author_node(string $attribution): array
{
    if ($attribution === 'richard-moon') {
        return [
            '@type' => 'Person',
            '@id' => 'https://quantumaikido.com/#author',
            'name' => 'Richard Moon',
            'url' => 'https://quantumaikido.com/richard-moon',
            'sameAs' => [
                'https://www.youtube.com/@moonsensei',
                'https://www.youtube.com/channel/UCL_IvoqYe6KmHN_K9sEt2qQ',
                'https://www.instagram.com/quantumaikido/',
            ],
        ];
    }
    return [
        '@type' => 'Organization',
        '@id' => ASK_CANONICAL_HOST . '/#org',
        'name' => 'AikiField',
        'url' => ASK_CANONICAL_HOST . '/',
    ];
}

function ask_layer_name(): string
{
    return 'Ask AikiField';
}

function ask_jsonld(array $meta, string $canonical): array
{
    $org = ask_author_node('aikifield');
    $crumbs = [
        '@type' => 'BreadcrumbList',
        'itemListElement' => [
            [
                '@type' => 'ListItem',
                'position' => 1,
                'name' => ask_layer_name(),
                'item' => ASK_CANONICAL_HOST . ask_url(),
            ],
        ],
    ];

    if (($meta['type'] ?? '') === 'record') {
        $rec = $meta['record'];
        $attribution = (string) ($rec['attribution'] ?? 'aikifield');
        $author = ask_author_node($attribution);
        $crumbs['itemListElement'][] = [
            '@type' => 'ListItem',
            'position' => 2,
            'name' => $rec['question'],
            'item' => $canonical,
        ];
        $graph = [$org, $author, $crumbs];
        if (($rec['kind'] ?? '') === 'question') {
            $graph[] = [
                '@type' => 'QAPage',
                '@id' => $canonical . '#webpage',
                'url' => $canonical,
                'name' => $rec['question'],
                'isPartOf' => ['@id' => ASK_CANONICAL_HOST . ask_url() . '#collection'],
                'mainEntity' => [
                    '@type' => 'Question',
                    'name' => $rec['question'],
                    'acceptedAnswer' => [
                        '@type' => 'Answer',
                        'text' => $rec['short_answer'],
                        'author' => ['@id' => $author['@id']],
                    ],
                ],
            ];
        } elseif (($rec['kind'] ?? '') === 'book') {
            $book = [
                '@type' => 'Book',
                '@id' => $canonical . '#book',
                'name' => $rec['question'],
                'author' => ['@id' => $author['@id']],
                'url' => $canonical,
                'description' => $rec['short_answer'],
            ];
            if (!empty($rec['isbn'])) {
                $book['isbn'] = $rec['isbn'];
            }
            $graph[] = $book;
        } elseif (($rec['kind'] ?? '') === 'video') {
            $video = [
                '@type' => 'VideoObject',
                '@id' => $canonical . '#video',
                'name' => $rec['question'],
                'description' => $rec['short_answer'],
                'url' => $canonical,
            ];
            if (!empty($rec['youtube_id'])) {
                $video['embedUrl'] = 'https://www.youtube.com/embed/' . $rec['youtube_id'];
            }
            $graph[] = $video;
        }
        return ['@context' => 'https://schema.org', '@graph' => $graph];
    }

    $collectionDesc = 'Ask AikiField is a sourced Q&A knowledge layer covering AikiField services and Richard Moon&rsquo;s public Quantum Aikido teachings. It is an AI-assisted editorial interface, not a live person speaking.';
    $graph = [
        $org,
        $crumbs,
        [
            '@type' => 'CollectionPage',
            '@id' => $canonical . '#collection',
            'name' => $meta['title'] ?? ask_layer_name(),
            'url' => $canonical,
            'about' => ['@id' => $org['@id']],
            'description' => $collectionDesc,
        ],
    ];
    return ['@context' => 'https://schema.org', '@graph' => $graph];
}

function ask_subnav(string $current): string
{
    $items = [
        '' => 'Overview',
        'questions' => 'Questions',
        'concepts' => 'Concepts',
        'books' => 'Books',
        'videos' => 'Videos',
        'sources' => 'Sources',
        'how-it-works' => 'How it works',
        'about' => 'About',
    ];
    $html = '<nav class="ask-subnav" aria-label="' . ask_h(ask_layer_name()) . '">';
    $html .= '<a class="ask-subnav__chat" href="/members">Unified Field chat</a>';
    foreach ($items as $path => $label) {
        $href = ask_url($path);
        $active = ($current === $path || ($path !== '' && str_starts_with($current, $path . '/')))
            ? ' aria-current="page"' : '';
        $html .= '<a href="' . ask_h($href) . '"' . $active . '>' . ask_h($label) . '</a>';
    }
    $html .= '</nav>';
    return $html;
}

function ask_disclosure(): string
{
    $contact = '/contact.html?subject=' . rawurlencode('Ask AikiField correction');
    return '<aside class="ask-disclosure">'
        . '<p><strong>Ask AikiField</strong> is an AI-assisted editorial knowledge layer built from pages already public on aikifield.com and quantumaikido.com. '
        . 'It is not a person speaking, and it is not the live Unified Field chat.</p>'
        . '<p>Last reviewed dates appear on each answer. '
        . '<a href="' . ask_h($contact) . '">Suggest a correction</a>.</p>'
        . '</aside>';
}

function ask_render_record(array $rec): string
{
    $sources = ask_sources();
    $html = '<article class="ask-answer">';
    $html .= '<p class="ask-kicker">' . ask_h(ucfirst((string) $rec['kind'])) . '</p>';
    $html .= '<h1>' . ask_h($rec['question']) . '</h1>';
    $html .= '<p class="ask-direct-answer">' . ask_h($rec['short_answer']) . '</p>';
    $html .= ask_md_to_html((string) $rec['answer_markdown']);
    if (!empty($rec['lineage_note'])) {
        $html .= '<p class="ask-lineage"><strong>Lineage note:</strong> ' . ask_h($rec['lineage_note']) . '</p>';
    }
    $html .= '<section class="ask-provenance"><h2>Sources</h2><ul>';
    foreach ($rec['claims'] as $claim) {
        $src = $sources[$claim['source_id']] ?? null;
        $html .= '<li><p>' . ask_h($claim['claim']) . '</p>';
        if ($src) {
            $html .= '<p class="ask-src"><a href="' . ask_h($src['public_url']) . '">' . ask_h($src['title']) . '</a>';
            if (!empty($claim['quote'])) {
                $html .= ' &mdash; <q>' . ask_h($claim['quote']) . '</q>';
            }
            $html .= '</p>';
        }
        $html .= '</li>';
    }
    $html .= '</ul></section>';

    if (!empty($rec['youtube_id'])) {
        $src = null;
        foreach ($sources as $s) {
            if (($s['youtube_id'] ?? '') === $rec['youtube_id']) {
                $src = $s;
                break;
            }
        }
        $html .= '<section class="ask-video"><h2>Watch</h2>';
        $html .= '<p><a href="' . ask_h(ask_youtube_watch($rec['youtube_id'])) . '">Open on YouTube</a></p>';
        if ($src && !empty($src['segments'])) {
            $html .= '<ul>';
            foreach ($src['segments'] as $seg) {
                $t = (int) $seg['start_seconds'];
                $html .= '<li><a href="' . ask_h(ask_youtube_watch($rec['youtube_id'], $t)) . '">'
                    . ask_h($seg['label']) . ' (' . $t . 's)</a></li>';
            }
            $html .= '</ul>';
        }
        $html .= '</section>';
    }

    $related = [];
    foreach ($rec['related_questions'] ?? [] as $rel) {
        $other = ask_published_answers()[$rel] ?? null;
        if ($other) {
            $related[] = $other;
        }
    }
    if ($related) {
        $html .= '<section class="ask-related"><h2>Related questions</h2><ul>';
        foreach ($related as $other) {
            $html .= '<li><a href="' . ask_h(ask_url(ask_kind_dir((string) $other['kind']) . '/' . $other['canonical_slug'])) . '">'
                . ask_h($other['question']) . '</a></li>';
        }
        $html .= '</ul></section>';
    }

    $html .= '<p class="ask-reviewed">Last reviewed ' . ask_h($rec['last_reviewed']) . '.</p>';
    $html .= '</article>';
    return $html;
}

function ask_answers_needing_review(): array
{
    $rows = [];
    foreach (ask_answers() as $slug => $row) {
        if (($row['review_status'] ?? '') !== ASK_REVIEW_PUBLISHED) {
            $rows[$slug] = $row;
        }
    }
    return $rows;
}

function ask_review_url(): string
{
    return '/AEO/';
}

function ask_render_card(array $row): string
{
    $href = ask_url(ask_kind_dir((string) ($row['kind'] ?? 'question')) . '/' . $row['canonical_slug']);
    $kicker = ucfirst((string) ($row['kind'] ?? 'question'));
    return '<a class="ask-card" href="' . ask_h($href) . '">'
        . '<p class="ask-kicker">' . ask_h($kicker) . '</p>'
        . '<h3>' . ask_h($row['question']) . '</h3>'
        . '<p>' . ask_h($row['short_answer']) . '</p>'
        . '</a>';
}

function ask_render_review_item(array $row): string
{
    $status = (string) ($row['review_status'] ?? 'draft');
    $kind = (string) ($row['kind'] ?? 'question');
    $sources = ask_sources();
    $html = '<article class="aeo-review-item" id="' . ask_h((string) $row['canonical_slug']) . '">';
    $html .= '<p class="ask-kicker">' . ask_h(ucfirst($kind)) . ' · <span class="aeo-status">' . ask_h(str_replace('_', ' ', $status)) . '</span></p>';
    $html .= '<h3>' . ask_h($row['question']) . '</h3>';
    $html .= '<p class="ask-direct-answer">' . ask_h($row['short_answer']) . '</p>';
    if (!empty($row['answer_markdown'])) {
        $html .= ask_md_to_html((string) $row['answer_markdown']);
    }
    if (!empty($row['claims']) && is_array($row['claims'])) {
        $html .= '<h4>Claims</h4><ul>';
        foreach ($row['claims'] as $claim) {
            $src = $sources[$claim['source_id'] ?? ''] ?? null;
            $html .= '<li><p>' . ask_h((string) ($claim['claim'] ?? '')) . '</p>';
            if ($src) {
                $html .= '<p class="ask-src"><a href="' . ask_h($src['public_url']) . '">' . ask_h($src['title']) . '</a>';
                if (!empty($claim['quote'])) {
                    $html .= ' &mdash; <q>' . ask_h($claim['quote']) . '</q>';
                }
                $html .= '</p>';
            }
            $html .= '</li>';
        }
        $html .= '</ul>';
    }
    $html .= '<p class="ask-reviewed">Last reviewed ' . ask_h((string) ($row['last_reviewed'] ?? 'n/a')) . '. Slug: <code>' . ask_h((string) $row['canonical_slug']) . '</code>. Not emitted as public HTML until <code>published</code>.</p>';
    $html .= '</article>';
    return $html;
}

function ask_render_aeo_review_landing(): string
{
    $needs = ask_answers_needing_review();
    $published = ask_published_answers();
    $html = '<header class="ask-hero">';
    $html .= '<p class="ask-kicker">AEO review</p>';
    $html .= '<h1>AEO pages that require review</h1>';
    $html .= '<p class="ask-direct-answer">One landing for every ' . ask_h(ask_layer_name()) . ' knowledge record that is not yet public, plus the published pages still waiting for an operator walk. This is not the public AEO index.</p>';
    $html .= '<p class="ask-access-note"><strong>Public layer</strong> (<a href="' . ask_h(ask_url()) . '">' . ask_h(ask_url()) . '</a>) is indexable and does not require a sign-in. This <code>/AEO/</code> review index stays sign-in only so unpublished drafts are not public.</p>';
    $html .= '</header>';

    $html .= '<section class="ask-browse" id="aeo-needs-review">';
    $html .= '<h2>Needs editorial review (' . count($needs) . ')</h2>';
    if ($needs === []) {
        $html .= '<p>No unpublished records.</p>';
    }
    foreach ($needs as $row) {
        $html .= ask_render_review_item($row);
    }
    $html .= '</section>';

    $html .= '<section class="ask-browse" id="aeo-published-walk">';
    $html .= '<h2>Published &mdash; operator walk (' . count($published) . ')</h2>';
    $html .= '<p>These records already emit public HTML. Open each page, then mark the editorial pass complete when you are satisfied.</p>';
    $html .= '<div class="ask-card-grid">';
    foreach ($published as $row) {
        $html .= ask_render_card($row);
    }
    $html .= '</div></section>';
    return $html;
}

/** Minimal AikiField chrome for the knowledge layer (static HTML pages carry
 *  the full i18n nav inline; the /ask/ pages are PHP-rendered English). */
function ask_chrome_header(): string
{
    return '<header class="af-header"><div class="af-header__inner">'
        . '<a href="/index.html" class="af-brand">'
        . '<span class="af-brand__icon" aria-hidden="true">A</span>'
        . '<span class="af-brand__text">AikiField</span>'
        . '<span class="af-brand__tagline">Security Acceleration from a Cyber Aikido Guy</span>'
        . '</a>'
        . '<nav aria-label="Primary" class="af-nav">'
        . '<a href="/index.html" class="af-nav__link">Home</a>'
        . '<a href="/services.html" class="af-nav__link">Services</a>'
        . '<a href="/case-studies.html" class="af-nav__link">Case Studies</a>'
        . '<a href="/books.html" class="af-nav__link">Books</a>'
        . '<a href="/somatic-studios/" class="af-nav__link">For Somatic Studios</a>'
        . '<a href="/assessment.html" class="af-nav__link">Assessment</a>'
        . '<a href="/contact.html" class="af-nav__cta">Get Started</a>'
        . '</nav>'
        . '</div></header>';
}

function ask_chrome_footer(): string
{
    return '<footer class="af-footer"><div class="af-footer__inner">'
        . '<ul class="af-footer__nav">'
        . '<li><a href="/books.html">Books</a></li>'
        . '<li><a href="/digital-experience/">Digital Experience</a></li>'
        . '<li><a href="/contact.html">Contact</a></li>'
        . '<li><a href="' . ask_h(ask_url()) . '">' . ask_h(ask_layer_name()) . '</a></li>'
        . '<li><a href="/members">Unified Field chat</a></li>'
        . '</ul>'
        . '<div class="af-footer__legal">&copy; ' . date('Y') . ' AikiField. All rights reserved.</div>'
        . '</div></footer>';
}

function ask_render_aeo_review_document(): string
{
    $title = 'AEO review — ' . ask_layer_name();
    $desc = 'Operator review index for ' . ask_layer_name() . ' pages that still need editorial review.';
    $canonical = ASK_CANONICAL_HOST . ask_review_url();
    $body = ask_render_aeo_review_landing();

    echo '<!DOCTYPE html>' . "\n" . '<html lang="en"><head>'
        . '<meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
        . '<link rel="icon" href="/favicon.ico" type="image/x-icon">'
        . '<title>' . ask_h($title) . '</title>'
        . '<meta name="description" content="' . ask_h($desc) . '">'
        . '<meta name="robots" content="noindex, nofollow">'
        . '<link rel="canonical" href="' . ask_h($canonical) . '">'
        . '<meta property="og:title" content="' . ask_h($title) . '">'
        . '<meta property="og:description" content="' . ask_h($desc) . '">'
        . '<meta property="og:url" content="' . ask_h($canonical) . '">'
        . '<meta property="og:type" content="article">'
        . '<meta property="og:site_name" content="AikiField">'
        . '<link rel="stylesheet" href="/css/redesign.css">'
        . '<link rel="stylesheet" href="/css/ask.css">'
        . '</head><body>';
    echo ask_chrome_header();
    echo '<main id="main" role="main"><div class="af-container ask-page aeo-review">';
    echo $body;
    echo '</div></main>';
    echo ask_chrome_footer();
    echo '</body></html>';
    return '';
}

function ask_render_hub(string $hub): string
{
    if ($hub === 'overview') {
        $html = '<h1>' . ask_h(ask_layer_name()) . '</h1>';
        $html .= '<p class="ask-direct-answer">' . ask_h(ask_layer_name()) . ' is a sourced Q&amp;A knowledge layer — every answer cites public pages on aikifield.com and quantumaikido.com. The Unified Field chat at <a href="/members">/members</a> is the signed-in companion product.</p>';
        $html .= '<ul class="ask-index">';
        $html .= '<li><a href="' . ask_h(ask_url('questions')) . '">Questions</a></li>';
        $html .= '<li><a href="' . ask_h(ask_url('concepts')) . '">Core concepts</a></li>';
        $html .= '<li><a href="' . ask_h(ask_url('books')) . '">Books</a></li>';
        $html .= '<li><a href="' . ask_h(ask_url('videos')) . '">Videos</a></li>';
        $html .= '<li><a href="' . ask_h(ask_url('how-it-works')) . '">How it works</a></li>';
        $html .= '<li><a href="' . ask_h(ask_url('about')) . '">About</a></li>';
        $html .= '<li><a href="' . ask_h(ask_url('sources')) . '">Sources</a></li>';
        $html .= '</ul>';
        return $html;
    }
    if ($hub === 'about') {
        return '<h1>About ' . ask_h(ask_layer_name()) . '</h1>'
            . '<p class="ask-direct-answer"><strong>AikiField</strong> is the B2B cybersecurity consulting practice behind this site. <strong>' . ask_h(ask_layer_name()) . '</strong> is this sourced Q&amp;A knowledge layer. The <strong>Unified Field chat</strong> is the signed-in conversational product.</p>'
            . '<p>These pages are AI-assisted editorial work grounded in already-public site copy. AikiField records cite public aikifield.com pages; Quantum Aikido records are attributed to Richard Moon and cite public quantumaikido.com pages.</p>'
            . '<p>Quotes must be verbatim substrings of a cited source before a record can publish — the validator rejects anything else.</p>';
    }
    if ($hub === 'how-it-works') {
        return '<h1>How it works</h1>'
            . '<p class="ask-direct-answer">The Unified Field chat is a signed-in conversation. ' . ask_h(ask_layer_name()) . ' is a set of reviewed, server-rendered answer pages with visible sources.</p>'
            . '<ul>'
            . '<li>Chat: <a href="/members">/members</a> &mdash; conversational, noindex, not used as AEO content.</li>'
            . '<li>Knowledge: these pages &mdash; one question, one short answer in the first paragraph, then explanation and provenance.</li>'
            . '<li>Privacy: only text already public on aikifield.com or quantumaikido.com is quoted.</li>'
            . '</ul>';
    }
    if ($hub === 'sources') {
        $html = '<h1>Sources and methodology</h1>';
        $html .= '<p class="ask-direct-answer">Every published claim points at a source already public on aikifield.com or quantumaikido.com.</p>';
        $html .= '<p>Unpublished records stay in JSON and are not emitted as HTML. A validator rejects quotes that are not substrings of the source&rsquo;s <code>exact_source_text</code>.</p>';
        $html .= '<ul>';
        foreach (ask_sources() as $src) {
            $html .= '<li><a href="' . ask_h($src['public_url']) . '">' . ask_h($src['title']) . '</a> '
                . '(' . ask_h($src['source_type']) . ')</li>';
        }
        $html .= '</ul>';
        return $html;
    }

    $kindMap = [
        'questions' => 'question',
        'books' => 'book',
        'videos' => 'video',
        'concepts' => 'question',
    ];
    $kind = $kindMap[$hub] ?? 'question';
    $title = [
        'questions' => 'Questions',
        'books' => 'Books',
        'videos' => 'Videos',
        'concepts' => 'Core concepts',
    ][$hub] ?? 'Index';
    $html = '<h1>' . ask_h($title) . '</h1><ul class="ask-index">';
    foreach (ask_published_answers($hub === 'concepts' ? null : $kind) as $row) {
        if ($hub === 'concepts' && !in_array($row['canonical_slug'], ASK_CONCEPT_SLUGS, true)) {
            continue;
        }
        if ($hub !== 'concepts' && ($row['kind'] ?? '') !== $kind) {
            continue;
        }
        $html .= '<li><a href="' . ask_h(ask_url(ask_kind_dir((string) $row['kind']) . '/' . $row['canonical_slug'])) . '"><strong>'
            . ask_h($row['question']) . '</strong></a><p>' . ask_h($row['short_answer']) . '</p></li>';
    }
    $html .= '</ul>';
    $unpublished = 0;
    foreach (ask_answers() as $row) {
        if (($row['review_status'] ?? '') !== ASK_REVIEW_PUBLISHED && ($row['kind'] ?? '') === $kind) {
            $unpublished++;
        }
    }
    if ($unpublished > 0 && $hub !== 'concepts') {
        $html .= '<p class="ask-unpublished">' . $unpublished
            . ' additional record(s) exist in JSON but are not published until editorial review.</p>';
    }
    return $html;
}

function ask_canonical(string $path): string
{
    $path = trim($path, '/');
    $rel = $path === '' ? ask_url() : ask_url($path);
    return ASK_CANONICAL_HOST . $rel;
}

function ask_render_document(string $path): void
{
    $meta = ask_page_meta($path);
    if ($meta['type'] === 'missing') {
        http_response_code(404);
        $title = 'Not found — ' . ask_layer_name();
        $body = '<h1>Not found</h1><p>That ' . ask_h(ask_layer_name()) . ' page is not published.</p>';
        $canonical = ask_canonical('');
    } else {
        $title = ($meta['title'] ?? ask_layer_name()) . ' — ' . ask_layer_name();
        $canonical = ask_canonical($path);
        if ($meta['type'] === 'record') {
            $body = ask_render_record($meta['record']);
        } else {
            $body = ask_render_hub($meta['hub']);
        }
        $body .= ask_disclosure();
    }
    $jsonld = json_encode(ask_jsonld($meta, $canonical), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $current = trim($path, '/');
    if ($current === 'index') {
        $current = '';
    }
    if (($meta['type'] ?? '') === 'record' && !empty($meta['record']['short_answer'])) {
        $desc = (string) $meta['record']['short_answer'];
    } elseif (($meta['hub'] ?? '') === 'overview') {
        $desc = 'Browse sourced Q&A from AikiField and Richard Moon\u2019s public Quantum Aikido work — questions, books, and videos.';
    } else {
        $desc = ($meta['title'] ?? ask_layer_name()) . ' — sourced Q&A on aikifield.com.';
    }
    $robots = 'index, follow';

    echo '<!DOCTYPE html>' . "\n" . '<html lang="en"><head>'
        . '<meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
        . '<link rel="icon" href="/favicon.ico" type="image/x-icon">'
        . '<title>' . ask_h($title) . '</title>'
        . '<meta name="description" content="' . ask_h($desc) . '">'
        . '<meta name="robots" content="' . ask_h($robots) . '">'
        . '<link rel="canonical" href="' . ask_h($canonical) . '">'
        . '<meta property="og:title" content="' . ask_h($title) . '">'
        . '<meta property="og:description" content="' . ask_h($desc) . '">'
        . '<meta property="og:url" content="' . ask_h($canonical) . '">'
        . '<meta property="og:type" content="article">'
        . '<meta property="og:site_name" content="AikiField">'
        . '<link rel="stylesheet" href="/css/redesign.css">'
        . '<link rel="stylesheet" href="/css/ask.css">'
        . '<script async src="https://news.google.com/swg/js/v1/publisher.js"></script>'
        . '<script type="application/ld+json">' . $jsonld . '</script>'
        . '</head><body>';
    echo ask_chrome_header();
    echo '<main id="main" role="main"><div class="af-container ask-page">';
    echo ask_subnav($current);
    echo '<div google-add-preferred-source-btn data-theme="light" style="margin-bottom: 1.5rem;"></div>';
    echo $body;
    echo '</div></main>';
    echo ask_chrome_footer();
    echo '</body></html>';
}

/**
 * Map a request path to an output filename (used by any future static emit).
 */
function ask_output_relpath(string $path): string
{
    $path = trim($path, '/');
    if ($path === '' || $path === 'index') {
        return 'index.html';
    }
    return $path . '.html';
}

function ask_all_published_paths(): array
{
    $paths = ['', 'about', 'how-it-works', 'sources', 'books', 'videos', 'concepts', 'questions'];
    foreach (ask_published_answers() as $row) {
        $paths[] = ask_kind_dir((string) $row['kind']) . '/' . $row['canonical_slug'];
    }
    return $paths;
}
