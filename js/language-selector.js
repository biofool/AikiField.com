/**
 * language-selector.js — Accessible language selector using native names (issue #76)
 *
 * Renders a <select>-based language switcher populated from data/i18n-config.json.
 * Uses each locale's native (endonym) name (e.g. "日本語", "العربية", "Español")
 * rather than flags, because flags represent nations and can be politically
 * sensitive (issue #76).
 *
 * Accessibility (issue #81):
 *  - The control is a native <select> for full keyboard navigation.
 *  - Labelled with an accessible name via aria-label.
 *  - Announces the change via an aria-live region.
 *
 * Depends on: js/locale-utils.js (AFLocale global).
 * Loaded as a classic <script>. Auto-mounts into any element with
 * id="af-language-selector" or the data-af-language-selector attribute.
 */
(function (global) {
  'use strict';

  var MOUNT_ID = 'af-language-selector';
  var MOUNT_ATTR = 'data-af-language-selector';

  function createSelector(locales, names, current) {
    var select = document.createElement('select');
    select.setAttribute('aria-label', 'Select language');
    select.className = 'af-lang-select';
    locales.forEach(function (code) {
      var opt = document.createElement('option');
      opt.value = code;
      // Native name falls back to the code itself if missing from config.
      opt.textContent = (names && names[code]) ? names[code] : code;
      if (code === current) opt.selected = true;
      select.appendChild(opt);
    });
    return select;
  }

  function mount(container) {
    if (!container || container.dataset.qaLangMounted === '1') return;
    container.dataset.qaLangMounted = '1';

    var AFLocale = global.AFLocale;
    if (!AFLocale) {
      if (global.console && console.error) console.error('[language-selector] AFLocale not loaded — include js/locale-utils.js first.');
      return;
    }

    AFLocale.loadConfig().then(function (cfg) {
      var locales = cfg.supportedLocales || ['en'];
      var names = cfg.localeNames || {};
      var current = AFLocale.getLocale();

      var select = createSelector(locales, names, current);
      select.addEventListener('change', function () {
        AFLocale.setLocale(select.value);
      });

      // Live region to announce language changes to screen readers (issue #81).
      var live = document.createElement('span');
      live.setAttribute('aria-live', 'polite');
      live.className = 'af-lang-live';
      live.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;';

      global.addEventListener && global.addEventListener('af:localechange', function (e) {
        var code = e && e.detail && e.detail.locale;
        var name = names[code] || code;
        // Use t() for the live region announcement (issue #120).
        live.textContent = (AFLocale.t && AFLocale.t('nav.language_changed', { name: name })) || ('Language changed to ' + name);
        // Keep the <select> in sync if the locale was changed elsewhere.
        if (select.value !== code) select.value = code;
      });

      container.appendChild(select);
      container.appendChild(live);
    }).catch(function (err) {
      // Never fail silently (AGENTS.md).
      if (global.console && console.error) console.error('[language-selector] Failed to mount:', err);
    });
  }

  function mountAll() {
    var byId = document.getElementById(MOUNT_ID);
    if (byId) mount(byId);
    var byAttr = document.querySelectorAll('[' + MOUNT_ATTR + ']');
    for (var i = 0; i < byAttr.length; i++) mount(byAttr[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }

  global.QALanguageSelector = { mount: mount, mountAll: mountAll };
})(typeof window !== 'undefined' ? window : this);
