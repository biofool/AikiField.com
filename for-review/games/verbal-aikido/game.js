/**
 * Verbal Aikido Story Mode — Vanilla JS engine
 *
 * Loads content.json, renders scenes, handles choices,
 * updates the angry-face meter, routes outcomes and persists progress.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'va-game-progress';
  // Age-gate record lives under its own key so "Reset all progress" cannot
  // clear a declared under-age birthdate (issue #306).
  const AGE_GATE_KEY = 'va-age-gate';
  const MAX_SAFETY_LOG = 200;
  const PWA_MODE_KEY = 'va-pwa-mode';
  const MAX_METER = 3;
  const DEFAULT_LANG = 'en';

  let content = null;
  let i18n = {}; // UI strings from i18n/<lang>.json
  let i18nFallback = null; // English strings, used for missing keys
  let contentLoadError = null;
  let quiz = null; // transient quiz state: {lessonId, index, score}
  let stretch = null; // transient stretching session: {posture, index, answers}
  let spar = null; // transient sparring exchange: {attack, meter}
  // Minor-safety gate: {birthdate, locked, log}. `locked` is set once an
  // under-age birthdate is declared; the birthdate then cannot be changed.
  let ageGate = { birthdate: null, locked: false, log: [] };
  let state = {
    currentChapterId: null,
    currentNodeId: 'chapter_select',
    meter: 0,
    history: [],
    unlockedChapters: ['ch1'],
    completedChapters: [],
    unlockedLessons: [],
    completedLessons: [],
    starRatings: {},
    favorites: [],
    stretchSessions: 0,
    sparringSessions: 0,
    reminders: {},
    avatar: null,
    language: null,
  };

  function defaultState() {
    return {
      currentChapterId: null,
      currentNodeId: 'chapter_select',
      meter: 0,
      history: [],
      unlockedChapters: ['ch1'],
      completedChapters: [],
      unlockedLessons: [],
      completedLessons: [],
      starRatings: {},
      favorites: [],
      stretchSessions: 0,
      sparringSessions: 0,
      reminders: {},
      avatar: null,
      language: null,
    };
  }

  function migrateState() {
    // Backfill fields added after early saves (Discovery, Practice, Extras, Profile).
    const d = defaultState();
    Object.keys(d).forEach((k) => {
      if (state[k] === undefined) state[k] = d[k];
    });
    if (!Array.isArray(state.unlockedLessons)) state.unlockedLessons = [];
    if (!Array.isArray(state.completedLessons)) state.completedLessons = [];
    if (!Array.isArray(state.favorites)) state.favorites = [];
    // Older saves stored the language display name; convert to a code.
    if (typeof state.language === 'string' && state.language.length > 3) {
      const match = (content && content.profile && content.profile.languages || [])
        .find((l) => l.label === state.language);
      state.language = match ? match.code : null;
    }
  }

  /* ---------- i18n ---------- */

  // Look up a dotted key ("practice.sparring.begin") in the active language,
  // falling back to English for missing keys, then to the key itself.
  // {placeholders} are interpolated from vars.
  function t(key, vars) {
    const lookup = (dict) => key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
    let str = lookup(i18n);
    if (str === undefined && i18nFallback) str = lookup(i18nFallback);
    if (str === undefined) {
      console.warn(`i18n: missing key "${key}"`);
      return key;
    }
    if (vars && typeof str === 'string') {
      str = str.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
    }
    return str;
  }

  // Current language code — 'en' unless the player picked another language.
  function currentLang() {
    return state.language || DEFAULT_LANG;
  }

  // Content file for the active language. Translations drop in as
  // i18n/content.<code>.json; English stays in content.json.
  function contentUrl(lang) {
    return lang === DEFAULT_LANG ? 'content.json' : `i18n/content.${lang}.json`;
  }

  function fetchJson(url) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    });
  }

  // Load UI strings for a language; missing file falls back to English.
  function loadI18n(lang) {
    return fetchJson(`i18n/${lang}.json`)
      .catch((err) => {
        if (lang !== DEFAULT_LANG) {
          console.warn(`i18n: no strings file for "${lang}" (${err.message}); falling back to English.`);
          return fetchJson(`i18n/${DEFAULT_LANG}.json`);
        }
        throw err;
      })
      .then((data) => { i18n = data; });
  }

  const els = {
    app: document.getElementById('va-game'),
    meter: document.getElementById('meter'),
    meterLabel: document.getElementById('meter-label'),
    meterValue: document.getElementById('meter-value'),
    scene: document.getElementById('scene'),
    choices: document.getElementById('choices'),
    chapterTitle: document.getElementById('chapter-title'),
    speaker: document.getElementById('speaker'),
    dialogue: document.getElementById('dialogue'),
    feedback: document.getElementById('feedback'),
    feedbackText: document.getElementById('feedback-text'),
    controls: document.getElementById('controls'),
    log: document.getElementById('sr-log'),
    loadError: document.getElementById('load-error'),
    connectionStatus: document.getElementById('connection-status'),
    installBtn: document.getElementById('install-btn'),
    installPanel: document.getElementById('install-panel'),
    installConfirmBtn: document.getElementById('install-confirm-btn'),
    installMessage: document.getElementById('install-message'),
    iosInstructions: document.getElementById('ios-instructions'),
    modeToggle: document.getElementById('pwa-mode-toggle'),
    modeTabs: document.getElementById('mode-tabs'),
  };

  /* ---------- Persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // localStorage may be unavailable; game still works in-memory.
      console.warn('Could not save progress:', e);
    }
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          state = Object.assign({}, state, saved);
        }
      }
    } catch (e) {
      console.warn('Could not load progress:', e);
    }
    migrateState();
    loadAgeGate();
    migrateAgeGate();
  }

  // Deliberately leaves the age-gate record alone: a progress reset must not
  // let an under-age player re-declare their birthdate.
  function clearProgress() {
    quiz = null;
    stretch = null;
    spar = null;
    state = defaultState();
    save();
    render();
  }

  function loadAgeGate() {
    try {
      const raw = localStorage.getItem(AGE_GATE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        ageGate = {
          birthdate: typeof saved.birthdate === 'string' ? saved.birthdate : null,
          locked: saved.locked === true,
          log: Array.isArray(saved.log) ? saved.log : [],
        };
      }
    } catch (e) {
      console.warn('Could not load age-gate record:', e);
    }
  }

  function saveAgeGate() {
    try {
      localStorage.setItem(AGE_GATE_KEY, JSON.stringify(ageGate));
    } catch (e) {
      console.warn('Could not save age-gate record:', e);
    }
  }

  // Early Community builds kept birthdate/safetyLog inside the progress save,
  // where a reset wiped them. Move them to the age-gate record, dropping the
  // raw birthdate from old log entries.
  function migrateAgeGate() {
    if (state.birthdate === undefined && state.safetyLog === undefined) return;
    if (!ageGate.birthdate && typeof state.birthdate === 'string') {
      ageGate.birthdate = state.birthdate;
      const age = ageFromBirthdate(state.birthdate);
      if (age !== null && age < minorAge()) ageGate.locked = true;
    }
    if (Array.isArray(state.safetyLog)) {
      state.safetyLog.forEach((entry) => {
        const detail = entry && entry.detail ? { ...entry.detail } : null;
        if (detail) delete detail.birthdate;
        ageGate.log.push({ ...entry, detail });
      });
    }
    delete state.birthdate;
    delete state.safetyLog;
    save();
    saveAgeGate();
  }

  /* ---------- Content helpers ---------- */

  function getChapter(id) {
    return content.chapters.find((ch) => ch.id === id) || null;
  }

  function getNode(nodeId) {
    if (!nodeId) return null;
    if (content.globalNodes && content.globalNodes[nodeId]) {
      return content.globalNodes[nodeId];
    }
    if (content.placeholders && content.placeholders[nodeId]) {
      return content.placeholders[nodeId];
    }
    if (state.currentChapterId) {
      const chapter = getChapter(state.currentChapterId);
      if (chapter && chapter.nodes && chapter.nodes[nodeId]) {
        return chapter.nodes[nodeId];
      }
    }
    return null;
  }

  function responseTypeName(type) {
    return (content.responseTypes && content.responseTypes[type]) || type;
  }

  /* ---------- Discovery helpers ---------- */

  function getLessons() {
    return (content.discovery && content.discovery.lessons) || [];
  }

  function getLesson(id) {
    return getLessons().find((lesson) => lesson.id === id) || null;
  }

  function isLessonUnlocked(lesson) {
    return state.unlockedLessons.includes(lesson.id);
  }

  function isLessonCompleted(lesson) {
    return state.completedLessons.includes(lesson.id);
  }

  // "chapter:ch1" -> "Complete Chapter 1: A different way to respond"
  function unlockRequirementLabel(requirement) {
    if (typeof requirement !== 'string') return t('discovery.reqFallback');
    const [kind, id] = requirement.split(':');
    if (kind === 'chapter') {
      const chapter = getChapter(id);
      return chapter
        ? t('discovery.reqChapter', { title: chapter.title })
        : t('discovery.reqChapterUnknown', { id });
    }
    return t('discovery.reqOther', { requirement });
  }

  function unlockLessonsForChapter(chapterId) {
    getLessons().forEach((lesson) => {
      if (lesson.unlockRequirement === `chapter:${chapterId}` && !state.unlockedLessons.includes(lesson.id)) {
        state.unlockedLessons.push(lesson.id);
        announce(t('discovery.announceUnlock', { title: lesson.title }));
      }
    });
  }

  function clampMeter(value) {
    return Math.max(0, Math.min(MAX_METER, value));
  }

  /* ---------- Rendering ---------- */

  function setMeter(level) {
    state.meter = clampMeter(level);
    renderMeter();
  }

  function renderMeter() {
    const level = state.meter;
    const faces = ['😌', '😠', '😡', '🤬'];
    const labels = t('meter.labels') || [];

    els.meter.setAttribute('aria-valuenow', String(level));
    els.meterLabel.textContent = t('meter.value', { level, max: MAX_METER, label: labels[level] || '' });

    // Visually fill meter segments.
    els.meter.innerHTML = '';
    for (let i = 0; i <= MAX_METER; i += 1) {
      const seg = document.createElement('span');
      seg.className = 'meter-segment' + (i <= level ? ' filled' : '');
      seg.setAttribute('aria-hidden', 'true');
      seg.textContent = i <= level ? faces[level] : '';
      els.meter.appendChild(seg);
    }
    const value = document.createElement('span');
    value.id = 'meter-value';
    value.className = 'sr-only';
    value.textContent = els.meterLabel.textContent;
    els.meter.appendChild(value);
  }

  function announce(message) {
    if (els.log) {
      els.log.textContent = message;
    }
  }

  function clearScene() {
    els.speaker.textContent = '';
    els.dialogue.textContent = '';
    els.choices.innerHTML = '';
    els.feedback.classList.add('hidden');
    els.feedback.classList.remove('quiz-correct', 'quiz-incorrect');
    els.feedbackText.textContent = '';
    els.chapterTitle.textContent = '';
    els.controls.innerHTML = '';
  }

  function renderChapterSelect(node) {
    clearScene();
    renderModeTabs();
    els.chapterTitle.textContent = node.title || t('story.title');
    els.dialogue.textContent = node.text || t('story.selectPrompt');

    content.chapters.forEach((chapter) => {
      const unlocked = state.unlockedChapters.includes(chapter.id);
      const completed = state.completedChapters.includes(chapter.id);
      const btn = document.createElement('button');
      btn.className = 'choice-btn' + (completed ? ' completed' : '') + (!unlocked ? ' locked' : '');
      btn.textContent = `${chapter.title}${completed ? t('story.completedMark') : ''}${!unlocked ? t('story.lockedMark') : ''}`;
      btn.disabled = !unlocked;
      if (unlocked) {
        btn.addEventListener('click', () => startChapter(chapter.id));
      }
      els.choices.appendChild(btn);
    });

    const allComplete = content.chapters.length > 0 &&
      content.chapters.every((ch) => state.completedChapters.includes(ch.id));
    if (allComplete) {
      const levelName = (content.levels && content.levels[0]) || '';
      const banner = document.createElement('p');
      banner.className = 'level-complete';
      banner.textContent = t('story.levelComplete', { level: levelName });
      els.choices.appendChild(banner);
      announce(banner.textContent);
    }

    const discoveryBtn = document.createElement('button');
    discoveryBtn.className = 'choice-btn discovery-btn';
    discoveryBtn.textContent = t('story.discoveryButton');
    discoveryBtn.addEventListener('click', () => goToNode('discovery_list'));
    els.choices.appendChild(discoveryBtn);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'control-btn';
    resetBtn.textContent = t('story.resetProgress');
    resetBtn.addEventListener('click', () => {
      if (confirm(t('story.confirmReset'))) {
        clearProgress();
      }
    });
    els.controls.appendChild(resetBtn);
  }

  function renderIntro(chapter) {
    clearScene();
    renderModeTabs();
    setMeter(0);
    els.chapterTitle.textContent = chapter.title;
    els.speaker.textContent = t('story.narrator');
    els.dialogue.textContent = chapter.intro;

    const startBtn = document.createElement('button');
    startBtn.className = 'choice-btn primary';
    startBtn.textContent = t('story.startChapter');
    startBtn.addEventListener('click', () => goToNode(chapter.startNode));
    els.choices.appendChild(startBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'control-btn';
    backBtn.textContent = t('story.backToChapterList');
    backBtn.addEventListener('click', () => goToNode('chapter_select'));
    els.controls.appendChild(backBtn);

    announce(`${chapter.title}. ${chapter.intro}`);
  }

  function renderNode(node) {
    clearScene();
    renderModeTabs();

    const chapter = state.currentChapterId ? getChapter(state.currentChapterId) : null;
    if (chapter) {
      els.chapterTitle.textContent = chapter.title;
    }

    if (node.meter !== undefined && state.currentNodeId !== 'chapter_select') {
      setMeter(node.meter);
    }

    els.speaker.textContent = node.speaker || '';
    els.dialogue.textContent = node.text || '';

    if (node.message) {
      const msg = document.createElement('p');
      msg.className = 'node-message';
      msg.textContent = node.message;
      els.dialogue.appendChild(msg);
    }

    renderChoices(node);
    renderControls(node);

    announce(`${node.speaker || ''}: ${node.text || ''}`);
  }

  function renderChoices(node) {
    const choices = node.choices || [];
    if (!choices.length) return;

    choices.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.setAttribute('data-choice-id', choice.id);
      btn.setAttribute('tabindex', '0');

      const typeBadge = document.createElement('span');
      typeBadge.className = 'type-badge';
      typeBadge.textContent = choice.type;
      typeBadge.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'choice-text';
      text.textContent = choice.text;

      btn.appendChild(typeBadge);
      btn.appendChild(text);

      btn.addEventListener('click', () => choose(node, choice));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose(node, choice);
        }
      });

      els.choices.appendChild(btn);
    });
  }

  function renderControls(node) {
    // Global controls based on node type.
    if (node.type === 'success' || node.type === 'partial' || node.type === 'retry' || node.type === 'lesson') {
      // These nodes provide their own choices; no extra controls needed.
      return;
    }

    // During an attack node, offer a reset-to-chapter button.
    if (node.type === 'attack' || node.type === 'feedback') {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'control-btn';
      resetBtn.textContent = t('story.restartChapter');
      resetBtn.addEventListener('click', () => {
        if (confirm(t('story.confirmRestart'))) {
          const chapter = getChapter(state.currentChapterId);
          if (chapter) goToNode(chapter.startNode, true);
        }
      });
      els.controls.appendChild(resetBtn);
    }
  }

  /* ---------- Discovery views ---------- */

  function addBackToChaptersButton() {
    const backBtn = document.createElement('button');
    backBtn.className = 'control-btn';
    backBtn.textContent = t('story.backToChapters');
    backBtn.addEventListener('click', () => goToNode('chapter_select'));
    els.controls.appendChild(backBtn);
  }

  function renderDiscoveryList() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    els.chapterTitle.textContent = t('discovery.title');
    els.speaker.textContent = t('discovery.speaker');
    els.dialogue.textContent = t('discovery.intro');

    const list = document.createElement('div');
    list.className = 'lesson-list';

    const lessons = getLessons();
    if (!lessons.length) {
      const empty = document.createElement('p');
      empty.className = 'lesson-empty';
      empty.textContent = t('discovery.empty');
      list.appendChild(empty);
    }

    lessons.forEach((lesson) => {
      const unlocked = isLessonUnlocked(lesson);
      const completed = isLessonCompleted(lesson);
      const card = document.createElement('button');
      card.className = 'lesson-card' + (unlocked ? ' unlocked' : ' locked') + (completed ? ' completed' : '');
      card.disabled = !unlocked;

      const title = document.createElement('span');
      title.className = 'lesson-card-title';
      title.textContent = lesson.title + (completed ? t('discovery.completedMark') : '');

      const summary = document.createElement('span');
      summary.className = 'lesson-card-summary';
      summary.textContent = lesson.summary || '';

      const status = document.createElement('span');
      status.className = 'lesson-card-status';
      status.textContent = unlocked
        ? (completed ? t('discovery.statusCompleted') : t('discovery.statusUnlocked'))
        : t('discovery.statusLocked', { requirement: unlockRequirementLabel(lesson.unlockRequirement) });

      card.appendChild(title);
      card.appendChild(summary);
      card.appendChild(status);

      if (unlocked) {
        card.addEventListener('click', () => goToNode(`discovery_lesson:${lesson.id}`));
      }
      list.appendChild(card);
    });

    els.choices.appendChild(list);
    addBackToChaptersButton();
    announce(t('discovery.announceList'));
  }

  function renderLesson(lesson) {
    clearScene();
    renderModeTabs();
    setMeter(0);
    els.chapterTitle.textContent = lesson.title;
    els.speaker.textContent = t('discovery.lessonSpeaker');

    els.dialogue.innerHTML = '';
    (lesson.body || []).forEach((paragraph) => {
      const p = document.createElement('p');
      p.className = 'lesson-body-p';
      p.textContent = paragraph;
      els.dialogue.appendChild(p);
    });

    if (Array.isArray(lesson.media) && lesson.media.length) {
      const mediaNote = document.createElement('p');
      mediaNote.className = 'lesson-media-note';
      mediaNote.textContent = t('discovery.mediaNote', { list: lesson.media.map((m) => m.label || m.type).join(' · ') });
      els.dialogue.appendChild(mediaNote);
    }

    const completed = isLessonCompleted(lesson);
    const quizBtn = document.createElement('button');
    quizBtn.className = 'choice-btn primary';
    quizBtn.textContent = completed ? t('discovery.retakeQuiz') : t('discovery.takeQuiz');
    quizBtn.addEventListener('click', () => startQuiz(lesson.id));
    els.choices.appendChild(quizBtn);

    const listBtn = document.createElement('button');
    listBtn.className = 'control-btn';
    listBtn.textContent = t('discovery.backToList');
    listBtn.addEventListener('click', () => goToNode('discovery_list'));
    els.controls.appendChild(listBtn);
    addBackToChaptersButton();

    announce(t('discovery.announceLesson', { title: lesson.title }));
  }

  function startQuiz(lessonId) {
    quiz = { lessonId, index: 0, score: 0 };
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const lesson = getLesson(quiz.lessonId);
    if (!lesson) { goToNode('discovery_list'); return; }
    const questions = lesson.quiz || [];
    const q = questions[quiz.index];
    if (!q) { renderQuizResult(lesson); return; }

    clearScene();
    renderModeTabs();
    els.chapterTitle.textContent = t('discovery.quizTitle', { title: lesson.title });
    els.speaker.textContent = t('discovery.questionOf', { n: quiz.index + 1, total: questions.length });
    els.dialogue.textContent = q.question;

    q.choices.forEach((choiceText, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn quiz-choice';
      btn.textContent = choiceText;
      btn.addEventListener('click', () => answerQuiz(lesson, q, i, btn));
      els.choices.appendChild(btn);
    });

    announce(t('discovery.announceQuestion', { n: quiz.index + 1, total: questions.length, question: q.question }));
  }

  function answerQuiz(lesson, q, pickedIndex, pickedBtn) {
    const correct = pickedIndex === q.correctIndex;
    if (correct) quiz.score += 1;

    // Disable all choices, mark correct/incorrect.
    Array.from(els.choices.querySelectorAll('.quiz-choice')).forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correctIndex) btn.classList.add('correct');
      else if (btn === pickedBtn) btn.classList.add('incorrect');
    });

    els.feedback.classList.remove('hidden');
    els.feedback.classList.toggle('quiz-correct', correct);
    els.feedback.classList.toggle('quiz-incorrect', !correct);
    const message = t(correct ? 'discovery.correct' : 'discovery.incorrect', { explanation: q.explanation || '' });
    els.feedbackText.textContent = message;
    announce(message);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'choice-btn primary';
    const last = quiz.index >= (lesson.quiz || []).length - 1;
    nextBtn.textContent = last ? t('discovery.seeScore') : t('discovery.nextQuestion');
    nextBtn.addEventListener('click', () => {
      quiz.index += 1;
      els.feedback.classList.remove('quiz-correct', 'quiz-incorrect');
      renderQuizQuestion();
    });
    els.choices.appendChild(nextBtn);
    nextBtn.focus();
  }

  function renderQuizResult(lesson) {
    const total = (lesson.quiz || []).length;
    const threshold = content.discovery && typeof content.discovery.passThreshold === 'number'
      ? content.discovery.passThreshold
      : 0.66;
    const needed = Math.ceil(total * threshold);
    const passed = quiz.score >= needed;

    clearScene();
    renderModeTabs();
    els.chapterTitle.textContent = t('discovery.resultTitle', { title: lesson.title });
    els.speaker.textContent = t('discovery.scoreSpeaker');
    els.dialogue.textContent = t(passed ? 'discovery.resultPassed' : 'discovery.resultFailed', { score: quiz.score, total, needed });

    const banner = document.createElement('p');
    banner.className = 'score-banner ' + (passed ? 'pass' : 'fail');
    banner.textContent = passed ? t('discovery.bannerPass') : t('discovery.bannerFail');
    els.dialogue.appendChild(banner);
    announce(t('discovery.announceResult', { banner: banner.textContent, score: quiz.score, total }));

    if (passed && !state.completedLessons.includes(lesson.id)) {
      state.completedLessons.push(lesson.id);
      save();
    }

    const retryBtn = document.createElement('button');
    retryBtn.className = 'choice-btn' + (passed ? '' : ' primary');
    retryBtn.textContent = t('discovery.retakeQuiz');
    retryBtn.addEventListener('click', () => startQuiz(lesson.id));
    els.choices.appendChild(retryBtn);

    const listBtn = document.createElement('button');
    listBtn.className = 'choice-btn' + (passed ? ' primary' : '');
    listBtn.textContent = t('discovery.backToList');
    listBtn.addEventListener('click', () => goToNode('discovery_list'));
    els.choices.appendChild(listBtn);

    addBackToChaptersButton();
  }

  /* ---------- Mode tabs ---------- */

  const MODES = [
    { id: 'story', node: 'chapter_select' },
    { id: 'discovery', node: 'discovery_list' },
    { id: 'practice', node: 'practice_list' },
    { id: 'community', node: 'community_list' },
    { id: 'extras', node: 'extras_list' },
    { id: 'profile', node: 'profile_view' },
  ];

  function currentMode() {
    const n = state.currentNodeId || '';
    if (n.indexOf('discovery') === 0 || n === 'placeholder_discovery') return 'discovery';
    if (n.indexOf('practice') === 0) return 'practice';
    if (n.indexOf('community') === 0) return 'community';
    if (n.indexOf('extras') === 0 || n === 'placeholder_extras') return 'extras';
    if (n.indexOf('profile') === 0) return 'profile';
    return 'story';
  }

  function renderModeTabs() {
    if (!els.modeTabs) return;
    const mode = currentMode();
    els.modeTabs.innerHTML = '';
    MODES.forEach((m) => {
      const btn = document.createElement('button');
      btn.className = 'mode-tab' + (mode === m.id ? ' active' : '');
      btn.textContent = t(`tabs.${m.id}`);
      btn.setAttribute('aria-current', mode === m.id ? 'page' : 'false');
      btn.addEventListener('click', () => goToNode(m.node));
      els.modeTabs.appendChild(btn);
    });
  }

  /* ---------- Practice mode ---------- */

  function getPractice() { return content.practice || {}; }
  function getExtras() { return content.extras || {}; }
  function getProfileDef() { return content.profile || {}; }
  function getCommunity() { return content.community || {}; }

  function formatLen(sec) {
    const m = Math.round(sec / 60);
    return m >= 1 ? t('practice.centering.lenMin', { n: m }) : t('practice.centering.lenSec', { n: sec });
  }

  function renderPracticeList() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    els.chapterTitle.textContent = t('practice.title');
    els.speaker.textContent = t('practice.speaker');
    els.dialogue.textContent = t('practice.intro');

    const list = document.createElement('div');
    list.className = 'lesson-list';
    [
      { node: 'practice_centering', title: t('practice.cardCentering'), desc: t('practice.cardCenteringDesc') },
      { node: 'practice_stretch', title: t('practice.cardStretch'), desc: t('practice.cardStretchDesc') },
      { node: 'practice_spar', title: t('practice.cardSpar'), desc: t('practice.cardSparDesc') },
    ].forEach((item) => {
      const card = document.createElement('button');
      card.className = 'lesson-card unlocked';
      card.innerHTML = `<span class="lesson-card-title">${item.title}</span><span class="lesson-card-summary">${item.desc}</span>`;
      card.addEventListener('click', () => goToNode(item.node));
      list.appendChild(card);
    });
    els.choices.appendChild(list);
    addBackToChaptersButton();
    announce(t('practice.announce'));
  }

  /* ---------- Centering ---------- */

  function renderCentering() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const p = getPractice().centering || {};
    const acts = p.activities || [];
    els.chapterTitle.textContent = t('practice.centering.title');
    els.speaker.textContent = t('practice.centering.speaker');
    els.dialogue.textContent = p.intro || '';

    const styles = ['all', ...new Set(acts.map((a) => a.style))];
    const filterWrap = document.createElement('div');
    filterWrap.className = 'filter-row';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', t('practice.centering.filterAria'));
    styles.forEach((s) => {
      const o = document.createElement('option');
      o.value = s;
      o.textContent = s === 'all' ? t('practice.centering.allStyles') : s.charAt(0).toUpperCase() + s.slice(1);
      sel.appendChild(o);
    });
    filterWrap.appendChild(sel);
    els.choices.appendChild(filterWrap);

    const list = document.createElement('div');
    list.className = 'lesson-list';
    els.choices.appendChild(list);

    function draw() {
      list.innerHTML = '';
      acts.filter((a) => sel.value === 'all' || a.style === sel.value).forEach((a) => {
        const card = document.createElement('div');
        card.className = 'lesson-card activity-card';

        const head = document.createElement('div');
        head.className = 'activity-head';
        const title = document.createElement('span');
        title.className = 'lesson-card-title';
        title.textContent = `${a.title} · ${formatLen(a.lengthSec)}`;
        head.appendChild(title);

        const heart = document.createElement('button');
        heart.className = 'icon-btn';
        heart.textContent = state.favorites.includes(a.id) ? '♥' : '♡';
        heart.setAttribute('aria-label', t('practice.centering.favorite', { title: a.title }));
        heart.addEventListener('click', () => {
          const i = state.favorites.indexOf(a.id);
          if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(a.id);
          save(); draw();
        });
        head.appendChild(heart);
        card.appendChild(head);

        const desc = document.createElement('span');
        desc.className = 'lesson-card-summary';
        desc.textContent = a.label || '';
        card.appendChild(desc);

        const stars = document.createElement('div');
        stars.className = 'star-row';
        const rating = state.starRatings[a.id] || 0;
        for (let i = 1; i <= 5; i += 1) {
          const st = document.createElement('button');
          st.className = 'icon-btn star' + (i <= rating ? ' lit' : '');
          st.textContent = '★';
          st.setAttribute('aria-label', t(i > 1 ? 'practice.centering.ratePlural' : 'practice.centering.rate', { n: i }));
          st.addEventListener('click', () => { state.starRatings[a.id] = i; save(); draw(); });
          stars.appendChild(st);
        }
        card.appendChild(stars);
        list.appendChild(card);
      });
    }
    sel.addEventListener('change', draw);
    draw();

    const back = document.createElement('button');
    back.className = 'control-btn';
    back.textContent = t('practice.backToPractice');
    back.addEventListener('click', () => goToNode('practice_list'));
    els.controls.appendChild(back);
    addBackToChaptersButton();
    announce(t('practice.centering.announce', { n: acts.length }));
  }

  /* ---------- Stretching ---------- */

  function renderStretchPicker() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const st = getPractice().stretching || {};
    els.chapterTitle.textContent = t('practice.stretching.title');
    els.speaker.textContent = t('practice.stretching.speaker');
    els.dialogue.textContent = st.intro || '';

    ['posture1', 'posture2'].forEach((posture) => {
      const def = st[posture];
      if (!def) return;
      const card = document.createElement('button');
      card.className = 'lesson-card unlocked';
      const n = (def.questions || []).length;
      card.innerHTML = `<span class="lesson-card-title">${def.title}</span><span class="lesson-card-summary">${t('practice.stretching.guidedQuestions', { n })}${def.note ? ' — ' + def.note : ''}</span>`;
      card.addEventListener('click', () => {
        stretch = { posture, index: 0, answers: [] };
        state.currentNodeId = 'practice_stretch_session';
        renderStretchQuestion();
      });
      els.choices.appendChild(card);
    });

    const back = document.createElement('button');
    back.className = 'control-btn';
    back.textContent = t('practice.backToPractice');
    back.addEventListener('click', () => goToNode('practice_list'));
    els.controls.appendChild(back);
    addBackToChaptersButton();
    announce(t('practice.stretching.announcePicker'));
  }

  function renderStretchQuestion() {
    const def = (getPractice().stretching || {})[stretch.posture];
    const qs = def.questions || [];
    if (stretch.index >= qs.length) { renderStretchDone(def); return; }

    clearScene();
    setMeter(0);
    renderModeTabs();
    els.chapterTitle.textContent = def.title;
    els.speaker.textContent = t('practice.stretching.questionOf', { n: stretch.index + 1, total: qs.length });
    els.dialogue.textContent = qs[stretch.index];

    const ta = document.createElement('textarea');
    ta.className = 'stretch-answer';
    ta.setAttribute('aria-label', t('practice.stretching.answerAria'));
    ta.placeholder = t('practice.stretching.answerPlaceholder');
    els.choices.appendChild(ta);

    const next = document.createElement('button');
    next.className = 'choice-btn primary';
    next.textContent = stretch.index === qs.length - 1 ? t('practice.stretching.finishSession') : t('practice.stretching.nextQuestion');
    next.addEventListener('click', () => {
      stretch.answers.push(ta.value);
      stretch.index += 1;
      renderStretchQuestion();
    });
    els.choices.appendChild(next);

    const quit = document.createElement('button');
    quit.className = 'control-btn';
    quit.textContent = t('practice.stretching.quitSession');
    quit.addEventListener('click', () => { stretch = null; goToNode('practice_stretch'); });
    els.controls.appendChild(quit);
    announce(t('practice.stretching.announceQuestion', { n: stretch.index + 1 }));
    ta.focus();
  }

  function renderStretchDone(def) {
    clearScene();
    setMeter(0);
    renderModeTabs();
    state.stretchSessions += 1;
    save();
    els.chapterTitle.textContent = t('practice.stretching.doneTitle');
    els.speaker.textContent = t('practice.stretching.doneSpeaker');
    els.dialogue.textContent = t('practice.stretching.doneText', {
      answered: stretch.answers.filter(Boolean).length,
      total: stretch.answers.length,
      postureNote: t(stretch.posture === 'posture1' ? 'practice.stretching.posture1Note' : 'practice.stretching.posture2Note'),
    });

    const again = document.createElement('button');
    again.className = 'choice-btn';
    again.textContent = t('practice.stretching.doAnother');
    again.addEventListener('click', () => goToNode('practice_stretch'));
    els.choices.appendChild(again);

    const back = document.createElement('button');
    back.className = 'choice-btn primary';
    back.textContent = t('practice.backToPractice');
    back.addEventListener('click', () => { stretch = null; goToNode('practice_list'); });
    els.choices.appendChild(back);
    announce(t('practice.stretching.announceDone'));
  }

  /* ---------- Sparring ---------- */

  function renderSparring() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const sp = getPractice().sparring || {};
    const gateLesson = sp.gateLessonId ? getLesson(sp.gateLessonId) : null;
    const gated = gateLesson && !isLessonCompleted(gateLesson);

    els.chapterTitle.textContent = t('practice.sparring.title');
    els.speaker.textContent = t('practice.sparring.speaker');
    els.dialogue.textContent = sp.intro || '';

    if (gated) {
      const warn = document.createElement('p');
      warn.className = 'node-message';
      warn.textContent = t('practice.sparring.gateWarn', { title: gateLesson.title });
      els.dialogue.appendChild(warn);
      const go = document.createElement('button');
      go.className = 'choice-btn primary';
      go.textContent = t('practice.sparring.goToDiscovery');
      go.addEventListener('click', () => goToNode(`discovery_lesson:${gateLesson.id}`));
      els.choices.appendChild(go);
    } else {
      const begin = document.createElement('button');
      begin.className = 'choice-btn primary';
      begin.textContent = t('practice.sparring.begin');
      begin.addEventListener('click', startSpar);
      els.choices.appendChild(begin);
    }

    const back = document.createElement('button');
    back.className = 'control-btn';
    back.textContent = t('practice.backToPractice');
    back.addEventListener('click', () => goToNode('practice_list'));
    els.controls.appendChild(back);
    addBackToChaptersButton();
    announce(t('practice.sparring.announce'));
  }

  function startSpar() {
    const attacks = (getPractice().sparring || {}).attacks || [];
    const attack = attacks[Math.floor(Math.random() * attacks.length)] || t('practice.sparring.fallbackAttack');
    spar = { attack };
    state.currentNodeId = 'practice_spar_session';
    renderSparExchange();
  }

  function renderSparExchange() {
    clearScene();
    renderModeTabs();
    els.chapterTitle.textContent = t('practice.sparring.title');
    els.speaker.textContent = t('practice.sparring.botSpeaker');
    els.dialogue.textContent = `"${spar.attack}"`;
    setMeter(2); // bot always comes in hot

    const note = document.createElement('p');
    note.className = 'node-message';
    note.textContent = t('practice.sparring.selfAssess');
    els.dialogue.appendChild(note);

    (content.responseTypes ? Object.keys(content.responseTypes) : ['A', 'J', 'C', 'F', 'S', 'V', 'N']).forEach((type) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.innerHTML = `<span class="type-badge">${type}</span><span class="choice-text">${responseTypeName(type)}</span>`;
      btn.addEventListener('click', () => sparAnswer(type));
      els.choices.appendChild(btn);
    });

    const quit = document.createElement('button');
    quit.className = 'control-btn';
    quit.textContent = t('practice.sparring.leaveMat');
    quit.addEventListener('click', () => { spar = null; goToNode('practice_list'); });
    els.controls.appendChild(quit);
  }

  function sparAnswer(type) {
    els.choices.innerHTML = '';
    els.controls.innerHTML = '';
    els.feedback.classList.remove('hidden');
    const tip = (getPractice().sparring || {}).tip || '';
    if (type === 'A') {
      setMeter(state.meter - 1);
      state.sparringSessions += 1;
      save();
      els.feedbackText.textContent = t('practice.sparring.winText', { tip });
    } else {
      setMeter(state.meter + 1);
      els.feedbackText.textContent = t('practice.sparring.escalateText', { type: responseTypeName(type), tip });
    }

    const again = document.createElement('button');
    again.className = 'choice-btn primary';
    again.textContent = t('practice.sparring.nextAttack');
    again.addEventListener('click', startSpar);
    els.choices.appendChild(again);
    announce(els.feedbackText.textContent);
  }

  /* ---------- Community ---------- */

  // Also called while loading saves, before content.json has arrived.
  function minorAge() {
    const s = (content && content.community && content.community.safety) || {};
    return typeof s.minorAge === 'number' ? s.minorAge : 18;
  }

  function ageFromBirthdate(iso) {
    const dob = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age;
  }

  // Tri-state: true = under minorAge, false = adult, null = no age given yet.
  function isMinorUser() {
    if (!ageGate.birthdate) return null;
    const age = ageFromBirthdate(ageGate.birthdate);
    return age === null ? null : age < minorAge();
  }

  // Record an age-gate event on this device. Records age and minor status,
  // never the birthdate itself. Real enforcement needs the backend work
  // tracked in the megaplan.
  function logSafety(event, detail) {
    ageGate.log.push({ ts: new Date().toISOString(), event, detail: detail || null });
    if (ageGate.log.length > MAX_SAFETY_LOG) ageGate.log.splice(0, ageGate.log.length - MAX_SAFETY_LOG);
    saveAgeGate();
  }

  // Returns 'ok', 'invalid', or 'locked'. Once an under-age birthdate is
  // declared the record locks, so it cannot be re-entered to get past the gate.
  function setBirthdate(iso) {
    if (ageGate.locked) {
      logSafety('age_change_refused', { reason: 'locked' });
      return 'locked';
    }
    const age = ageFromBirthdate(iso);
    if (age === null || age < 0 || age > 120) return 'invalid';
    const isMinor = age < minorAge();
    ageGate.birthdate = iso;
    if (isMinor) ageGate.locked = true;
    logSafety('age_declared', { age, isMinor, locked: ageGate.locked });
    return 'ok';
  }

  // DOB form used by both the Profile tab and the Find a Practitioner gate.
  // onSaved(iso) is called after a valid birthdate is stored. When the record
  // is locked, a notice replaces the form.
  function renderAgeCheckForm(container, onSaved) {
    if (ageGate.locked) {
      const lockedNote = document.createElement('p');
      lockedNote.className = 'lesson-card-summary age-locked';
      lockedNote.textContent = t('community.practitioners.ageLocked', { age: minorAge() });
      container.appendChild(lockedNote);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'age-form';

    const label = document.createElement('label');
    label.className = 'age-label';
    label.textContent = t('community.practitioners.dobLabel');
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'dob-input';
    input.value = ageGate.birthdate || '';
    input.setAttribute('aria-label', t('community.practitioners.dobAria'));
    label.appendChild(input);
    wrap.appendChild(label);

    const confirm = document.createElement('button');
    confirm.className = 'choice-btn primary';
    confirm.textContent = t('community.practitioners.confirmAge');
    confirm.addEventListener('click', () => {
      const result = input.value ? setBirthdate(input.value) : 'invalid';
      if (result !== 'invalid') {
        onSaved(input.value);
      } else {
        announce(t('community.practitioners.dobInvalid'));
        input.classList.add('invalid');
      }
    });
    wrap.appendChild(confirm);
    container.appendChild(wrap);
  }

  function renderCommunityList() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const co = getCommunity();
    els.chapterTitle.textContent = t('community.title');
    els.speaker.textContent = t('community.speaker');
    els.dialogue.textContent = co.intro || t('community.intro');

    const list = document.createElement('div');
    list.className = 'lesson-list';
    [
      { node: 'community_forum', title: t('community.cardForum'), desc: t('community.cardForumDesc') },
      { node: 'community_events', title: t('community.cardEvents'), desc: t('community.cardEventsDesc') },
      { node: 'community_practitioners', title: t('community.cardPractitioners'), desc: t('community.cardPractitionersDesc') },
    ].forEach((item) => {
      const card = document.createElement('button');
      card.className = 'lesson-card unlocked';
      card.innerHTML = `<span class="lesson-card-title">${item.title}</span><span class="lesson-card-summary">${item.desc}</span>`;
      card.addEventListener('click', () => goToNode(item.node));
      list.appendChild(card);
    });
    els.choices.appendChild(list);
    addBackToChaptersButton();
    announce(t('community.announce'));
  }

  function renderCommunityForum() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const forum = getCommunity().forum || {};
    els.chapterTitle.textContent = t('community.forum.title');
    els.speaker.textContent = t('community.forum.speaker');
    els.dialogue.textContent = forum.note || '';

    const list = document.createElement('div');
    list.className = 'lesson-list';
    const threads = (forum.threads || []).slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    threads.forEach((thread) => {
      const card = document.createElement('div');
      card.className = 'lesson-card activity-card';

      const head = document.createElement('div');
      head.className = 'activity-head';
      const title = document.createElement('span');
      title.className = 'lesson-card-title';
      title.textContent = thread.title;
      head.appendChild(title);
      if (thread.pinned) {
        const pin = document.createElement('span');
        pin.className = 'tag';
        pin.textContent = t('community.forum.pinnedLabel');
        head.appendChild(pin);
      }
      card.appendChild(head);

      const excerpt = document.createElement('span');
      excerpt.className = 'lesson-card-summary';
      excerpt.textContent = thread.excerpt || '';
      card.appendChild(excerpt);

      const meta = document.createElement('span');
      meta.className = 'lesson-card-summary thread-meta';
      meta.textContent = t('community.forum.repliesLabel', { n: thread.replies || 0 });
      card.appendChild(meta);
      list.appendChild(card);
    });
    els.choices.appendChild(list);

    const back = document.createElement('button');
    back.className = 'control-btn';
    back.textContent = t('community.backToCommunity');
    back.addEventListener('click', () => goToNode('community_list'));
    els.controls.appendChild(back);
    addBackToChaptersButton();
    announce(t('community.forum.announce', { n: threads.length }));
  }

  function renderCommunityEvents() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const events = getCommunity().events || [];
    els.chapterTitle.textContent = t('community.events.title');
    els.speaker.textContent = t('community.events.speaker');
    els.dialogue.textContent = t('community.events.intro');

    const formats = ['all', 'online', 'in-person'];
    const filterWrap = document.createElement('div');
    filterWrap.className = 'filter-row';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', t('community.events.filterAria'));
    formats.forEach((f) => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f === 'all'
        ? t('community.events.allFormats')
        : t(f === 'online' ? 'community.events.online' : 'community.events.inPerson');
      sel.appendChild(o);
    });
    filterWrap.appendChild(sel);
    els.choices.appendChild(filterWrap);

    const list = document.createElement('div');
    list.className = 'lesson-list';
    els.choices.appendChild(list);

    function draw() {
      list.innerHTML = '';
      events
        .filter((e) => sel.value === 'all' || e.format === sel.value)
        .forEach((e) => {
          const card = document.createElement('div');
          card.className = 'lesson-card activity-card';

          const head = document.createElement('div');
          head.className = 'activity-head';
          const title = document.createElement('span');
          title.className = 'lesson-card-title';
          title.textContent = e.title;
          head.appendChild(title);
          const fmt = document.createElement('span');
          fmt.className = 'tag';
          fmt.textContent = t(e.format === 'online' ? 'community.events.online' : 'community.events.inPerson');
          head.appendChild(fmt);
          card.appendChild(head);

          const meta = document.createElement('span');
          meta.className = 'lesson-card-summary';
          meta.textContent = t('community.events.meta', {
            location: e.location || '',
            price: e.price ? `$${Number(e.price).toFixed(2)}` : t('community.events.freeLabel'),
            belt: e.beltLevel || 'all',
            theme: e.theme || '',
          });
          card.appendChild(meta);

          const note = document.createElement('span');
          note.className = 'lesson-card-summary';
          note.textContent = e.note || '';
          card.appendChild(note);
          list.appendChild(card);
        });
    }
    sel.addEventListener('change', draw);
    draw();

    const back = document.createElement('button');
    back.className = 'control-btn';
    back.textContent = t('community.backToCommunity');
    back.addEventListener('click', () => goToNode('community_list'));
    els.controls.appendChild(back);
    addBackToChaptersButton();
    announce(t('community.events.announce', { n: events.length }));
  }

  function renderPractitioners() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const minor = isMinorUser();
    logSafety('practitioner_access', {
      decision: minor === null ? 'age_required' : minor ? 'denied_minor' : 'allowed',
    });
    els.chapterTitle.textContent = t('community.practitioners.title');
    els.speaker.textContent = t('community.practitioners.speaker');
    els.dialogue.textContent = t('community.practitioners.intro');

    if (minor === null) {
      // No age given yet — ask before showing one-on-one matching.
      const warn = document.createElement('p');
      warn.className = 'node-message';
      warn.textContent = t('community.practitioners.gateText');
      els.dialogue.appendChild(warn);
      renderAgeCheckForm(els.choices, () => renderPractitioners());
    } else if (minor === true) {
      // Minor: no one-on-one matching. Offer age-appropriate alternatives.
      const warn = document.createElement('p');
      warn.className = 'node-message';
      warn.textContent = t('community.practitioners.minorText', { age: minorAge() });
      els.dialogue.appendChild(warn);

      const practice = document.createElement('button');
      practice.className = 'choice-btn primary';
      practice.textContent = t('community.practitioners.minorGoPractice');
      practice.addEventListener('click', () => goToNode('practice_list'));
      els.choices.appendChild(practice);

      const events = document.createElement('button');
      events.className = 'choice-btn';
      events.textContent = t('community.practitioners.minorGoEvents');
      events.addEventListener('click', () => goToNode('community_events'));
      els.choices.appendChild(events);
    } else {
      const practitioners = getCommunity().practitioners || [];
      const langs = ['all', ...new Set(practitioners.flatMap((p) => p.languages || []))];
      const filterWrap = document.createElement('div');
      filterWrap.className = 'filter-row';
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', t('community.practitioners.filterLangAria'));
      langs.forEach((code) => {
        const o = document.createElement('option');
        o.value = code;
        const lang = (getProfileDef().languages || []).find((l) => l.code === code);
        o.textContent = code === 'all' ? t('community.practitioners.allLanguages') : (lang ? lang.label : code);
        sel.appendChild(o);
      });
      sel.value = langs.includes(state.language) ? state.language : 'all';
      filterWrap.appendChild(sel);
      els.choices.appendChild(filterWrap);

      const list = document.createElement('div');
      list.className = 'lesson-list';
      els.choices.appendChild(list);

      function draw() {
        list.innerHTML = '';
        practitioners
          .filter((p) => sel.value === 'all' || (p.languages || []).includes(sel.value))
          .forEach((p) => {
            const card = document.createElement('div');
            card.className = 'lesson-card activity-card';

            const head = document.createElement('div');
            head.className = 'activity-head';
            const title = document.createElement('span');
            title.className = 'lesson-card-title';
            title.textContent = `${p.avatar || '🥋'} ${p.name}`;
            head.appendChild(title);
            const belt = document.createElement('span');
            belt.className = 'tag';
            belt.textContent = t('community.practitioners.beltLabel', { belt: p.belt });
            head.appendChild(belt);
            card.appendChild(head);

            const meta = document.createElement('span');
            meta.className = 'lesson-card-summary';
            const langNames = (p.languages || [])
              .map((code) => {
                const l = (getProfileDef().languages || []).find((x) => x.code === code);
                return l ? l.label : code;
              })
              .join(', ');
            meta.textContent = t('community.practitioners.meta', {
              languages: langNames,
              modes: (p.modes || []).map((m) => t(`community.modes.${m}`)).join(', '),
            });
            card.appendChild(meta);

            const avail = document.createElement('span');
            avail.className = 'lesson-card-summary';
            avail.textContent = t('community.practitioners.availabilityLabel', { availability: p.availability || '' });
            card.appendChild(avail);
            list.appendChild(card);
          });
      }
      sel.addEventListener('change', draw);
      draw();

      const note = document.createElement('p');
      note.className = 'lesson-card-summary practitioner-note';
      note.textContent = t('community.practitioners.requestNote');
      els.choices.appendChild(note);
    }

    const back = document.createElement('button');
    back.className = 'control-btn';
    back.textContent = t('community.backToCommunity');
    back.addEventListener('click', () => goToNode('community_list'));
    els.controls.appendChild(back);
    addBackToChaptersButton();
    announce(t('community.practitioners.announce'));
  }

  /* ---------- Extras ---------- */

  function renderExtras() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const ex = getExtras();
    els.chapterTitle.textContent = t('extras.title');
    els.speaker.textContent = t('extras.speaker');
    els.dialogue.textContent = t('extras.intro');

    const wrap = document.createElement('div');
    wrap.className = 'extras-wrap';

    function section(title) {
      const h = document.createElement('h3');
      h.className = 'extras-heading';
      h.textContent = title;
      wrap.appendChild(h);
    }

    section(t('extras.headingMedia'));
    (ex.multimedia || []).forEach((m) => {
      const item = document.createElement('div');
      item.className = 'extras-item';
      item.innerHTML = `<span class="lesson-card-title">${m.title}</span><span class="lesson-card-summary">${t('extras.mediaEntry', { type: m.type, note: m.note })}</span>`;
      wrap.appendChild(item);
    });

    section(t('extras.headingTips'));
    (ex.tips || []).forEach((tip) => {
      const row = document.createElement('div');
      row.className = 'extras-item';
      const text = document.createElement('div');
      text.innerHTML = `<span class="lesson-card-title">${tip.title}</span><span class="lesson-card-summary">${tip.note}</span>`;
      row.appendChild(text);
      if (tip.reminder) {
        const tog = document.createElement('button');
        tog.className = 'icon-btn reminder-toggle' + (state.reminders[tip.id] ? ' on' : '');
        tog.setAttribute('role', 'switch');
        tog.setAttribute('aria-checked', String(!!state.reminders[tip.id]));
        tog.textContent = state.reminders[tip.id] ? t('extras.remindersOn') : t('extras.remindersOff');
        tog.addEventListener('click', () => {
          state.reminders[tip.id] = !state.reminders[tip.id];
          save(); renderExtras();
        });
        row.appendChild(tog);
      }
      wrap.appendChild(row);
    });

    section(t('extras.headingStore'));
    const sorted = (ex.store || []).slice().sort((a, b) => a.price - b.price);
    sorted.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'extras-item';
      item.innerHTML = `<span class="lesson-card-title">${t('extras.storeEntry', { title: s.title, price: s.price.toFixed(2) })}</span><span class="lesson-card-summary">${s.note}</span>`;
      wrap.appendChild(item);
    });

    els.choices.appendChild(wrap);
    addBackToChaptersButton();
    announce(t('extras.announce'));
  }

  /* ---------- Profile / belts ---------- */

  function currentBelt() {
    const belts = (getProfileDef().belts || []);
    let earned = belts[0] || { name: 'White' };
    belts.forEach((b) => {
      const r = b.requires || {};
      if ((r.chapters || 0) <= state.completedChapters.length &&
          (r.lessons || 0) <= state.completedLessons.length &&
          (r.sparring || 0) <= state.sparringSessions &&
          (r.stretching || 0) <= state.stretchSessions) {
        earned = b;
      }
    });
    return earned;
  }

  function nextBelt() {
    const belts = (getProfileDef().belts || []);
    const cur = currentBelt();
    const i = belts.findIndex((b) => b.name === cur.name);
    return i >= 0 && i < belts.length - 1 ? belts[i + 1] : null;
  }

  function renderProfile() {
    clearScene();
    setMeter(0);
    renderModeTabs();
    const def = getProfileDef();
    const belt = currentBelt();
    const next = nextBelt();

    els.chapterTitle.textContent = t('profile.title');
    els.speaker.textContent = t('profile.speaker', { avatar: state.avatar || '🥋', belt: belt.name });
    els.dialogue.textContent = t('profile.intro');

    const wrap = document.createElement('div');
    wrap.className = 'profile-wrap';

    // Belt display
    const beltRow = document.createElement('div');
    beltRow.className = 'belt-row';
    beltRow.innerHTML = `<span class="belt-chip" style="background:${belt.color}"></span><span class="lesson-card-title">${t('profile.beltName', { belt: belt.name })}</span>`;
    wrap.appendChild(beltRow);

    if (next) {
      const r = next.requires || {};
      const parts = [];
      if (r.chapters) parts.push(t('profile.reqChapters', { current: Math.min(state.completedChapters.length, r.chapters), required: r.chapters }));
      if (r.lessons) parts.push(t('profile.reqLessons', { current: Math.min(state.completedLessons.length, r.lessons), required: r.lessons }));
      if (r.sparring) parts.push(t('profile.reqSparring', { current: Math.min(state.sparringSessions, r.sparring), required: r.sparring }));
      if (r.stretching) parts.push(t('profile.reqStretching', { current: Math.min(state.stretchSessions, r.stretching), required: r.stretching }));
      const nxt = document.createElement('p');
      nxt.className = 'lesson-card-summary';
      nxt.textContent = t('profile.nextBelt', { name: next.name, parts: parts.join(' · ') });
      wrap.appendChild(nxt);
    }

    // Stats
    const stats = document.createElement('div');
    stats.className = 'stats-grid';
    [
      [t('profile.statChapters'), state.completedChapters.length],
      [t('profile.statLessons'), state.completedLessons.length],
      [t('profile.statSparring'), state.sparringSessions],
      [t('profile.statStretching'), state.stretchSessions],
    ].forEach(([label, val]) => {
      const cell = document.createElement('div');
      cell.className = 'stat-cell';
      cell.innerHTML = `<span class="stat-num">${val}</span><span class="stat-label">${label}</span>`;
      stats.appendChild(cell);
    });
    wrap.appendChild(stats);

    // Avatar picker
    const avH = document.createElement('h3');
    avH.className = 'extras-heading';
    avH.textContent = t('profile.headingAvatar');
    wrap.appendChild(avH);
    const avRow = document.createElement('div');
    avRow.className = 'avatar-row';
    (def.avatars || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'icon-btn avatar' + (state.avatar === a ? ' picked' : '');
      b.textContent = a;
      b.setAttribute('aria-label', t('profile.chooseAvatar', { avatar: a }));
      b.addEventListener('click', () => { state.avatar = a; save(); renderProfile(); });
      avRow.appendChild(b);
    });
    wrap.appendChild(avRow);

    // Language picker
    const langH = document.createElement('h3');
    langH.className = 'extras-heading';
    langH.textContent = t('profile.headingLanguage');
    wrap.appendChild(langH);
    const langSel = document.createElement('select');
    langSel.setAttribute('aria-label', t('profile.languageAria'));
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = t('profile.languageSelect');
    langSel.appendChild(emptyOpt);
    (def.languages || []).forEach((l) => {
      const o = document.createElement('option');
      o.value = l.code;
      o.textContent = l.label;
      langSel.appendChild(o);
    });
    langSel.value = currentLang();
    langSel.addEventListener('change', () => { setLanguage(langSel.value || null); });
    wrap.appendChild(langSel);

    // Age check (minor-safety gate for Community → Find a Practitioner).
    const ageH = document.createElement('h3');
    ageH.className = 'extras-heading';
    ageH.textContent = t('profile.headingAge');
    wrap.appendChild(ageH);

    const minor = isMinorUser();
    const ageStatus = document.createElement('p');
    ageStatus.className = 'lesson-card-summary';
    if (minor === null) {
      ageStatus.textContent = t('profile.ageUnverified');
    } else {
      const age = ageFromBirthdate(ageGate.birthdate);
      ageStatus.textContent = minor
        ? t('profile.ageMinor', { age, minorAge: minorAge() })
        : t('profile.ageAdult', { age });
    }
    wrap.appendChild(ageStatus);

    const ageNote = document.createElement('p');
    ageNote.className = 'lesson-card-summary';
    ageNote.textContent = t('profile.ageNote');
    wrap.appendChild(ageNote);

    renderAgeCheckForm(wrap, () => renderProfile());

    els.choices.appendChild(wrap);
    addBackToChaptersButton();
    announce(t('profile.announce', { belt: belt.name }));
  }

  /* ---------- Choice handling ---------- */

  function choose(node, choice) {
    // Record history before transition.
    state.history.push({
      nodeId: node.id || state.currentNodeId,
      choiceId: choice.id,
      type: choice.type,
      meterDelta: choice.meterDelta,
      meterBefore: state.meter,
      meterAfter: clampMeter(state.meter + (choice.meterDelta || 0)),
    });

    const newMeter = clampMeter(state.meter + (choice.meterDelta || 0));
    setMeter(newMeter);

    // Show feedback reveal for non-Aikido responses in attack nodes.
    if (node.type === 'attack' && choice.type !== 'A') {
      showFeedback(choice, () => goToNode(choice.nextNode));
    } else {
      goToNode(choice.nextNode);
    }
  }

  function showFeedback(choice, callback) {
    els.choices.innerHTML = '';
    els.controls.innerHTML = '';
    els.feedback.classList.remove('hidden');

    const typeName = responseTypeName(choice.type);
    const deltaText = choice.meterDelta > 0
      ? t('feedback.angerUp', { delta: choice.meterDelta })
      : choice.meterDelta < 0 ? t('feedback.angerDown', { delta: choice.meterDelta }) : t('feedback.angerSame');
    const message = t('feedback.typeReveal', { type: typeName, delta: deltaText });
    els.feedbackText.textContent = message;
    announce(message);

    const continueBtn = document.createElement('button');
    continueBtn.className = 'choice-btn primary';
    continueBtn.textContent = t('feedback.continue');
    continueBtn.addEventListener('click', callback);
    els.choices.appendChild(continueBtn);
    continueBtn.focus();
  }

  function goToNode(nodeId, resetHistory) {
    if (resetHistory) {
      state.history = [];
    }

    // Discovery pseudo-nodes (rendered outside the chapter node graph).
    if (nodeId === 'discovery_list' || nodeId === 'placeholder_discovery') {
      state.currentNodeId = 'discovery_list';
      save();
      renderDiscoveryList();
      return;
    }
    if (typeof nodeId === 'string' && nodeId.indexOf('discovery_lesson:') === 0) {
      const lesson = getLesson(nodeId.slice('discovery_lesson:'.length));
      if (!lesson || !isLessonUnlocked(lesson)) {
        goToNode('discovery_list');
        return;
      }
      state.currentNodeId = nodeId;
      save();
      renderLesson(lesson);
      return;
    }

    // Practice / Extras / Profile pseudo-nodes.
    if (nodeId === 'practice_list' || nodeId === 'placeholder_practice') { state.currentNodeId = 'practice_list'; save(); renderPracticeList(); return; }
    if (nodeId === 'practice_centering') { state.currentNodeId = nodeId; save(); renderCentering(); return; }
    if (nodeId === 'practice_stretch') { state.currentNodeId = nodeId; save(); renderStretchPicker(); return; }
    if (nodeId === 'practice_spar') { state.currentNodeId = nodeId; save(); renderSparring(); return; }
    if (nodeId === 'community_list' || nodeId === 'placeholder_community') { state.currentNodeId = 'community_list'; save(); renderCommunityList(); return; }
    if (nodeId === 'community_forum') { state.currentNodeId = nodeId; save(); renderCommunityForum(); return; }
    if (nodeId === 'community_events') { state.currentNodeId = nodeId; save(); renderCommunityEvents(); return; }
    if (nodeId === 'community_practitioners') { state.currentNodeId = nodeId; save(); renderPractitioners(); return; }
    if (nodeId === 'extras_list' || nodeId === 'placeholder_extras') { state.currentNodeId = 'extras_list'; save(); renderExtras(); return; }
    // "Recommended lessons" from a retry node — jump straight into the
    // de-escalation lesson when it is unlocked, else the Discovery list.
    if (nodeId === 'placeholder_lesson') {
      const recommended = getLesson('disc_reactive_responses');
      if (recommended && isLessonUnlocked(recommended)) {
        goToNode('discovery_lesson:disc_reactive_responses');
        return;
      }
      goToNode('discovery_list');
      return;
    }
    if (nodeId === 'profile_view' || nodeId === 'placeholder_profile') { state.currentNodeId = 'profile_view'; save(); renderProfile(); return; }

    const node = getNode(nodeId);
    if (!node) {
      console.error('Node not found:', nodeId);
      goToNode('chapter_select');
      return;
    }

    state.currentNodeId = nodeId;
    save();

    if (node.type === 'chapter_select') {
      renderChapterSelect(node);
      return;
    }

    if (node.type === 'intro') {
      // If a node is explicitly intro, render it; otherwise chapter intro is handled separately.
      renderNode(node);
      return;
    }

    if (node.type === 'success') {
      markChapterComplete();
      renderNode(node);
      return;
    }

    renderNode(node);
  }

  function startChapter(chapterId) {
    const chapter = getChapter(chapterId);
    if (!chapter) return;
    state.currentChapterId = chapterId;
    state.history = [];
    save();
    renderIntro(chapter);
  }

  function markChapterComplete() {
    if (state.currentChapterId && !state.completedChapters.includes(state.currentChapterId)) {
      state.completedChapters.push(state.currentChapterId);
    }
    // Unlock the next chapter in sequence.
    const currentIndex = content.chapters.findIndex((ch) => ch.id === state.currentChapterId);
    const nextChapter = content.chapters[currentIndex + 1];
    if (nextChapter && !state.unlockedChapters.includes(nextChapter.id)) {
      state.unlockedChapters.push(nextChapter.id);
    }
    // Unlock any Discovery lessons gated on this chapter.
    unlockLessonsForChapter(state.currentChapterId);
    save();
  }

  function render() {
    // Discovery pseudo-nodes survive reloads.
    if (state.currentNodeId === 'discovery_list' || state.currentNodeId === 'placeholder_discovery') {
      renderDiscoveryList();
      return;
    }
    if (typeof state.currentNodeId === 'string' && state.currentNodeId.indexOf('discovery_lesson:') === 0) {
      goToNode(state.currentNodeId);
      return;
    }
    // Practice / Extras / Profile pseudo-nodes survive reloads; in-progress
    // sessions are transient, so resume at their parent picker.
    if (state.currentNodeId === 'practice_stretch_session') { goToNode('practice_stretch'); return; }
    if (state.currentNodeId === 'practice_spar_session') { goToNode('practice_spar'); return; }
    if (['practice_list', 'practice_centering', 'practice_stretch', 'practice_spar', 'community_list', 'community_forum', 'community_events', 'community_practitioners', 'extras_list', 'profile_view'].includes(state.currentNodeId)) {
      goToNode(state.currentNodeId);
      return;
    }
    const node = getNode(state.currentNodeId);
    if (!node) {
      goToNode('chapter_select');
      return;
    }
    if (node.type === 'chapter_select') {
      renderChapterSelect(node);
    } else {
      renderNode(node);
    }
  }

  /* ---------- PWA / offline helpers ---------- */

  function isIos() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  function setConnectionStatus(online) {
    if (!els.connectionStatus) return;
    const dot = els.connectionStatus.querySelector('.connection-dot');
    const text = els.connectionStatus.querySelector('.connection-text');
    if (online) {
      els.connectionStatus.classList.add('online');
      els.connectionStatus.classList.remove('offline');
      els.connectionStatus.title = t('pwa.online');
      if (text) text.textContent = t('pwa.online');
    } else {
      els.connectionStatus.classList.remove('online');
      els.connectionStatus.classList.add('offline');
      els.connectionStatus.title = t('pwa.offline');
      if (text) text.textContent = t('pwa.offline');
    }
  }

  function showInstallPanel() {
    if (!els.installPanel) return;
    els.installPanel.classList.remove('hidden');
    if (isIos()) {
      els.iosInstructions.classList.remove('hidden');
      if (els.installConfirmBtn) els.installConfirmBtn.classList.add('hidden');
      if (els.installMessage) {
        els.installMessage.textContent = t('pwa.installIos');
      }
    } else {
      if (els.iosInstructions) els.iosInstructions.classList.add('hidden');
      if (els.installConfirmBtn) els.installConfirmBtn.classList.remove('hidden');
      if (els.installMessage) {
        els.installMessage.textContent = t('pwa.installDefault');
      }
    }
  }

  function hideInstallPanel() {
    if (els.installPanel) els.installPanel.classList.add('hidden');
  }

  function getPwaMode() {
    try {
      return localStorage.getItem(PWA_MODE_KEY) === 'app' ? 'app' : 'browser';
    } catch (e) {
      return 'browser';
    }
  }

  function setPwaMode(mode) {
    try {
      localStorage.setItem(PWA_MODE_KEY, mode === 'app' ? 'app' : 'browser');
    } catch (e) {
      console.warn('Could not save PWA mode:', e);
    }
  }

  function updateModeToggle() {
    if (!els.modeToggle) return;
    const appMode = getPwaMode() === 'app';
    els.modeToggle.setAttribute('aria-checked', String(appMode));
    els.modeToggle.classList.toggle('app-mode', appMode);
  }

  function initPwaToggle() {
    if (!els.modeToggle) return;
    updateModeToggle();
    els.modeToggle.addEventListener('click', () => {
      const appMode = getPwaMode() !== 'app';
      setPwaMode(appMode ? 'app' : 'browser');
      updateModeToggle();
      updateInstallButton();
      if (appMode) {
        showInstallPanel();
      } else {
        hideInstallPanel();
      }
    });
  }

  function initConnectionStatus() {
    setConnectionStatus(navigator.onLine !== false);
    window.addEventListener('online', () => setConnectionStatus(true));
    window.addEventListener('offline', () => setConnectionStatus(false));
  }

  // Render the error outside #scene: clearing #scene would detach the
  // elements cached in `els`, leaving a blank game after a successful retry.
  function renderOfflineError(retryFn) {
    if (!els.loadError) return;
    els.loadError.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'offline-message';
    box.setAttribute('role', 'alert');

    const title = document.createElement('h2');
    title.textContent = t('offlineError.title');
    box.appendChild(title);

    const text = document.createElement('p');
    text.textContent = t('offlineError.text');
    box.appendChild(text);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'choice-btn primary';
    retryBtn.textContent = t('offlineError.retry');
    retryBtn.addEventListener('click', retryFn);
    box.appendChild(retryBtn);

    els.loadError.appendChild(box);
    els.loadError.classList.remove('hidden');
    if (els.scene) els.scene.classList.add('hidden');
  }

  function clearOfflineError() {
    if (els.loadError) {
      els.loadError.innerHTML = '';
      els.loadError.classList.add('hidden');
    }
    if (els.scene) els.scene.classList.remove('hidden');
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service workers are not supported in this browser.');
      return;
    }
    navigator.serviceWorker
      .register('sw.js', { scope: './' })
      .then((registration) => {
        console.log('Service worker registered:', registration.scope);
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  }

  function updateInstallButton() {
    if (!els.installBtn) return;
    const promptAvailable = !!window.vaDeferredInstallPrompt;
    const inAppMode = getPwaMode() === 'app';
    if (promptAvailable && inAppMode) {
      els.installBtn.classList.remove('hidden');
    } else {
      els.installBtn.classList.add('hidden');
    }
  }

  function onInstallPromptAvailable() {
    updateInstallButton();
    if (getPwaMode() === 'app') {
      showInstallPanel();
    }
  }

  function onAppInstalled() {
    if (els.installBtn) els.installBtn.classList.add('hidden');
    hideInstallPanel();
  }

  function triggerInstall() {
    const prompt = window.vaDeferredInstallPrompt;
    if (!prompt) {
      // No deferred prompt available; show instructions if helpful.
      if (isIos()) {
        showInstallPanel();
      }
      return;
    }
    prompt.prompt();
    prompt.userChoice
      .then((choiceResult) => {
        if (choiceResult && choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt.');
        }
        window.vaDeferredInstallPrompt = null;
        updateInstallButton();
      })
      .catch((err) => {
        console.warn('Install prompt error:', err);
      });
  }

  function initInstallHandlers() {
    if (els.installBtn) {
      els.installBtn.addEventListener('click', triggerInstall);
    }
    if (els.installConfirmBtn) {
      els.installConfirmBtn.addEventListener('click', triggerInstall);
    }
    window.vaOnInstallPromptAvailable = onInstallPromptAvailable;
    window.vaOnAppInstalled = onAppInstalled;
    // If the prompt was captured before game.js loaded, pick it up now.
    if (window.vaDeferredInstallPrompt) {
      onInstallPromptAvailable();
    }
  }

  /* ---------- Init ---------- */

  function init() {
    if (!els.app) {
      console.error('Game root #va-game not found.');
      return;
    }

    initConnectionStatus();
    initPwaToggle();
    initInstallHandlers();
    registerServiceWorker();

    loadContent();
  }

  function loadContent() {
    contentLoadError = null;
    loadSaved(); // early: need saved language before choosing files

    const lang = currentLang();
    const i18nPromise = Promise.all([
      fetchJson(`i18n/${DEFAULT_LANG}.json`).then((d) => { i18nFallback = d; }),
      loadI18n(lang),
    ]);
    const contentPromise = fetchJson(contentUrl(lang))
      .catch((err) => {
        if (lang !== DEFAULT_LANG) {
          console.warn(`i18n: no content file for "${lang}" (${err.message}); falling back to English content.`);
          return fetchJson(contentUrl(DEFAULT_LANG));
        }
        throw err;
      });

    Promise.all([i18nPromise, contentPromise])
      .then(([, data]) => {
        content = data;
        contentLoadError = null;
        clearOfflineError();
        loadSaved(); // re-run migration now that content is available
        // Ensure both chapters are playable in this prototype.
        if (!state.unlockedChapters.includes('ch2')) {
          state.unlockedChapters.push('ch2');
          save();
        }
        // Migration: unlock Discovery lessons for chapters already completed
        // in saves made before Discovery mode existed.
        state.completedChapters.forEach((chapterId) => unlockLessonsForChapter(chapterId));
        save();
        render();
      })
      .catch((err) => {
        contentLoadError = err;
        console.error('Failed to load game assets:', err);
        renderOfflineError(loadContent);
      });
  }

  // Switch UI + content language, reload assets, re-render current view.
  function setLanguage(code) {
    state.language = code || null;
    save();
    loadContent();
  }

  // Expose minimal API for debugging/testing.
  window.VAGame = {
    init,
    getState: () => ({ ...state }),
    getAgeGate: () => ({ ...ageGate, log: ageGate.log.slice() }),
    clearProgress,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
