/**
 * locale-utils.js — Locale-aware formatting utilities (issue #75)
 *
 * Provides thin wrappers around the native Intl APIs (NumberFormat,
 * DateTimeFormat, RelativeTimeFormat) so the site formats numbers, dates,
 * times, and currency according to the user's locale instead of hard-coded
 * US formats. Also handles locale detection, persistence, and RTL layout
 * support (issue #76).
 *
 * Design notes:
 *  - All timestamps are stored/processed in UTC internally and only
 *    formatted in the user's local time zone on display (issue #75).
 *  - Currency defaults to USD but is locale-aware; callers can override.
 *  - Measurement system (metric vs imperial) is locale-driven (issue #75).
 *  - RTL is applied via the [dir] attribute on <html>; CSS logical
 *    properties handle mirroring. This file only sets the attribute and
 *    data-locale for CSS semantic-color scoping (issue #77).
 *
 * Loaded as a classic <script>; exposes a global `AFLocale` object.
 * No module/build step required (plain PHP site).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'af_locale';
  var CONFIG_URL = '/data/i18n-config.json';
  var STRINGS_URL = '/data/i18n-strings/';
  var DEFAULT_LOCALE = 'en';

  var config = null;
  var currentLocale = DEFAULT_LOCALE;
  var stringsCache = {};   // locale → { key: value } (loaded string files)
  var stringsLoading = {}; // locale → Promise (in-flight load)

  // ── Config loading ────────────────────────────────────────────────
  // Fetches the i18n config once and caches it. Returns a Promise.
  function loadConfig() {
    if (config) return Promise.resolve(config);
    if (global.fetch) {
      return global.fetch(CONFIG_URL)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) {
          config = c || { supportedLocales: [DEFAULT_LOCALE], rtlLocales: [], localeNames: {}, defaultCurrency: 'USD', defaultTimeZone: 'UTC', defaultMeasurementSystem: 'metric', measurementSystemOverrides: {}, colorSemantics: { overrides: {} } };
          return config;
        })
        .catch(function (err) {
          // Never fail silently (AGENTS.md rule): degrade to defaults but log.
          if (global.console && console.warn) console.warn('[AFLocale] Failed to load i18n config, using defaults:', err);
          config = { supportedLocales: [DEFAULT_LOCALE], rtlLocales: [], localeNames: {}, defaultCurrency: 'USD', defaultTimeZone: 'UTC', defaultMeasurementSystem: 'metric', measurementSystemOverrides: {}, colorSemantics: { overrides: {} } };
          return config;
        });
    }
    config = { supportedLocales: [DEFAULT_LOCALE], rtlLocales: [], localeNames: {}, defaultCurrency: 'USD', defaultTimeZone: 'UTC', defaultMeasurementSystem: 'metric', measurementSystemOverrides: {}, colorSemantics: { overrides: {} } };
    return Promise.resolve(config);
  }

  // ── Path-based locale detection ────────────────────────────────────
  // Extracts the locale from the URL path prefix (e.g. /es/approach.html → es).
  // Returns the locale string if the first path segment is a supported locale,
  // or null if there is no locale prefix or the prefix is not supported.
  // Used by detectLocale() (path takes priority) and buildLocaleUrl().
  function localeFromPath() {
    if (!global.location || !global.location.pathname) return null;
    var path = global.location.pathname;
    // Match /xx/ or /xx (where xx is a 2-letter locale prefix)
    var m = path.match(/^\/([a-z]{2})(\/|$)/i);
    if (!m) return null;
    var locale = m[1].toLowerCase();
    if (!isSupported(locale)) return null;
    return locale;
  }

  // Builds a URL for the given locale by adding/replacing/removing the path
  // prefix. Returns null when no navigation is needed (same locale already
  // active). Preserves the query string and hash.
  function buildLocaleUrl(locale) {
    if (!global.location) return null;
    var path = global.location.pathname;
    var search = global.location.search || '';
    var hash = global.location.hash || '';

    var currentLocale = localeFromPath();
    var defaultLocale = (config && config.defaultLocale) || DEFAULT_LOCALE;

    // No navigation needed if the target locale is already active.
    if (locale === currentLocale) return null;
    if (locale === defaultLocale && currentLocale === null) return null;

    // Strip the current locale prefix to get the base path.
    var basePath = path;
    if (currentLocale) {
      basePath = path.replace(/^\/[a-z]{2}/i, '');
      if (basePath === '') basePath = '/';
    }

    // Build the new path: prefix with locale (or strip prefix for default).
    var newPath;
    if (locale === defaultLocale) {
      newPath = basePath;
    } else {
      newPath = '/' + locale + basePath;
    }

    return newPath + search + hash;
  }

  // ── Locale detection & persistence ────────────────────────────────
  // Priority: URL path prefix only (e.g. /es/approach.html → es).
  // The site defaults to English (the default locale) unless the URL has
  // a 2-letter locale path prefix. Browser language, localStorage, and
  // ?lang= query params are intentionally NOT used — language is chosen
  // explicitly by navigating to a localized path (e.g. /es/projects.php).
  function detectLocale() {
    // URL path prefix is the only detection mechanism.
    var pathLocale = localeFromPath();
    if (pathLocale) return pathLocale;

    return DEFAULT_LOCALE;
  }

  function isSupported(locale) {
    if (!locale) return false;
    var list = (config && config.supportedLocales) || [DEFAULT_LOCALE];
    return list.indexOf(locale) !== -1 || list.indexOf(locale.toLowerCase()) !== -1;
  }

  function setLocale(locale) {
    if (!isSupported(locale)) {
      if (global.console && console.warn) console.warn('[AFLocale] Unsupported locale "' + locale + '", ignoring.');
      return;
    }
    if (global.console && console.info) console.info('[AFLocale] setLocale("' + locale + '") called');
    // Navigate to the path-based URL for the target locale (e.g. /es/projects.php).
    // The page reloads at the new URL and detectLocale() picks up the locale
    // from the path prefix. This ensures the full page is served in the target
    // locale rather than partially translating in-place.
    var url = buildLocaleUrl(locale);
    if (url) {
      global.location.href = url;
    } else {
      // Same locale already active — just update in-place.
      currentLocale = locale;
      applyDocumentLocale(locale);
      global.dispatchEvent && global.dispatchEvent(new CustomEvent('af:localechange', { detail: { locale: locale } }));
      loadStrings(locale).then(function () { localizeElements(); });
    }
  }

  function getLocale() { return currentLocale; }

  // Apply <html lang> and <html dir> + data-locale for CSS scoping.
  function applyDocumentLocale(locale) {
    var html = document.documentElement;
    html.setAttribute('lang', locale);
    var rtl = isRTL(locale);
    html.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    html.setAttribute('data-locale', locale);
  }

  function isRTL(locale) {
    var rtl = (config && config.rtlLocales) || [];
    if (!locale) return false;
    return rtl.indexOf(locale) !== -1 || rtl.indexOf(locale.split('-')[0]) !== -1;
  }

  // ── Number formatting (Intl.NumberFormat) ─────────────────────────
  function formatNumber(value, options) {
    if (value === null || value === undefined) return '—';
    var o = options || {};
    try {
      return new Intl.NumberFormat(currentLocale, o).format(value);
    } catch (e) {
      // Fallback: never fail silently, but degrade gracefully.
      if (global.console && console.warn) console.warn('[AFLocale] NumberFormat failed for "' + currentLocale + '":', e);
      return String(value);
    }
  }

  // ── Currency formatting ───────────────────────────────────────────
  // Replaces hard-coded "$" prefixes (e.g. sangha.php "$19.99").
  function formatCurrency(value, currency, options) {
    if (value === null || value === undefined) return '—';
    var cur = currency || (config && config.defaultCurrency) || 'USD';
    var o = Object.assign({ style: 'currency', currency: cur }, options || {});
    try {
      return new Intl.NumberFormat(currentLocale, o).format(value);
    } catch (e) {
      if (global.console && console.warn) console.warn('[AFLocale] Currency format failed for "' + currentLocale + '/' + cur + '":', e);
      return cur + ' ' + Number(value).toFixed(2);
    }
  }

  // ── Date/time formatting (Intl.DateTimeFormat) ────────────────────
  // Timestamps are UTC internally; displayed in the user's local time zone.
  // Accepts a Date, ISO string, or epoch ms.
  function toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') return new Date(value);
    return new Date(NaN);
  }

  function formatDate(value, options) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return '—';
    var o = options || { dateStyle: 'medium' };
    try {
      return new Intl.DateTimeFormat(currentLocale, o).format(d);
    } catch (e) {
      if (global.console && console.warn) console.warn('[AFLocale] DateFormat failed for "' + currentLocale + '":', e);
      return d.toISOString().split('T')[0];
    }
  }

  function formatDateTime(value, options) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return '—';
    var o = options || { dateStyle: 'medium', timeStyle: 'short' };
    try {
      return new Intl.DateTimeFormat(currentLocale, o).format(d);
    } catch (e) {
      if (global.console && console.warn) console.warn('[AFLocale] DateTimeFormat failed for "' + currentLocale + '":', e);
      return d.toLocaleString();
    }
  }

  // Format with an explicit time zone (issue #75: display in user's local TZ,
  // but allow forcing a specific zone for provenance/legal timestamps).
  function formatDateInZone(value, timeZone, options) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return '—';
    var o = Object.assign({ dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone }, options || {});
    try {
      return new Intl.DateTimeFormat(currentLocale, o).format(d);
    } catch (e) {
      if (global.console && console.warn) console.warn('[AFLocale] DateFormat(tz) failed for "' + currentLocale + '":', e);
      return d.toISOString();
    }
  }

  // ── Relative time (Intl.RelativeTimeFormat) ───────────────────────
  function formatRelativeTime(value, options) {
    var d = toDate(value);
    if (isNaN(d.getTime())) return '—';
    var diffMs = d.getTime() - Date.now();
    var rtf;
    try { rtf = new Intl.RelativeTimeFormat(currentLocale, options || { numeric: 'auto' }); }
    catch (e) {
      if (global.console && console.warn) console.warn('[AFLocale] RelativeTimeFormat unsupported for "' + currentLocale + '":', e);
      return formatDate(d);
    }
    var abs = Math.abs(diffMs);
    var sec = abs / 1000, min = sec / 60, hr = min / 60, day = hr / 24;
    var sign = diffMs < 0 ? -1 : 1;
    if (sec < 60) return rtf.format(Math.round(sign * sec), 'second');
    if (min < 60) return rtf.format(Math.round(sign * min), 'minute');
    if (hr < 24) return rtf.format(Math.round(sign * hr), 'hour');
    if (day < 30) return rtf.format(Math.round(sign * day), 'day');
    if (day < 365) return rtf.format(Math.round(sign * day / 30), 'month');
    return rtf.format(Math.round(sign * day / 365), 'year');
  }

  // ── Measurement system ────────────────────────────────────────────
  // Returns 'metric' or 'imperial' per locale (issue #75).
  function measurementSystem() {
    if (!config) return 'metric';
    var overrides = config.measurementSystemOverrides || {};
    if (overrides[currentLocale]) return overrides[currentLocale];
    var base = currentLocale.split('-')[0];
    if (overrides[base]) return overrides[base];
    return config.defaultMeasurementSystem || 'metric';
  }

  // ── Translation (t function) ──────────────────────────────────────
  // Loads the string file for a locale (caches it). Returns a Promise
  // resolving to the strings object. Falls back to English if the locale
  // file fails to load. Issue #120 / i18n-roadmap.md "Translation strategy".
  function loadStrings(locale) {
    var loc = locale || currentLocale;
    if (stringsCache[loc]) return Promise.resolve(stringsCache[loc]);
    if (stringsLoading[loc]) return stringsLoading[loc];
    if (!global.fetch) {
      stringsCache[loc] = {};
      return Promise.resolve(stringsCache[loc]);
    }
    stringsLoading[loc] = global.fetch(STRINGS_URL + loc + '.json?v=2')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        stringsCache[loc] = s || {};
        return stringsCache[loc];
      })
      .catch(function (err) {
        // Never fail silently (AGENTS.md): log and degrade to empty.
        if (global.console && console.warn) console.warn('[AFLocale] Failed to load strings for "' + loc + '":', err);
        stringsCache[loc] = {};
        return stringsCache[loc];
      });
    return stringsLoading[loc];
  }

  // Pre-load English strings on init so t() has an immediate fallback.
  function ensureEnglishStrings() {
    if (!stringsCache[DEFAULT_LOCALE]) return loadStrings(DEFAULT_LOCALE);
    return Promise.resolve(stringsCache[DEFAULT_LOCALE]);
  }

  // t(key, params) — translate a key with optional {placeholder} interpolation.
  // Synchronous: uses cached strings. Falls back to English, then to the key itself.
  // For async-safe usage, call loadStrings(locale) first, then t().
  function t(key, params) {
    var loc = currentLocale;
    var strings = stringsCache[loc] || {};
    var val = strings[key];
    // Fall back to English if missing in the current locale.
    if (val === undefined && loc !== DEFAULT_LOCALE) {
      var enStrings = stringsCache[DEFAULT_LOCALE] || {};
      val = enStrings[key];
    }
    // Fall back to the key itself if not found anywhere.
    if (val === undefined || val === null) return key;
    // Interpolate {placeholder} params.
    if (params) {
      val = val.replace(/\{(\w+)\}/g, function (match, name) {
        return (params[name] !== undefined && params[name] !== null) ? String(params[name]) : match;
      });
    }
    return val;
  }

  // ── Category terminology & granularity labels (issue #84) ─────────
  // Loads category-terminology.json and granularity-labels.json on demand.
  var categoryTerms = null;
  var granularityLabels = null;

  function loadCategoryTerms() {
    if (categoryTerms) return Promise.resolve(categoryTerms);
    if (!global.fetch) { categoryTerms = {}; return Promise.resolve(categoryTerms); }
    return global.fetch('/data/category-terminology.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { categoryTerms = d || {}; return categoryTerms; })
      .catch(function (err) {
        if (global.console && console.warn) console.warn('[AFLocale] Failed to load category-terminology:', err);
        categoryTerms = {};
        return categoryTerms;
      });
  }

  function loadGranularityLabels() {
    if (granularityLabels) return Promise.resolve(granularityLabels);
    if (!global.fetch) { granularityLabels = {}; return Promise.resolve(granularityLabels); }
    return global.fetch('/data/granularity-labels.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { granularityLabels = d || {}; return granularityLabels; })
      .catch(function (err) {
        if (global.console && console.warn) console.warn('[AFLocale] Failed to load granularity-labels:', err);
        granularityLabels = {};
        return granularityLabels;
      });
  }

  // localizedCategory(name) — returns the locale-specific name for a category.
  // Falls back to the English name, then to the original name.
  function localizedCategory(name) {
    if (!name) return '';
    var cats = (categoryTerms && categoryTerms.categories) || {};
    var entry = cats[name];
    if (!entry) return name;
    return entry[currentLocale] || entry[DEFAULT_LOCALE] || name;
  }

  // localizedTerm(key) — returns the locale-specific term for a concept like "dojo".
  function localizedTerm(key) {
    if (!key) return '';
    var terms = (categoryTerms && categoryTerms.terms) || {};
    var entry = terms[key];
    if (!entry) return key;
    return entry[currentLocale] || entry[DEFAULT_LOCALE] || key;
  }

  // localizedMetric(key) — returns the locale-specific label for a data metric.
  function localizedMetric(key) {
    if (!key) return '';
    var metrics = (granularityLabels && granularityLabels.metrics) || {};
    var entry = metrics[key];
    if (!entry) return key;
    return entry[currentLocale] || entry[DEFAULT_LOCALE] || key;
  }

  // ── Byte formatting (locale-aware) ────────────────────────────────
  // Replaces the hard-coded "B/KB/MB" formatter in dashboard.php / dashboard-spa.js.
  function formatBytes(b) {
    if (!b) return '—';
    var n = Number(b);
    if (n < 1024) return formatNumber(n) + ' B';
    if (n < 1048576) return formatNumber(n / 1024, { maximumFractionDigits: 1 }) + ' KB';
    return formatNumber(n / 1048576, { maximumFractionDigits: 1 }) + ' MB';
  }

  // ── Initialization ────────────────────────────────────────────────
  // Auto-initializes on DOMContentLoaded: loads config, detects the user's
  // locale (from storage, query param, or browser language), loads the
  // appropriate string file, and localizes all data-i18n elements.
  // English strings are always loaded as fallback. Safe to call once.
  //
  // The language selector dropdown in nav.php calls setLocale() to switch.
  var initialized = false;
  function init() {
    if (initialized) return;
    initialized = true;
    loadConfig().then(function () {
      // Detect locale from browser/storage/query param (issue #120 — re-enabled).
      var detected = detectLocale();
      currentLocale = detected || DEFAULT_LOCALE;
      applyDocumentLocale(currentLocale);
      // Load strings for the current locale, then localize all data-i18n elements.
      // English strings are always loaded as fallback.
      ensureEnglishStrings().then(function () {
        if (currentLocale === DEFAULT_LOCALE) {
          localizeElements();
        } else {
          loadStrings(currentLocale).then(function () {
            localizeElements();
          });
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Auto-localize declarative price/number/date elements ─────────
  // Elements marked with data-qa-price (and optional data-qa-currency) are
  // reformatted on init and on locale change. The original hard-coded text
  // (e.g. "$19.99") remains as a fallback if JS is disabled.
  function localizeElements() {
    if (!document || !global.Intl) return;
    // Prices
    var prices = document.querySelectorAll('[data-qa-price]');
    for (var i = 0; i < prices.length; i++) {
      var el = prices[i];
      var amt = parseFloat(el.getAttribute('data-qa-price'));
      var cur = el.getAttribute('data-qa-currency') || (config && config.defaultCurrency) || 'USD';
      if (!isNaN(amt)) el.textContent = formatCurrency(amt, cur);
    }
    // Numbers: data-qa-number="1234.5" with optional data-qa-number-options (JSON)
    var nums = document.querySelectorAll('[data-qa-number]');
    for (var j = 0; j < nums.length; j++) {
      var nel = nums[j];
      var val = parseFloat(nel.getAttribute('data-qa-number'));
      var optRaw = nel.getAttribute('data-qa-number-options');
      var opt = optRaw ? JSON.parse(optRaw) : undefined;
      if (!isNaN(val)) nel.textContent = formatNumber(val, opt);
    }
    // Dates: data-qa-date="ISO" with optional data-qa-date-style
    var dates = document.querySelectorAll('[data-qa-date]');
    for (var k = 0; k < dates.length; k++) {
      var del = dates[k];
      var iso = del.getAttribute('data-qa-date');
      var style = del.getAttribute('data-qa-date-style') || 'medium';
      var opts = { dateStyle: style };
      del.textContent = formatDate(iso, opts);
    }
    // Translatable text: data-i18n="key" replaces textContent with t(key).
    // data-i18n-params='{"name":"value"}' for {placeholder} interpolation.
    var i18nEls = document.querySelectorAll('[data-i18n]');
    if (global.console && console.info) console.info('[AFLocale] Localizing ' + i18nEls.length + ' data-i18n elements for locale "' + currentLocale + '"');
    for (var m = 0; m < i18nEls.length; m++) {
      var tel = i18nEls[m];
      var key = tel.getAttribute('data-i18n');
      if (!key) continue;
      var paramsRaw = tel.getAttribute('data-i18n-params');
      var params = paramsRaw ? JSON.parse(paramsRaw) : undefined;
      var translated = t(key, params);
      tel.textContent = translated;
    }
    // Translatable attributes: data-i18n-attr="aria-label:nav.toggle_menu"
    // Sets the named attribute to the translated value.
    var attrEls = document.querySelectorAll('[data-i18n-attr]');
    for (var n = 0; n < attrEls.length; n++) {
      var ael = attrEls[n];
      var spec = ael.getAttribute('data-i18n-attr');
      // spec format: "attrName:i18n.key" (can be comma-separated for multiple)
      var pairs = spec.split(',');
      for (var p = 0; p < pairs.length; p++) {
        var pair = pairs[p].trim().split(':');
        if (pair.length === 2) ael.setAttribute(pair[0], t(pair[1]));
      }
    }
    // Translatable placeholders: data-i18n-placeholder="key"
    // Sets the element's placeholder attribute to the translated value.
    var phEls = document.querySelectorAll('[data-i18n-placeholder]');
    for (var q = 0; q < phEls.length; q++) {
      var phel = phEls[q];
      var phKey = phel.getAttribute('data-i18n-placeholder');
      if (phKey) phel.setAttribute('placeholder', t(phKey));
    }
    localizeDiagrams();
  }

  function localizeDiagrams() {
    var diagrams = document.querySelectorAll('img[data-af-diagram]');
    for (var d = 0; d < diagrams.length; d++) {
      var img = diagrams[d];
      var name = img.getAttribute('data-af-diagram');
      if (!name) continue;
      img.src = '/assets/i18n/' + currentLocale + '/' + name + '.svg';
    }
  }

  // ── Public API ────────────────────────────────────────────────────
  var AFLocale = {
    init: init,
    loadConfig: loadConfig,
    loadStrings: loadStrings,
    loadCategoryTerms: loadCategoryTerms,
    loadGranularityLabels: loadGranularityLabels,
    t: t,
    localizedCategory: localizedCategory,
    localizedTerm: localizedTerm,
    localizedMetric: localizedMetric,
    detectLocale: detectLocale,
    localeFromPath: localeFromPath,
    buildLocaleUrl: buildLocaleUrl,
    setLocale: setLocale,
    getLocale: getLocale,
    isRTL: isRTL,
    isSupported: isSupported,
    formatNumber: formatNumber,
    formatCurrency: formatCurrency,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatDateInZone: formatDateInZone,
    formatRelativeTime: formatRelativeTime,
    formatBytes: formatBytes,
    measurementSystem: measurementSystem,
    localizeElements: localizeElements,
    getConfig: function () { return config; },
    STORAGE_KEY: STORAGE_KEY
  };

  global.AFLocale = AFLocale;
})(typeof window !== 'undefined' ? window : this);
