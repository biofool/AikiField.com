/**
 * test_locale_path.js — Node.js test for locale-utils.js path-based localization.
 *
 * Tests the locale detection, URL building, and canonical link logic without
 * a browser. Run with: node tests/test_locale_path.js
 */
var fs = require('fs');
var path = require('path');
var assert = require('assert');

// ── Mock browser environment ────────────────────────────────────────────
var mockLocation = { pathname: '/', search: '', hash: '', href: '/', origin: 'https://aikifield.com' };
var mockLocalStorage = {};
var mockNavigator = { language: 'en' };
var mockDocument = {
  documentElement: { setAttribute: function (k, v) { this['_' + k] = v; }, getAttribute: function (k) { return this['_' + k]; } },
  head: { appendChild: function (c) { this._children = this._children || []; this._children.push(c); }, querySelectorAll: function () { return []; } },
  querySelector: function () { return null; },
  readyState: 'loading', // defer init() so we can set up mock fetch first
  addEventListener: function () {},
  createElement: function () { return { setAttribute: function () {} }; }
};

var globalScope = {
  location: mockLocation,
  localStorage: { getItem: function (k) { return mockLocalStorage[k] || null; }, setItem: function (k, v) { mockLocalStorage[k] = v; } },
  navigator: mockNavigator,
  document: mockDocument,
  fetch: null, // will be set up below before loadConfig
  console: console,
  dispatchEvent: function () {},
  CustomEvent: function () {},
  addEventListener: function () {},
  Intl: Intl
};

// ── Set up mock fetch (before loading locale-utils.js) ──────────────────
var configPath = path.join(__dirname, '..', 'data', 'i18n-config.json');
var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
// The production i18n-config.json only lists locales with complete translations
// in supportedLocales (currently en, es). However, the routing infrastructure
// (.htaccess, tests/locale-router.php) handles all 12 locale prefixes. Override
// supportedLocales here so detectLocale/localeFromPath tests can exercise the
// full path-based routing logic with ja/fr/pt etc.
config.supportedLocales = ['en','es','fr','de','pt','ja','zh','ko','ar','he','fa','hi'];
globalScope.fetch = function (url) {
  return Promise.resolve({
    ok: true,
    json: function () {
      if (url.indexOf('i18n-config.json') !== -1) return Promise.resolve(config);
      if (url.indexOf('i18n-strings/') !== -1) {
        var locale = url.match(/i18n-strings\/([a-z]+)\.json/)[1];
        var stringsPath = path.join(__dirname, '..', 'data', 'i18n-strings', locale + '.json');
        if (fs.existsSync(stringsPath)) {
          return Promise.resolve(JSON.parse(fs.readFileSync(stringsPath, 'utf8')));
        }
        return Promise.resolve({});
      }
      return Promise.resolve({});
    }
  });
};

// Load locale-utils.js in the mock environment
var jsPath = path.join(__dirname, '..', 'js', 'locale-utils.js');
var jsCode = fs.readFileSync(jsPath, 'utf8');
// The IIFE uses `global` param but also references `document` directly.
// Define mock globals that the eval'd code can access.
var document = mockDocument;
var navigator = mockNavigator;
var location = mockLocation;
var localStorage = globalScope.localStorage;
var dispatchEvent = globalScope.dispatchEvent;
var CustomEvent = globalScope.CustomEvent;
var addEventListener = globalScope.addEventListener;
var Intl = globalScope.Intl;
// fetch is set later after initial load; for now disable
// Eval with our global scope as the context
eval(jsCode.replace('typeof window !== \'undefined\' ? window : this', 'globalScope'));

var AFLocale = globalScope.AFLocale;
assert(AFLocale, 'AFLocale should be defined');

// ── Tests ───────────────────────────────────────────────────────────────
var tests = {
  'localeFromPath: /es/approach.html → es': function () {
    mockLocation.pathname = '/es/approach.html';
    // Need config loaded for isSupported
    return AFLocale.loadConfig().then(function () {
      var result = AFLocale.localeFromPath();
      assert.strictEqual(result, 'es', 'Expected es, got ' + result);
    });
  },

  'localeFromPath: /approach.html → null': function () {
    mockLocation.pathname = '/approach.html';
    var result = AFLocale.localeFromPath();
    assert.strictEqual(result, null, 'Expected null, got ' + result);
  },

  'localeFromPath: /en/approach.html → en': function () {
    mockLocation.pathname = '/en/approach.html';
    var result = AFLocale.localeFromPath();
    assert.strictEqual(result, 'en', 'Expected en, got ' + result);
  },

  'localeFromPath: /es/ → es': function () {
    mockLocation.pathname = '/es/';
    var result = AFLocale.localeFromPath();
    assert.strictEqual(result, 'es', 'Expected es, got ' + result);
  },

  'localeFromPath: /js/locale-utils.js → null (not a locale)': function () {
    mockLocation.pathname = '/js/locale-utils.js';
    var result = AFLocale.localeFromPath();
    assert.strictEqual(result, null, 'Expected null for /js/, got ' + result);
  },

  'localeFromPath: /css/redesign.css → null (not a locale)': function () {
    mockLocation.pathname = '/css/redesign.css';
    var result = AFLocale.localeFromPath();
    assert.strictEqual(result, null, 'Expected null for /css/, got ' + result);
  },

  'localeFromPath: /coach-api/foo → null (not a locale)': function () {
    mockLocation.pathname = '/coach-api/foo';
    var result = AFLocale.localeFromPath();
    assert.strictEqual(result, null, 'Expected null for /coach-api/, got ' + result);
  },

  'localeFromPath: /xx/page.html → null (unsupported locale)': function () {
    mockLocation.pathname = '/xx/page.html';
    var result = AFLocale.localeFromPath();
    assert.strictEqual(result, null, 'Expected null for unsupported locale xx, got ' + result);
  },

  'buildLocaleUrl: /approach.html + es → /es/approach.html': function () {
    mockLocation.pathname = '/approach.html';
    mockLocation.search = '';
    mockLocation.hash = '';
    var result = AFLocale.buildLocaleUrl('es');
    assert.strictEqual(result, '/es/approach.html', 'Expected /es/approach.html, got ' + result);
  },

  'buildLocaleUrl: /es/approach.html + en → /approach.html': function () {
    mockLocation.pathname = '/es/approach.html';
    var result = AFLocale.buildLocaleUrl('en');
    assert.strictEqual(result, '/approach.html', 'Expected /approach.html, got ' + result);
  },

  'buildLocaleUrl: /es/approach.html + fr → /fr/approach.html': function () {
    mockLocation.pathname = '/es/approach.html';
    var result = AFLocale.buildLocaleUrl('fr');
    assert.strictEqual(result, '/fr/approach.html', 'Expected /fr/approach.html, got ' + result);
  },

  'buildLocaleUrl: /es/ + en → /': function () {
    mockLocation.pathname = '/es/';
    var result = AFLocale.buildLocaleUrl('en');
    assert.strictEqual(result, '/', 'Expected /, got ' + result);
  },

  'buildLocaleUrl: / + es → /es/': function () {
    mockLocation.pathname = '/';
    var result = AFLocale.buildLocaleUrl('es');
    assert.strictEqual(result, '/es/', 'Expected /es/, got ' + result);
  },

  'buildLocaleUrl: same locale → null (no navigation needed)': function () {
    mockLocation.pathname = '/es/approach.html';
    var result = AFLocale.buildLocaleUrl('es');
    assert.strictEqual(result, null, 'Expected null for same locale, got ' + result);
  },

  'buildLocaleUrl: /approach.html + en → null (already English)': function () {
    mockLocation.pathname = '/approach.html';
    var result = AFLocale.buildLocaleUrl('en');
    assert.strictEqual(result, null, 'Expected null for already-English, got ' + result);
  },

  'buildLocaleUrl: preserves query string and hash': function () {
    mockLocation.pathname = '/approach.html';
    mockLocation.search = '?foo=bar';
    mockLocation.hash = '#section';
    var result = AFLocale.buildLocaleUrl('es');
    assert.strictEqual(result, '/es/approach.html?foo=bar#section', 'Expected query+hash preserved, got ' + result);
  },

  'detectLocale: URL path takes priority': function () {
    mockLocation.pathname = '/es/approach.html';
    mockLocation.search = '';
    mockLocalStorage['af_locale'] = 'fr'; // stored preference is fr, but URL says es
    mockNavigator.language = 'de'; // browser is de, but URL says es
    var result = AFLocale.detectLocale();
    assert.strictEqual(result, 'es', 'URL path should take priority, expected es, got ' + result);
  },

  'detectLocale: no path prefix → default (ignores query param)': function () {
    mockLocation.pathname = '/approach.html';
    mockLocation.search = '?lang=ja';
    mockLocalStorage['af_locale'] = 'fr';
    mockNavigator.language = 'de';
    var result = AFLocale.detectLocale();
    assert.strictEqual(result, 'en', 'No path prefix should return default en, got ' + result);
  },

  'detectLocale: no path prefix → default (ignores localStorage)': function () {
    mockLocation.pathname = '/approach.html';
    mockLocation.search = '';
    mockLocalStorage['af_locale'] = 'fr';
    mockNavigator.language = 'de';
    var result = AFLocale.detectLocale();
    assert.strictEqual(result, 'en', 'No path prefix should return default en, got ' + result);
  },

  'detectLocale: no path prefix → default (ignores browser language)': function () {
    mockLocation.pathname = '/approach.html';
    mockLocation.search = '';
    mockLocalStorage = {};
    mockNavigator.language = 'pt-BR';
    var result = AFLocale.detectLocale();
    assert.strictEqual(result, 'en', 'No path prefix should return default en, got ' + result);
  },

  'detectLocale: default fallback': function () {
    mockLocation.pathname = '/approach.html';
    mockLocation.search = '';
    mockLocalStorage = {};
    mockNavigator.language = 'xx'; // unsupported
    var result = AFLocale.detectLocale();
    assert.strictEqual(result, 'en', 'Default locale should be used, expected en, got ' + result);
  },
};

// ── Run tests ───────────────────────────────────────────────────────────
var passed = 0, failed = 0;
var testNames = Object.keys(tests);

function runNext(i) {
  if (i >= testNames.length) {
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed > 0 ? 1 : 0);
  }
  var name = testNames[i];
  try {
    var result = tests[name]();
    if (result && typeof result.then === 'function') {
      result.then(function () {
        console.log('  PASS: ' + name);
        passed++;
        runNext(i + 1);
      }).catch(function (err) {
        console.log('  FAIL: ' + name);
        console.log('    ' + err.message);
        failed++;
        runNext(i + 1);
      });
    } else {
      console.log('  PASS: ' + name);
      passed++;
      runNext(i + 1);
    }
  } catch (err) {
    console.log('  FAIL: ' + name);
    console.log('    ' + err.message);
    failed++;
    runNext(i + 1);
  }
}

console.log('Running locale-utils.js path-based localization tests...\n');
// Load config first — localeFromPath() and detectLocale() depend on config
// being loaded (isSupported() checks config.supportedLocales).
AFLocale.loadConfig().then(function () {
  runNext(0);
}).catch(function (err) {
  console.error('Failed to load config:', err);
  process.exit(1);
});
