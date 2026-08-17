<?php
/**
 * generate-sitemap.php — Generates sitemap.xml with locale-prefixed URLs.
 *
 * Reads data/i18n-config.json for the supported locale list and generates
 * a sitemap.xml that includes:
 *  - All localizable pages in all non-English locales (e.g. /es/approach.html)
 *  - All localizable pages in English (no prefix — canonical form)
 *  - Non-localizable pages (projects.php) at their non-prefixed URL only
 *
 * English /en/ prefix is NOT included in the sitemap (it's an alias, not
 * a canonical URL — including it would create duplicate content signals).
 *
 * Usage: php scripts/generate-sitemap.php [--write]
 *   --write  Overwrite sitemap.xml (default: dry-run, print to stdout)
 *
 * Keep the localizable page list in sync with the pages that load
 * js/locale-utils.js (see AGENTS.md).
 */

$root = dirname(__DIR__);
$configPath = $root . '/data/i18n-config.json';
$sitemapPath = $root . '/sitemap.xml';

if (!file_exists($configPath)) {
    fwrite(STDERR, "Error: i18n config not found at $configPath\n");
    exit(1);
}

$config = json_decode(file_get_contents($configPath), true);
if (!$config || !isset($config['supportedLocales'])) {
    fwrite(STDERR, "Error: Invalid i18n config\n");
    exit(1);
}

$supportedLocales = $config['supportedLocales'];
$defaultLocale = isset($config['defaultLocale']) ? $config['defaultLocale'] : 'en';

// Localizable pages (must match the pages that load js/locale-utils.js)
$localizablePages = array(
    'index.html' => array('changefreq' => 'weekly', 'priority' => '1.0'),
    'fractional-ciso.html' => array('changefreq' => 'monthly', 'priority' => '0.9'),
    'board-security-clarity.html' => array('changefreq' => 'monthly', 'priority' => '0.8'),
    'fractional-ciso-for-saas.html' => array('changefreq' => 'monthly', 'priority' => '0.9'),
    'ai-devsecops-vulnerability-remediation.html' => array('changefreq' => 'monthly', 'priority' => '0.9'),
    'services.html' => array('changefreq' => 'monthly', 'priority' => '0.8'),
    'case-studies.html' => array('changefreq' => 'monthly', 'priority' => '0.8'),
    'approach.html' => array('changefreq' => 'monthly', 'priority' => '0.7'),
    'process.html' => array('changefreq' => 'monthly', 'priority' => '0.7'),
    'assessment.html' => array('changefreq' => 'monthly', 'priority' => '0.6'),
    'contact.html' => array('changefreq' => 'monthly', 'priority' => '0.7'),
);

// Non-localizable pages (only non-prefixed URL in sitemap)
$nonLocalizablePages = array(
    'projects.php' => array('changefreq' => 'monthly', 'priority' => '0.6'),
);

$baseUrl = 'https://aikifield.com';

// Build sitemap XML
$xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

// Localizable pages: all locales
foreach ($localizablePages as $page => $meta) {
    foreach ($supportedLocales as $locale) {
        if ($locale === $defaultLocale) {
            // English: no prefix (canonical form)
            $url = $baseUrl . '/' . $page;
        } else {
            // Non-English: locale prefix
            $url = $baseUrl . '/' . $locale . '/' . $page;
        }
        $xml .= "  <url>\n";
        $xml .= "    <loc>" . htmlspecialchars($url, ENT_XML1) . "</loc>\n";
        $xml .= "    <changefreq>" . $meta['changefreq'] . "</changefreq>\n";
        $xml .= "    <priority>" . $meta['priority'] . "</priority>\n";
        $xml .= "  </url>\n";
    }
}

// Non-localizable pages: only non-prefixed URL
foreach ($nonLocalizablePages as $page => $meta) {
    $url = $baseUrl . '/' . $page;
    $xml .= "  <url>\n";
    $xml .= "    <loc>" . htmlspecialchars($url, ENT_XML1) . "</loc>\n";
    $xml .= "    <changefreq>" . $meta['changefreq'] . "</changefreq>\n";
    $xml .= "    <priority>" . $meta['priority'] . "</priority>\n";
    $xml .= "  </url>\n";
}

$xml .= '</urlset>' . "\n";

// Output
$writeMode = in_array('--write', $argv, true);
if ($writeMode) {
    file_put_contents($sitemapPath, $xml);
    $count = count($localizablePages) * count($supportedLocales) + count($nonLocalizablePages);
    echo "Wrote $sitemapPath ($count URLs)\n";
} else {
    echo $xml;
    $count = count($localizablePages) * count($supportedLocales) + count($nonLocalizablePages);
    fwrite(STDERR, "Dry-run: $count URLs. Use --write to overwrite sitemap.xml.\n");
}
