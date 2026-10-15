/**
 * Shared game-translation picker (issue #894).
 *
 * A game page exposes `window.AF_GAME = { id, collect(), apply(map, annotate) }`
 * BEFORE this script loads:
 *   collect() → [{id, text}] — every user-visible string worth translating.
 *   apply(map, annotate) → swap rendered text to map[id] values; call
 *     annotate(element, itemId, sourceText, translatedText) on each rendered
 *     block to attach the per-paragraph thumbs widget.
 *
 * translate.js owns: the language picker UI, the /games/translate-api.php
 * round-trip, a localStorage cache so the choice survives reloads, and the
 * thumbs up/down votes that flow into the coaching feedback digest.
 */
(function () {
  "use strict";

  var API = "/games/translate-api.php";
  var LANGS = [
    ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["pt", "Português"],
    ["it", "Italiano"], ["nl", "Nederlands"], ["pl", "Polski"], ["sv", "Svenska"],
    ["ja", "日本語"], ["zh-Hans", "中文"], ["ko", "한국어"], ["hi", "हिन्दी"],
    ["ar", "العربية"], ["he", "עברית"], ["ru", "Русский"],
  ];
  var game = window.AF_GAME;
  if (!game || typeof game.collect !== "function" || typeof game.apply !== "function") {
    console.error("translate.js: page did not define window.AF_GAME — picker not mounted");
    return;
  }

  var cacheKey = "af_tr_" + game.id;
  var voteKey = "af_tr_votes_" + game.id;

  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }

  function post(body) {
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) { var err = new Error("translate-api " + r.status); err.status = r.status; throw err; }
      return r.json();
    });
  }

  // ── thumbs widget ──────────────────────────────────────────────────────────
  var votes = load(voteKey) || {};
  function annotate(el, itemId, sourceText, translatedText) {
    if (!el || !el.appendChild) return;
    var lang = current();
    if (!lang) return;
    var mid = "game-translation:" + game.id + ":" + lang + ":" + itemId;
    var wrap = document.createElement("span");
    wrap.className = "af-tr-vote";
    wrap.style.cssText = "float:right;margin-left:8px;opacity:0.5;font-size:12px";
    [["up", "👍"], ["down", "👎"]].forEach(function (pair) {
      var b = document.createElement("button");
      b.textContent = pair[1];
      b.title = pair[0] === "up" ? "Translation looks right" : "Translation is wrong";
      b.style.cssText = "border:none;background:none;cursor:pointer;font-size:13px;padding:2px";
      var myLabel = "translation_" + pair[0];
      if (votes[mid] === myLabel) b.style.opacity = "1";
      b.addEventListener("click", function () {
        votes[mid] = myLabel;
        store(voteKey, votes);
        wrap.querySelectorAll("button").forEach(function (x) { x.style.opacity = "0.5"; });
        b.style.opacity = "1";
        post({
          action: "feedback",
          sessionId: "games-" + game.id,
          messageId: mid,
          label: myLabel,
          note: JSON.stringify({ source: sourceText, translated: translatedText }),
        }).then(function (d) {
          if (!d || d.ok !== true) console.error("translate.js: feedback rejected", d);
        }).catch(function (e) { console.error("translate.js: feedback failed", e); });
      });
      wrap.appendChild(b);
    });
    el.appendChild(wrap);
  }

  // ── translation lifecycle ──────────────────────────────────────────────────
  var lang = load(cacheKey + "_lang");
  function current() { return lang; }

  function applyMap(map) {
    try { game.apply(map, annotate); } catch (e) { console.error("translate.js: apply failed", e); }
  }

  function translateTo(target) {
    if (!target || target === "en") {
      lang = null;
      store(cacheKey + "_lang", null);
      store(cacheKey, null);
      location.reload(); // cleanest way to restore the English render
      return;
    }
    var items = game.collect();
    status("Translating…");
    post({ action: "translate", gameId: game.id, targetLang: target, items: items })
      .then(function (d) {
        if (!d || d.ok !== true || !Array.isArray(d.items)) {
          status("Translation failed");
          console.error("translate.js: bad response", d);
          return;
        }
        var map = {};
        d.items.forEach(function (it) { map[it.id] = it.translated; });
        lang = target;
        store(cacheKey + "_lang", target);
        store(cacheKey, map);
        applyMap(map);
        status(null);
      })
      .catch(function (e) {
        status(e && e.status === 401 ? "Sign in to translate" : "Translation failed");
        console.error("translate.js: translate failed", e);
      });
  }

  // ── picker UI ──────────────────────────────────────────────────────────────
  var bar;
  function status(msg) { if (bar) bar.querySelector(".af-tr-msg").textContent = msg || ""; }

  function mount() {
    bar = document.createElement("div");
    bar.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9999;background:#fff;border:1px solid #1A1A1A;padding:6px 8px;font-size:12px;font-family:inherit;display:flex;gap:6px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.15)";
    var sel = document.createElement("select");
    sel.style.cssText = "font-size:12px;padding:3px";
    sel.appendChild(new Option("English", "en"));
    LANGS.forEach(function (l) { sel.appendChild(new Option(l[1], l[0])); });
    sel.value = lang || "en";
    sel.setAttribute("aria-label", "Translate this game");
    sel.addEventListener("change", function () { translateTo(sel.value); });
    var msg = document.createElement("span");
    msg.className = "af-tr-msg";
    bar.appendChild(new Text("🌐"));
    bar.appendChild(sel);
    bar.appendChild(msg);
    document.body.appendChild(bar);
  }

  // Apply a stored language before the page's own render where possible —
  // exercises/index.php calls AF_TR.init() after its data loads; the React
  // game applies on remount. As a fallback we run on DOMContentLoaded.
  window.AF_TR = {
    init: function () {
      mount();
      var map = lang && load(cacheKey);
      if (lang && map) applyMap(map);
      else if (lang) translateTo(lang); // cached lang but lost cache — refetch
    },
    annotate: annotate,
    current: current,
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (!bar) window.AF_TR.init();
    });
  }
})();
