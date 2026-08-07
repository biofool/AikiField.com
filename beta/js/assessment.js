/* ==========================================================================
   AikiField — BETA assessment engine
   Drives all four /beta/ assessment pages. No framework, no build step.

   Data lives in beta/data/*.json and is fetched at runtime — nothing that
   resembles a question bank or a lookup table is hardcoded here.

   Storage: localStorage only. Nothing is transmitted anywhere.
   ========================================================================== */

(function () {
  'use strict';

  var STORAGE_KEY = 'aikifield.beta.assessment.v1';
  var DATA_DIR = 'data/';

  /* ---------------------------------------------------------------- utils */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function mean(nums) {
    if (!nums.length) return 0;
    var t = 0, i;
    for (i = 0; i < nums.length; i++) { t += nums[i]; }
    return t / nums.length;
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function fail(message, err) {
    // Never fail silently — surface to the user and log with detail.
    if (err) { console.error('[beta-assessment] ' + message, err); }
    else { console.error('[beta-assessment] ' + message); }
    var host = $('[data-bta-error]');
    if (host) {
      host.hidden = false;
      host.innerHTML = '<p class="bta-body"><strong>This page could not load its assessment data.</strong></p>' +
        '<p class="bta-body bta-small">' + esc(message) + '</p>' +
        '<p class="bta-body bta-small">If you are opening this file directly from disk, the browser blocks the data ' +
        'files. Serve the site over HTTP instead — for example <code>python3 -m http.server</code> from the ' +
        'repository root, then open <code>/beta/assessment.html</code>.</p>';
    }
  }

  function getJSON(name) {
    return fetch(DATA_DIR + name, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status + ' fetching ' + name); }
      return res.json();
    });
  }

  /* -------------------------------------------------------------- storage */

  function emptyState() {
    return { version: 1, organisation: null, leadership: null };
  }

  function load() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[beta-assessment] localStorage is unavailable; responses will not persist.', err);
      return emptyState();
    }
    if (!raw) { return emptyState(); }
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') { throw new Error('stored value is not an object'); }
      if (!('organisation' in parsed)) { parsed.organisation = null; }
      if (!('leadership' in parsed)) { parsed.leadership = null; }
      return parsed;
    } catch (err) {
      console.warn('[beta-assessment] Stored responses were unreadable and have been discarded.', err);
      return emptyState();
    }
  }

  function save(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('[beta-assessment] Could not save responses to localStorage.', err);
      return false;
    }
  }

  function clearAll() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (err) {
      console.error('[beta-assessment] Could not clear stored responses.', err);
      return false;
    }
  }

  function isComplete(state, id, spec) {
    var rec = state[id];
    if (!rec || !rec.answers || !rec.completedAt) { return false; }
    var total = 0, answered = 0;
    spec.groups.forEach(function (g) {
      g.questions.forEach(function (q) {
        total++;
        if (typeof rec.answers[q.id] === 'number') { answered++; }
      });
    });
    return total > 0 && answered === total;
  }

  /* -------------------------------------------------------------- scoring */

  function scoreAssessment(spec, answers) {
    var groups = spec.groups.map(function (g) {
      var vals = g.questions
        .map(function (q) { return answers[q.id]; })
        .filter(function (v) { return typeof v === 'number'; });
      return {
        id: g.id,
        name: g.name,
        short: g.short || g.name,
        subtitle: g.subtitle || '',
        cluster: g.cluster || null,
        score: round1(mean(vals)),
        answered: vals.length,
        total: g.questions.length
      };
    });
    var scores = groups.map(function (g) { return g.score; });
    var hi = Math.max.apply(null, scores);
    var lo = Math.min.apply(null, scores);
    var ranked = groups.slice().sort(function (a, b) { return b.score - a.score; });
    return {
      groups: groups,
      level: round1(mean(scores)),
      spread: round1(hi - lo),
      highest: hi,
      lowest: lo,
      strengths: ranked.slice(0, 2),
      edges: ranked.slice(-2).reverse()
    };
  }

  function clusterScores(spec, result) {
    var out = {};
    var defs = spec.clusters || {};
    Object.keys(defs).forEach(function (cid) {
      var members = defs[cid].members || [];
      var vals = result.groups
        .filter(function (g) { return members.indexOf(g.id) !== -1; })
        .map(function (g) { return g.score; });
      out[cid] = { id: cid, name: defs[cid].name, description: defs[cid].description, score: round1(mean(vals)) };
    });
    return out;
  }

  function orgBucket(axes, result) {
    var levels = axes.organisation.levels;
    var shapes = axes.organisation.shapes;
    var level = null, shape = null, i;
    for (i = 0; i < levels.length; i++) {
      if (result.level < levels[i].max) { level = levels[i]; break; }
    }
    if (!level) { level = levels[levels.length - 1]; }
    for (i = 0; i < shapes.length; i++) {
      if (result.spread <= shapes[i].maxSpread) { shape = shapes[i]; break; }
    }
    if (!shape) { shape = shapes[shapes.length - 1]; }
    return 'org-' + level.id + '-' + shape.id;
  }

  function leadershipBucket(axes, clusters) {
    var ids = Object.keys(clusters);
    if (!ids.length) { return 'lead-even'; }
    var vals = ids.map(function (id) { return clusters[id].score; });
    var hi = Math.max.apply(null, vals);
    var lo = Math.min.apply(null, vals);
    if ((hi - lo) <= axes.leadership.evenThreshold) { return 'lead-even'; }
    var leadId = ids[0];
    ids.forEach(function (id) { if (clusters[id].score > clusters[leadId].score) { leadId = id; } });
    return 'lead-' + leadId;
  }

  function levelNote(notes, value) {
    if (!notes) { return ''; }
    for (var i = 0; i < notes.length; i++) {
      if (value < notes[i].max) { return notes[i].text; }
    }
    return notes.length ? notes[notes.length - 1].text : '';
  }

  function tendencyFromScenarios(scenarioData, picks) {
    var counts = {};
    var chosen = 0;
    (scenarioData.scenarios || []).forEach(function (sc) {
      var optId = picks && picks[sc.id];
      if (!optId) { return; }
      var opt = sc.options.filter(function (o) { return o.id === optId; })[0];
      if (!opt) { return; }
      chosen++;
      counts[opt.tendency] = (counts[opt.tendency] || 0) + 1;
    });
    if (!chosen) { return null; }
    var best = null;
    Object.keys(counts).forEach(function (t) {
      if (!best || counts[t] > counts[best]) { best = t; }
    });
    // A tie across every option means no dominant tendency — say so rather
    // than picking arbitrarily.
    var tied = Object.keys(counts).filter(function (t) { return counts[t] === counts[best]; });
    return {
      id: tied.length > 1 ? null : best,
      tied: tied.length > 1,
      counts: counts,
      answered: chosen,
      detail: tied.length > 1 ? null : scenarioData.tendencies[best]
    };
  }

  /* ---------------------------------------------------------------- radar */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function renderRadar(host, result, opts) {
    opts = opts || {};
    var size = 520, c = size / 2, R = 176, max = 6, rings = 5;
    var groups = result.groups;
    var n = groups.length;
    var edgeIds = (result.edges || []).map(function (g) { return g.id; });
    var titleId = (opts.idPrefix || 'radar') + '-title';
    var descId = (opts.idPrefix || 'radar') + '-desc';

    host.innerHTML = '';
    var svg = svgEl('svg', {
      'class': 'bta-radar',
      viewBox: '0 0 ' + size + ' ' + size,
      role: 'img',
      'aria-labelledby': titleId + ' ' + descId
    });

    var title = svgEl('title', { id: titleId });
    title.textContent = opts.title || 'Your profile';
    svg.appendChild(title);

    var desc = svgEl('desc', { id: descId });
    desc.textContent = groups.map(function (g) { return g.name + ' ' + g.score.toFixed(1) + ' out of 6'; }).join('; ') +
      '. The same figures are listed in the table below this chart.';
    svg.appendChild(desc);

    var i, k;

    /* Concentric rings — decorative field-map motif. */
    for (k = 1; k <= rings; k++) {
      svg.appendChild(svgEl('circle', {
        'class': 'bta-radar__ring',
        cx: c, cy: c, r: (R * k / rings).toFixed(1),
        'aria-hidden': 'true'
      }));
    }

    function point(index, value) {
      var angle = (-Math.PI / 2) + (index * 2 * Math.PI / n);
      var r = R * (value / max);
      return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle), angle: angle };
    }

    /* Axes */
    for (i = 0; i < n; i++) {
      var outer = point(i, max);
      svg.appendChild(svgEl('line', {
        'class': 'bta-radar__axis',
        x1: c, y1: c, x2: outer.x.toFixed(1), y2: outer.y.toFixed(1),
        'aria-hidden': 'true'
      }));
    }

    /* Shape */
    var pts = groups.map(function (g, idx) {
      var p = point(idx, Math.max(g.score, 0.15));
      return p.x.toFixed(1) + ',' + p.y.toFixed(1);
    });
    svg.appendChild(svgEl('polygon', {
      'class': 'bta-radar__shape' + (opts.variant === 'alt' ? ' bta-radar__shape--alt' : ''),
      points: pts.join(' ')
    }));

    /* Vertices + labels */
    groups.forEach(function (g, idx) {
      var isEdge = edgeIds.indexOf(g.id) !== -1;
      var p = point(idx, Math.max(g.score, 0.15));
      svg.appendChild(svgEl('circle', {
        'class': 'bta-radar__dot' + (isEdge ? ' bta-radar__dot--edge' : ''),
        cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5
      }));

      var lp = point(idx, max);
      var lx = c + (lp.x - c) * 1.14;
      var ly = c + (lp.y - c) * 1.14;
      var anchor = 'middle';
      if (lx > c + 12) { anchor = 'start'; }
      else if (lx < c - 12) { anchor = 'end'; }
      var label = svgEl('text', {
        'class': 'bta-radar__label' + (isEdge ? ' bta-radar__label--edge' : ''),
        x: lx.toFixed(1), y: (ly + 4).toFixed(1),
        'text-anchor': anchor
      });
      label.textContent = g.short + ' ' + g.score.toFixed(1);
      svg.appendChild(label);
    });

    host.appendChild(svg);
  }

  function readoutTable(result, caption) {
    var edgeIds = result.edges.map(function (g) { return g.id; });
    var strongIds = result.strengths.map(function (g) { return g.id; });
    var rows = result.groups.map(function (g) {
      var cls = '';
      var note = '';
      if (strongIds.indexOf(g.id) !== -1) { cls = 'is-strength'; note = ' — strength'; }
      else if (edgeIds.indexOf(g.id) !== -1) { cls = 'is-edge'; note = ' — development edge'; }
      return '<tr><th scope="row" class="' + cls + '">' + esc(g.name) + esc(note) + '</th>' +
        '<td class="' + cls + '">' + g.score.toFixed(1) + '</td></tr>';
    }).join('');
    return '<table class="bta-readout">' +
      '<caption>' + esc(caption) + '</caption>' +
      '<thead><tr><th scope="col">Area</th><th scope="col">Score (1–6)</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function legendHTML() {
    return '<p class="bta-legend">' +
      '<span class="bta-legend__item"><span class="bta-legend__swatch bta-legend__swatch--teal" aria-hidden="true"></span>Strength — relative to the rest of your own profile</span>' +
      '<span class="bta-legend__item"><span class="bta-legend__swatch bta-legend__swatch--amber" aria-hidden="true"></span>Development edge — where practice would change most</span>' +
      '</p>';
  }

  /* ------------------------------------------------------------ plan build */

  function planHTML(practices, edgeGroups) {
    var items = edgeGroups.map(function (g) {
      var p = practices.groups[g.id];
      if (!p) {
        console.warn('[beta-assessment] No practice defined for group "' + g.id + '"; omitted from the plan.');
        return '';
      }
      return '<li class="bta-plan__item">' +
        '<p class="bta-plan__label">' + esc(p.label) + '</p>' +
        '<span class="bta-plan__when">This week</span>' +
        '<p class="bta-body">' + esc(p.week1) + '</p>' +
        '<span class="bta-plan__when">By day 30</span>' +
        '<p class="bta-body">' + esc(p.month) + '</p>' +
        '</li>';
    }).filter(Boolean).join('');
    if (!items) { return '<p class="bta-body">No practices could be matched to your development edges.</p>'; }
    return '<p class="bta-body">' + esc(practices.framing) + '</p><ul class="bta-plan">' + items + '</ul>';
  }

  /* --------------------------------------------------------- clear control */

  function wireClearButtons() {
    $$('[data-bta-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ok = window.confirm(
          'Delete every response stored in this browser?\n\n' +
          'Both assessments and any cross-view will be cleared. This cannot be undone.'
        );
        if (!ok) { return; }
        if (clearAll()) {
          window.location.reload();
        } else {
          var status = $('[data-bta-clear-status]');
          if (status) { status.textContent = 'Responses could not be cleared — your browser is blocking local storage.'; }
        }
      });
    });
  }

  /* --------------------------------------------------------------- hub page */

  function initHub(data) {
    var state = load();
    var specs = data.questions.assessments;

    ['organisation', 'leadership'].forEach(function (id) {
      var spec = specs[id];
      var done = isComplete(state, id, spec);
      var chip = $('[data-bta-status="' + id + '"]');
      var cta = $('[data-bta-cta="' + id + '"]');
      if (chip) {
        chip.className = 'bta-chip ' + (done ? 'bta-chip--done' : 'bta-chip--todo');
        chip.textContent = done ? 'Complete' : 'Not started';
        if (!done && state[id] && state[id].answers && Object.keys(state[id].answers).length) {
          chip.textContent = 'In progress';
        }
      }
      if (cta) { cta.textContent = done ? 'Review your ' + spec.shortTitle.toLowerCase() + ' result' : 'Begin the ' + spec.shortTitle.toLowerCase() + ' assessment'; }
    });

    var bothDone = isComplete(state, 'organisation', specs.organisation) &&
                   isComplete(state, 'leadership', specs.leadership);
    var xLink = $('[data-bta-crossview-ready]');
    var xWait = $('[data-bta-crossview-waiting]');
    if (xLink) { xLink.hidden = !bothDone; }
    if (xWait) { xWait.hidden = bothDone; }

    var hasAny = !!(state.organisation || state.leadership);
    $$('[data-bta-has-data]').forEach(function (el) { el.hidden = !hasAny; });
  }

  /* ---------------------------------------------------------- flow page */

  function initFlow(data, assessmentId) {
    var spec = data.questions.assessments[assessmentId];
    var scale = data.questions.scale;
    var state = load();
    var rec = state[assessmentId] || { answers: {}, scenarios: {}, completedAt: null };
    if (!rec.answers) { rec.answers = {}; }
    if (!rec.scenarios) { rec.scenarios = {}; }

    var formHost = $('[data-bta-questions]');
    var form = $('[data-bta-form]');
    var scenHost = $('[data-bta-scenarios]');
    var resultsSection = $('[data-bta-results]');
    var flowSection = $('[data-bta-flow]');
    var progressFill = $('[data-bta-progress-fill]');
    var progressText = $('[data-bta-progress-text]');
    var submitBtn = $('[data-bta-submit]');
    var submitHint = $('[data-bta-submit-hint]');

    /* -- render questions -- */
    var stemHTML = '<p class="bta-stem">' + esc(scale.stem) + '</p>';
    var groupsHTML = spec.groups.map(function (g) {
      var qs = g.questions.map(function (q) {
        var opts = '';
        for (var v = scale.min; v <= scale.max; v++) {
          var inputId = q.id + '-' + v;
          var checked = rec.answers[q.id] === v ? ' checked' : '';
          opts += '<span class="bta-scale__opt">' +
            '<input class="bta-scale__input" type="radio" id="' + esc(inputId) + '" name="' + esc(q.id) + '" value="' + v + '"' + checked + '>' +
            '<label class="bta-scale__label" for="' + esc(inputId) + '">' + v +
            '<span class="bta-vh"> — ' + esc(scale.labels[String(v)]) + '</span></label>' +
            '</span>';
        }
        return '<fieldset class="bta-q">' +
          '<legend class="bta-q__legend">' + esc(q.text) + '</legend>' +
          '<div class="bta-scale">' +
          '<span class="bta-scale__anchor" aria-hidden="true">' + esc(scale.lowAnchor) + '</span>' +
          opts +
          '<span class="bta-scale__anchor bta-scale__anchor--hi" aria-hidden="true">' + esc(scale.highAnchor) + '</span>' +
          '</div></fieldset>';
      }).join('');
      return '<section class="bta-group">' +
        '<div class="bta-group__head">' +
        '<h3 class="bta-group__name">' + esc(g.name) + '</h3>' +
        (g.subtitle ? '<p class="bta-group__sub">' + esc(g.subtitle) + '</p>' : '') +
        '</div>' + qs + '</section>';
    }).join('');
    formHost.innerHTML = stemHTML + groupsHTML;

    /* -- render scenarios (leadership only) -- */
    var scenarioData = data.scenarios || null;
    if (scenHost && scenarioData) {
      scenHost.innerHTML = '<p class="bta-body">' + esc(scenarioData.intro) + '</p>' +
        scenarioData.scenarios.map(function (sc) {
          var opts = sc.options.map(function (o) {
            var checked = rec.scenarios[sc.id] === o.id ? ' checked' : '';
            return '<div class="bta-choice">' +
              '<input class="bta-choice__input" type="radio" id="' + esc(o.id) + '" name="' + esc(sc.id) + '" value="' + esc(o.id) + '"' + checked + '>' +
              '<label class="bta-choice__label" for="' + esc(o.id) + '">' + esc(o.text) + '</label>' +
              '</div>';
          }).join('');
          return '<section class="bta-group bta-scenario">' +
            '<h3 class="bta-group__name">' + esc(sc.title) + '</h3>' +
            '<p class="bta-scenario__text">' + esc(sc.text) + '</p>' +
            '<fieldset class="bta-choices"><legend class="bta-vh">' + esc(sc.title) + ' — choose your response</legend>' +
            opts + '</fieldset></section>';
        }).join('');
    } else if (scenHost) {
      scenHost.closest('[data-bta-scenario-section]').hidden = true;
    }

    /* -- totals -- */
    var totalQuestions = spec.groups.reduce(function (t, g) { return t + g.questions.length; }, 0);

    function answeredCount() {
      return Object.keys(rec.answers).filter(function (k) { return typeof rec.answers[k] === 'number'; }).length;
    }

    function refreshProgress() {
      var a = answeredCount();
      var pct = Math.round((a / totalQuestions) * 100);
      if (progressFill) { progressFill.style.width = pct + '%'; }
      if (progressText) { progressText.textContent = a + ' of ' + totalQuestions + ' answered'; }
      var ready = a === totalQuestions;
      if (submitBtn) { submitBtn.disabled = !ready; }
      if (submitHint) {
        submitHint.textContent = ready ? '' : 'Answer every question to see your profile.';
      }
      var bar = $('[data-bta-progressbar]');
      if (bar) {
        bar.setAttribute('aria-valuenow', String(a));
        bar.setAttribute('aria-valuetext', a + ' of ' + totalQuestions + ' answered');
      }
    }

    function persist() {
      state[assessmentId] = rec;
      save(state);
    }

    form.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || t.type !== 'radio') { return; }
      if (t.classList.contains('bta-scale__input')) {
        rec.answers[t.name] = parseInt(t.value, 10);
      } else if (t.classList.contains('bta-choice__input')) {
        rec.scenarios[t.name] = t.value;
      } else {
        return;
      }
      persist();
      refreshProgress();
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (answeredCount() !== totalQuestions) {
        refreshProgress();
        return;
      }
      rec.completedAt = new Date().toISOString();
      persist();
      showResults(true);
    });

    var reviewBtn = $('[data-bta-review]');
    if (reviewBtn) {
      reviewBtn.addEventListener('click', function () {
        resultsSection.hidden = true;
        flowSection.hidden = false;
        flowSection.scrollIntoView({ block: 'start' });
        $('[data-bta-questions] input').focus();
      });
    }

    /* -- results -- */
    function showResults(focus) {
      var result = scoreAssessment(spec, rec.answers);
      flowSection.hidden = true;
      resultsSection.hidden = false;

      renderRadar($('[data-bta-radar]'), result, {
        idPrefix: assessmentId + '-radar',
        title: spec.title + ' — your profile'
      });
      $('[data-bta-legend]').innerHTML = legendHTML();
      $('[data-bta-readout]').innerHTML = readoutTable(result, spec.title + ' — all scores, highest to lowest as shown on the chart.');

      var strengths = result.strengths.map(function (g) { return g.name; }).join(' and ');
      var edges = result.edges.map(function (g) { return g.name; }).join(' and ');
      $('[data-bta-summary]').innerHTML =
        '<p class="bta-body">Across ' + spec.groups.length + ' areas your profile sits highest in <strong>' +
        esc(strengths) + '</strong> and lowest in <strong>' + esc(edges) + '</strong>. ' +
        'These are relative to each other, not to anyone else — the shape is the reading, not the number.</p>';

      var planHost = $('[data-bta-plan]');
      if (planHost && data.practices) {
        planHost.innerHTML = planHTML(data.practices, result.edges);
      }

      var tendHost = $('[data-bta-tendency]');
      if (tendHost && scenarioData) {
        var tend = tendencyFromScenarios(scenarioData, rec.scenarios);
        if (!tend) {
          tendHost.innerHTML = '<p class="bta-body bta-muted">You have not answered the pressure scenarios yet. ' +
            'They are optional — they add a reading of what you reach for first when the situation is live.</p>';
        } else if (tend.tied || !tend.detail) {
          tendHost.innerHTML = '<p class="bta-body">Your scenario responses are evenly spread across several modes. ' +
            'You do not have one default under pressure — you choose per situation, which is its own kind of range.</p>';
        } else {
          tendHost.innerHTML =
            '<h3 class="bta-h3">' + esc(tend.detail.name) + '</h3>' +
            '<p class="bta-body">' + esc(tend.detail.reading) + '</p>' +
            '<p class="bta-body"><strong>What it gives you.</strong> ' + esc(tend.detail.strength) + '</p>' +
            '<p class="bta-body"><strong>What it costs.</strong> ' + esc(tend.detail.edge) + '</p>';
        }
      }

      var other = assessmentId === 'leadership' ? 'organisation' : 'leadership';
      var otherDone = isComplete(state, other, data.questions.assessments[other]);
      var xReady = $('[data-bta-xview-ready]');
      var handoff = $('[data-bta-handoff]');
      if (xReady) { xReady.hidden = !otherDone; }
      if (handoff) { handoff.hidden = otherDone; }

      if (focus) {
        resultsSection.scrollIntoView({ block: 'start' });
        var h = $('[data-bta-results-heading]');
        if (h) { h.focus(); }
      }
    }

    refreshProgress();
    if (isComplete(state, assessmentId, spec)) {
      showResults(false);
    } else {
      resultsSection.hidden = true;
      flowSection.hidden = false;
    }
  }

  /* ------------------------------------------------------- cross-view page */

  function initCrossview(data) {
    var state = load();
    var specs = data.questions.assessments;
    var orgDone = isComplete(state, 'organisation', specs.organisation);
    var leadDone = isComplete(state, 'leadership', specs.leadership);

    var waiting = $('[data-bta-xview-waiting]');
    var content = $('[data-bta-xview-content]');

    if (!orgDone || !leadDone) {
      content.hidden = true;
      waiting.hidden = false;
      var missing = [];
      if (!orgDone) { missing.push({ id: 'organisation', spec: specs.organisation }); }
      if (!leadDone) { missing.push({ id: 'leadership', spec: specs.leadership }); }
      $('[data-bta-xview-missing]').innerHTML =
        '<p class="bta-body">The cross-view needs both assessments. Still outstanding:</p>' +
        '<ul class="bta-body">' + missing.map(function (m) {
          return '<li><a href="' + esc(m.spec.page) + '">' + esc(m.spec.title) + '</a></li>';
        }).join('') + '</ul>';
      return;
    }

    waiting.hidden = true;
    content.hidden = false;

    var xv = data.crossview;
    var orgResult = scoreAssessment(specs.organisation, state.organisation.answers);
    var leadResult = scoreAssessment(specs.leadership, state.leadership.answers);
    var clusters = clusterScores(specs.leadership, leadResult);

    var orgId = orgBucket(xv.axes, orgResult);
    var leadId = leadershipBucket(xv.axes, clusters);
    var orgMeta = xv.axes.organisation.buckets[orgId];
    var leadMeta = xv.axes.leadership.buckets[leadId];
    var combo = xv.combinations[orgId + '|' + leadId];

    if (!combo) {
      console.warn('[beta-assessment] No interpretation for combination "' + orgId + '|' + leadId + '"; using fallback.');
      combo = xv.fallback;
    }
    if (!orgMeta || !leadMeta) {
      console.warn('[beta-assessment] Unknown bucket metadata for ' + orgId + ' / ' + leadId + '.');
    }

    $('[data-bta-xview-axes]').innerHTML =
      '<div class="bta-xview">' +
      '<div class="bta-xview__row">' +
      '<span class="bta-xview__axis-label">' + esc(xv.axes.organisation.label) + '</span>' +
      '<span class="bta-xview__axis-value">' + esc(orgMeta ? orgMeta.name : orgId) + '</span>' +
      '<span class="bta-muted bta-small">' + esc(orgMeta ? orgMeta.descriptor : '') + '</span>' +
      '</div>' +
      '<div class="bta-xview__row">' +
      '<span class="bta-xview__axis-label">' + esc(xv.axes.leadership.label) + '</span>' +
      '<span class="bta-xview__axis-value">' + esc(leadMeta ? leadMeta.name : leadId) + '</span>' +
      '<span class="bta-muted bta-small">' + esc(leadMeta ? leadMeta.descriptor : '') + '</span>' +
      '</div>' +
      '</div>';

    $('[data-bta-xview-reading]').innerHTML =
      '<h2 class="bta-xview__headline">' + esc(combo.headline) + '</h2>' +
      '<p class="bta-body">' + esc(combo.interpretation) + '</p>' +
      '<p class="bta-body bta-muted">' + esc(levelNote(xv.levelNotes.leadership, leadResult.level)) + '</p>' +
      '<div class="bta-xview__note bta-xview__note--watch">' +
      '<span class="bta-xview__note-label">What to watch</span>' +
      '<p class="bta-body">' + esc(combo.watch) + '</p></div>' +
      '<div class="bta-xview__note bta-xview__note--lever">' +
      '<span class="bta-xview__note-label">Highest-leverage move</span>' +
      '<p class="bta-body">' + esc(combo.lever) + '</p></div>';

    renderRadar($('[data-bta-radar-org]'), orgResult, {
      idPrefix: 'org-radar',
      title: specs.organisation.title + ' — your profile'
    });
    $('[data-bta-readout-org]').innerHTML = readoutTable(orgResult, specs.organisation.title + ' — all category scores.');

    renderRadar($('[data-bta-radar-lead]'), leadResult, {
      idPrefix: 'lead-radar',
      variant: 'alt',
      title: specs.leadership.title + ' — your profile'
    });
    $('[data-bta-readout-lead]').innerHTML = readoutTable(leadResult, specs.leadership.title + ' — all dimension scores.');

    $('[data-bta-legend]').innerHTML = legendHTML();

    var clusterRows = Object.keys(clusters).map(function (cid) {
      var cl = clusters[cid];
      return '<tr><th scope="row">' + esc(cl.name) + ' <span class="bta-muted">— ' + esc(cl.description) + '</span></th>' +
        '<td>' + cl.score.toFixed(1) + '</td></tr>';
    }).join('');
    $('[data-bta-clusters]').innerHTML =
      '<table class="bta-readout"><caption>How your seven dimensions group into the three leadership clusters.</caption>' +
      '<thead><tr><th scope="col">Cluster</th><th scope="col">Score (1–6)</th></tr></thead>' +
      '<tbody>' + clusterRows + '</tbody></table>';

    var planHost = $('[data-bta-plan]');
    if (planHost && data.practices) {
      var combined = [orgResult.edges[0], leadResult.edges[0]].filter(Boolean);
      planHost.innerHTML = planHTML(data.practices, combined);
    }

    $('[data-bta-principle]').textContent = xv.principle;
  }

  /* ----------------------------------------------------------------- boot */

  function boot() {
    wireClearButtons();

    var page = document.body.getAttribute('data-bta-page');
    if (!page) { return; }

    var needs = ['questions.json'];
    if (page === 'leadership') { needs.push('scenarios.json', 'practices.json'); }
    if (page === 'organisation') { needs.push('practices.json'); }
    if (page === 'crossview') { needs.push('crossview.json', 'practices.json'); }

    Promise.all(needs.map(getJSON)).then(function (loaded) {
      var data = {};
      needs.forEach(function (name, i) {
        data[name.replace('.json', '')] = loaded[i];
      });
      if (page === 'hub') { initHub(data); }
      else if (page === 'organisation') { initFlow(data, 'organisation'); }
      else if (page === 'leadership') { initFlow(data, 'leadership'); }
      else if (page === 'crossview') { initCrossview(data); }
      else { console.warn('[beta-assessment] Unrecognised data-bta-page value: ' + page); }
    }).catch(function (err) {
      fail(err && err.message ? err.message : 'Unknown error loading assessment data.', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
