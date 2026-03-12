(function () {
  var EMAIL_REPORTS_ENABLED = false;
  var AUTH_CONFIG = window.ASTRO_AUTH_CONFIG || {};
  var AUTH_PROVIDER = String(AUTH_CONFIG.provider || "").toLowerCase();
  var supabaseClient = null;
  var activeAuthSession = null;
  var activeAuthUser = null;
  var activeAccessMode = "local";
  var trainingUiInitialized = false;
  var leaderboardSyncTimer = null;

  var STORE_KEYS = {
    unlocked: "astro_training_unlocked_v1",
    profile: "astro_training_profile_v1",
    attempts: "astro_training_attempts_v1",
    cognitive: "astro_training_cognitive_v1",
    installationId: "astro_training_installation_id_v1",
    progressPrefs: "astro_training_progress_prefs_v1",
    leaderboardPrefs: "astro_training_leaderboard_prefs_v1",
    leaderboardCache: "astro_training_leaderboard_cache_v1",
    localAccounts: "astro_training_local_accounts_v1",
    localLastAccount: "astro_training_local_last_account_v1"
  };
  var LOCAL_ACCOUNT_PASSWORD_MIN = 6;

  var BADGE_DEFS = [
    { id: "first_docking", label: "First Docking", icon: "L1", check: function (ctx) { return ctx.profile.quizCount >= 1; } },
    { id: "streak_week", label: "7-Day Streak", icon: "7D", check: function (ctx) { return ctx.profile.streak >= 7; } },
    { id: "ace_scores", label: "Precision Ace", icon: "A+", check: function (ctx) { return ctx.highScoreCount >= 3; } },
    { id: "century_questions", label: "100 Questions", icon: "100", check: function (ctx) { return ctx.totalQuestions >= 100; } },
    { id: "wide_coverage", label: "Wide Coverage", icon: "ALL", check: function (ctx) { return ctx.topicCoverage >= Math.min(ctx.topicCount, 8); } }
  ];

  var DIRECTION_AXES = [
    { id: "+X", label: "Right (+X)", vec: [1, 0, 0] },
    { id: "-X", label: "Left (-X)", vec: [-1, 0, 0] },
    { id: "+Y", label: "Forward (+Y)", vec: [0, 1, 0] },
    { id: "-Y", label: "Backward (-Y)", vec: [0, -1, 0] },
    { id: "+Z", label: "Up (+Z)", vec: [0, 0, 1] },
    { id: "-Z", label: "Down (-Z)", vec: [0, 0, -1] }
  ];

  var ROTATION_OPS = [
    {
      label: "Rotate +90 deg about Z",
      apply: function (v) { return [-v[1], v[0], v[2]]; }
    },
    {
      label: "Rotate -90 deg about Z",
      apply: function (v) { return [v[1], -v[0], v[2]]; }
    },
    {
      label: "Rotate +90 deg about Y",
      apply: function (v) { return [v[2], v[1], -v[0]]; }
    },
    {
      label: "Rotate -90 deg about Y",
      apply: function (v) { return [-v[2], v[1], v[0]]; }
    },
    {
      label: "Rotate +90 deg about X",
      apply: function (v) { return [v[0], -v[2], v[1]]; }
    },
    {
      label: "Rotate -90 deg about X",
      apply: function (v) { return [v[0], v[2], -v[1]]; }
    }
  ];

  var RMS_SPEED_OPTIONS = [0.85, 1.0, 1.2, 1.35];
  var CONCENTRATION_TRAITS = ["orientation", "color", "dots"];
  var CONCENTRATION_ORIENTATIONS = ["up", "down", "left", "right"];
  var CONCENTRATION_COLORS = ["red", "green", "blue", "yellow"];
  var CONCENTRATION_DOTS = [0, 1, 2, 3, 4];
  var SPEED2_RULES = [
    { id: "black-color", label: "BLACK COLOR" },
    { id: "white-color", label: "WHITE COLOR" },
    { id: "round-shape", label: "ROUND SHAPE" },
    { id: "square-shape", label: "SQUARE SHAPE" }
  ];
  var SPEED2_PRESENTATION_BASE_MS = 5000; // [ms]
  var SPEED2_PRESENTATION_STEP_MS = 500; // [ms]
  var SPEED2_PRESENTATION_MIN_MS = 1500; // [ms]
  var SPEED2_RULE_PREVIEW_MS = 900; // [ms]
  var REACTION_MIN_VALID_MS = 50;
  var SPEED_MIN_VALID_ROUND_MS = 450;
  var SPEED2_MIN_VALID_ANSWER_MS = 250;
  var SESSION_BREAK_DRILL_THRESHOLD = 10;
  var SESSION_BREAK_ELAPSED_MS = 18 * 60 * 1000;
  var REACTION_SESSION_ROUNDS = 10;
  var STROOP_COLORS = [
    { name: "GREEN", hex: "#2a9a62" },
    { name: "RED", hex: "#c24a4a" },
    { name: "BLUE", hex: "#3a67d9" },
    { name: "YELLOW", hex: "#d4ad2d" },
    { name: "ORANGE", hex: "#d9802f" },
    { name: "VIOLET", hex: "#7d4ed1" },
    { name: "BLACK", hex: "#0f1420" }
  ];

  var els = {};
  var appState = {
    topics: [],
    allCards: [],
    currentTopicId: null,
    flashDeck: [],
    flashIndex: 0,
    flashOrder: "series",
    quiz: {
      running: false,
      mode: "random-all",
      topicId: null,
      count: 20,
      questions: [],
      index: 0,
      selectedIndex: null,
      answered: false,
      records: [],
      autoNextTimer: null
    },
    profile: {
      xp: 0,
      streak: 0,
      quizCount: 0,
      lastPracticeDate: null,
      badges: []
    },
    installationId: "",
    attempts: [],
    questionStats: {},
    session: {
      startedAt: 0,
      lastBreakAt: 0,
      drillsSinceBreak: 0,
      totalDrills: 0
    },
    progressPrefs: {
      range: "all",
      granularity: "auto",
      speedMode: "classic",
      historyLimit: "100"
    },
    leaderboard: {
      displayName: "",
      optIn: false
    },
    leaderboardCache: {
      rows: [],
      fetchedAt: null
    },
    cognitive: {
      digitLevel: 4,
      digitBest: 4,
      visualLevel: 5,
      visualBest: 5,
      visualMistakes: 0,
      rmsLevel: 3,
      rmsBest: 3,
      rmsSpeedFactor: 1.2,
      speedLevel: 1,
      speedBest: 1,
      speed2Level: 1,
      speed2Best: 1,
      rotationLevel: 2,
      rotationBest: 2,
      mathLevel: 1,
      mathBest: 1,
      concentrationLevel: 1,
      concentrationBest: 1,
      reactionRuns: [],
      reactionAudit: [],
      speedAudit: [],
      speed2Audit: [],
      drillLogs: []
    },
    digit: {
      current: "",
      revealTimer: null,
      feedbackTimer: null,
      startedAt: 0
    },
    memory: {
      activePattern: [],
      picks: new Set(),
      revealLock: false,
      revealTimer: null,
      gridSize: 4,
      startedAt: 0
    },
    reaction: {
      timer: null,
      waiting: false,
      ready: false,
      readyAt: 0,
      trialStartedAt: 0,
      interrupted: false,
      mode: "baseline",
      sessionRunning: false,
      sessionPaused: false,
      sessionIndex: 0,
      sessionRounds: REACTION_SESSION_ROUNDS,
      sessionPlan: [],
      sessionResults: [],
      currentStimulus: "none",
      awaitingSessionResponse: false
    },
    rms: {
      sequence: [],
      target: "",
      index: 0,
      timer: null,
      running: false,
      readyForInput: false,
      startedAt: 0
    },
    speed: {
      timer: null,
      target: "",
      options: [],
      correctIndices: [],
      selected: new Set(),
      deadline: 0,
      durationMs: 0,
      running: false,
      roundStartedAt: 0,
      interactionCount: 0,
      interrupted: false,
      submittedTrusted: true
    },
    speed2: {
      timer: null,
      previewTimer: null,
      challenge: null,
      previewing: false,
      presenting: false,
      paused: false,
      deadline: 0,
      remainingMs: 0,
      answerStartedAt: 0,
      inputKeyCount: 0,
      interrupted: false,
      checkTrusted: true,
      roundStartedAt: 0
    },
    rotation: {
      scenario: null,
      answered: false,
      startedAt: 0
    },
    math: {
      timer: null,
      nextTimer: null,
      active: false,
      endAt: 0,
      total: 0,
      correct: 0,
      question: null,
      recentTypes: [],
      startedAt: 0
    },
    concentration: {
      running: false,
      timer: null,
      level: 1,
      roundSize: 30,
      timeoutMs: 4500,
      topRule: "color",
      bottomRule: "orientation",
      rulesConfigured: false,
      sequence: [],
      index: 0,
      correct: 0,
      wrong: 0,
      timeouts: 0,
      locked: false,
      paused: false,
      deadlineAt: 0,
      timeRemainingMs: 0,
      rulesMasked: false,
      ruleHideTimer: null,
      revealTop: false,
      revealBottom: false,
      revealTopTimer: null,
      revealBottomTimer: null,
      roundStartedAt: 0
    }
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function shuffle(array) {
    var copy = array.slice();
    for (var i = copy.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function sample(array, n) {
    if (n >= array.length) {
      return shuffle(array);
    }
    return shuffle(array).slice(0, n);
  }

  function weightedSampleWithoutReplacement(items, n, weightFn) {
    var pool = items.slice();
    var targetCount = Math.min(Math.max(0, n), pool.length);
    var chosen = [];

    while (chosen.length < targetCount && pool.length) {
      var weights = pool.map(function (item) {
        var w = Number(weightFn(item));
        if (!Number.isFinite(w) || w <= 0) {
          return 0.001;
        }
        return w;
      });

      var totalWeight = weights.reduce(function (sum, w) { return sum + w; }, 0);
      var selectedIdx = 0;
      if (totalWeight > 0) {
        var roll = Math.random() * totalWeight;
        var cumulative = 0;
        for (var idx = 0; idx < weights.length; idx += 1) {
          cumulative += weights[idx];
          if (roll <= cumulative) {
            selectedIdx = idx;
            break;
          }
        }
      }

      chosen.push(pool[selectedIdx]);
      pool.splice(selectedIdx, 1);
    }

    return chosen;
  }

  function eventIsTrusted(event) {
    return !event || event.isTrusted !== false;
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function pulseStatus(el) {
    if (!el || prefersReducedMotion()) {
      return;
    }
    el.classList.remove("status-pop");
    void el.offsetWidth;
    el.classList.add("status-pop");
    setTimeout(function () {
      el.classList.remove("status-pop");
    }, 320);
  }

  function triggerHaptic(pattern) {
    if (!navigator.vibrate || prefersReducedMotion()) {
      return;
    }
    var map = {
      success: [18],
      error: [24, 40, 24],
      ready: [10],
      warning: [16, 32, 16]
    };
    var seq = map[pattern] || [12];
    try {
      navigator.vibrate(seq);
    } catch (err) {
      // Ignore unsupported vibration errors.
    }
  }

  function pushCapped(list, value, maxSize) {
    if (!Array.isArray(list)) {
      return;
    }
    list.push(value);
    while (list.length > maxSize) {
      list.shift();
    }
  }

  function uniqueBy(array, keyFn) {
    var map = new Map();
    array.forEach(function (item) {
      var key = keyFn(item);
      if (!map.has(key)) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }

  function normalizeTokens(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(function (token) { return token.length > 2; });
  }

  function extractAnswerFeatures(text) {
    var lower = String(text || "").toLowerCase();
    return {
      hasYear: /\b(19|20)\d{2}\b/.test(lower),
      hasEquation: /[=+\-*/^]/.test(lower),
      hasNumber: /\d/.test(lower),
      hasUnits: /\b(km|m|s|sec|ms|kg|lb|ft|knots|kt|mph|hpa|inhg|percent|%)\b/.test(lower),
      hasPersonName: /([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})/.test(String(text || "")),
      tokenSet: new Set(normalizeTokens(text)),
      wordCount: normalizeTokens(text).length
    };
  }

  function answerSimilarity(aText, bText) {
    var a = extractAnswerFeatures(aText);
    var b = extractAnswerFeatures(bText);
    var score = 0;

    if (a.hasYear === b.hasYear) {
      score += a.hasYear ? 4 : 1;
    }
    if (a.hasEquation === b.hasEquation) {
      score += a.hasEquation ? 4 : 1;
    }
    if (a.hasUnits === b.hasUnits) {
      score += a.hasUnits ? 3 : 1;
    }
    if (a.hasPersonName === b.hasPersonName) {
      score += a.hasPersonName ? 4 : 1;
    }
    if (a.hasNumber === b.hasNumber) {
      score += a.hasNumber ? 2 : 1;
    }

    var overlap = 0;
    a.tokenSet.forEach(function (token) {
      if (b.tokenSet.has(token)) {
        overlap += 1;
      }
    });
    score += Math.min(overlap, 4);

    var wordDelta = Math.abs(a.wordCount - b.wordCount);
    if (wordDelta <= 2) {
      score += 2;
    } else if (wordDelta <= 5) {
      score += 1;
    }

    return score;
  }

  function todayKey() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, "0");
    var d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function yesterdayKey() {
    var dt = new Date();
    dt.setDate(dt.getDate() - 1);
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, "0");
    var d = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function safeRead(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) {
        return fallback;
      }
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Ignore storage write failures in private modes.
    }
  }

  function parseTimestampMs(value) {
    var ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  function normalizeIsoTimestamp(value) {
    var ms = parseTimestampMs(value);
    if (ms == null) {
      return null;
    }
    return new Date(ms).toISOString();
  }

  function hashString(value) {
    var str = String(value || "");
    var hash = 2166136261;
    for (var i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
  }

  function createInstallationId() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      var buffer = new Uint32Array(2);
      window.crypto.getRandomValues(buffer);
      return "inst-" + buffer[0].toString(36) + "-" + buffer[1].toString(36);
    }
    return "inst-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function ensureInstallationId() {
    var stored = safeRead(STORE_KEYS.installationId, "");
    if (typeof stored === "string" && stored.trim().length > 0) {
      appState.installationId = stored.trim();
      return;
    }
    appState.installationId = createInstallationId();
    safeWrite(STORE_KEYS.installationId, appState.installationId);
  }

  function createHistoryEntryId(prefix) {
    if (!appState.installationId) {
      ensureInstallationId();
    }
    return (
      prefix +
      "-" +
      appState.installationId +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function buildAttemptFallbackId(entry) {
    var seed = [
      entry.timestamp || "",
      entry.mode || "",
      entry.topicId || "",
      entry.topicName || "",
      String(entry.total || 0),
      String(entry.correct || 0),
      String(entry.score || 0)
    ].join("|");
    return "qz-" + hashString(seed);
  }

  function buildDrillFallbackId(entry) {
    var seed = [
      entry.timestamp || "",
      entry.type || "",
      String(entry.score || 0),
      String(entry.detail || "")
    ].join("|");
    return "dr-" + hashString(seed);
  }

  function normalizeQuestionLogEntry(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    var questionId = String(raw.questionId || raw.id || "").trim();
    if (!questionId) {
      return null;
    }
    return {
      questionId: questionId,
      topicId: String(raw.topicId || "").trim(),
      correct: Boolean(raw.correct)
    };
  }

  function normalizeAttemptEntry(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    var timestamp = normalizeIsoTimestamp(raw.timestamp);
    if (!timestamp) {
      return null;
    }
    var total = clamp(Math.round(Number(raw.total) || 0), 0, 10000);
    var correctRaw = Math.round(Number(raw.correct) || 0);
    var correct = total > 0 ? clamp(correctRaw, 0, total) : Math.max(0, correctRaw);
    var scoreRaw = Number(raw.score);
    var score = Number.isFinite(scoreRaw)
      ? clamp(Math.round(scoreRaw), 0, 100)
      : (total > 0 ? clamp(Math.round((correct / total) * 100), 0, 100) : 0);
    var topicId = String(raw.topicId || "all");
    var topicName = String(raw.topicName || (topicId === "all" ? "All topics" : "Unknown"));
    var mode = String(raw.mode || "quiz");
    var xpRaw = Number(raw.xpEarned);
    var xpEarned = Number.isFinite(xpRaw) ? Math.max(0, Math.round(xpRaw)) : xpFromResult(score, correct, total);
    var questionLog = Array.isArray(raw.questionLog)
      ? raw.questionLog.map(normalizeQuestionLogEntry).filter(Boolean)
      : [];
    var id = typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : buildAttemptFallbackId({
        timestamp: timestamp,
        mode: mode,
        topicId: topicId,
        topicName: topicName,
        total: total,
        correct: correct,
        score: score
      });

    return {
      id: id,
      timestamp: timestamp,
      mode: mode,
      topicId: topicId,
      topicName: topicName,
      total: total,
      correct: correct,
      score: score,
      xpEarned: xpEarned,
      questionLog: questionLog
    };
  }

  function normalizeDrillLogEntry(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    var timestamp = normalizeIsoTimestamp(raw.timestamp);
    if (!timestamp) {
      return null;
    }
    var type = String(raw.type || "drill");
    var detail = String(raw.detail || "");
    var score = clamp(Math.round(Number(raw.score) || 0), 0, 100);
    var meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
    var xpRaw = Number(raw.xpEarned);
    var xpEarned = Number.isFinite(xpRaw) ? Math.max(0, Math.round(xpRaw)) : xpFromCognitiveScore(type, score, meta);
    var id = typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : buildDrillFallbackId({
        timestamp: timestamp,
        type: type,
        score: score,
        detail: detail
      });
    return {
      id: id,
      timestamp: timestamp,
      type: type,
      score: score,
      detail: detail,
      meta: meta,
      xpEarned: xpEarned
    };
  }

  function dedupeHistoryById(items) {
    var map = new Map();
    items.forEach(function (item) {
      if (!item || !item.id) {
        return;
      }
      map.set(item.id, item);
    });
    return Array.from(map.values()).sort(function (a, b) {
      return (parseTimestampMs(a.timestamp) || 0) - (parseTimestampMs(b.timestamp) || 0);
    });
  }

  function toLocalDateKey(value) {
    var dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      return null;
    }
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, "0");
    var d = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function sanitizeProgressRange(value) {
    var valid = ["30d", "90d", "180d", "365d", "all"];
    return valid.indexOf(value) >= 0 ? value : "180d";
  }

  function sanitizeProgressGranularity(value) {
    var valid = ["auto", "day", "week", "month"];
    return valid.indexOf(value) >= 0 ? value : "auto";
  }

  function sanitizeSpeedMode(value) {
    var valid = ["classic", "panel"];
    return valid.indexOf(value) >= 0 ? value : "classic";
  }

  function sanitizeHistoryLimit(value) {
    var valid = ["40", "100", "250", "all"];
    return valid.indexOf(String(value || "")) >= 0 ? String(value) : "100";
  }

  function parseHistoryLimit(value) {
    var cleaned = sanitizeHistoryLimit(value);
    if (cleaned === "all") {
      return null;
    }
    var num = Number(cleaned);
    return Number.isFinite(num) && num > 0 ? Math.round(num) : 100;
  }

  function refreshQuestionStatsFromAttempts() {
    var stats = {};
    (Array.isArray(appState.attempts) ? appState.attempts : []).forEach(function (attempt) {
      var ts = normalizeIsoTimestamp(attempt && attempt.timestamp);
      if (!Array.isArray(attempt.questionLog)) {
        return;
      }
      attempt.questionLog.forEach(function (entry) {
        var normalized = normalizeQuestionLogEntry(entry);
        if (!normalized) {
          return;
        }
        var existing = stats[normalized.questionId];
        if (!existing) {
          existing = {
            questionId: normalized.questionId,
            topicId: normalized.topicId || "",
            attempts: 0,
            correct: 0,
            lastSeen: null,
            lastCorrect: null
          };
        }
        existing.attempts += 1;
        if (normalized.correct) {
          existing.correct += 1;
        }
        if (ts) {
          if (!existing.lastSeen || ts > existing.lastSeen) {
            existing.lastSeen = ts;
          }
          if (normalized.correct && (!existing.lastCorrect || ts > existing.lastCorrect)) {
            existing.lastCorrect = ts;
          }
        }
        stats[normalized.questionId] = existing;
      });
    });
    appState.questionStats = stats;
  }

  function getQuestionStat(cardId) {
    if (!cardId || !appState.questionStats) {
      return null;
    }
    return appState.questionStats[cardId] || null;
  }

  function getCardMasteryScore(cardId) {
    var stat = getQuestionStat(cardId);
    if (!stat || !stat.attempts) {
      return 0;
    }
    var accuracy = stat.correct / stat.attempts;
    var confidence = Math.min(1, stat.attempts / 5);
    return clamp(Math.round(accuracy * (0.62 + 0.38 * confidence) * 100), 0, 100);
  }

  function computeAdaptiveWeight(card) {
    var stat = getQuestionStat(card.id);
    if (!stat || !stat.attempts) {
      return 4.4;
    }
    var accuracy = stat.correct / stat.attempts;
    var weight = 1.1 + (1 - accuracy) * 4.2;
    if (stat.attempts < 3) {
      weight += 0.8;
    }

    var seenMs = parseTimestampMs(stat.lastSeen);
    if (seenMs != null) {
      var ageDays = (Date.now() - seenMs) / 86400000;
      if (ageDays > 10) {
        weight += 0.6;
      }
      if (ageDays > 30) {
        weight += 0.6;
      }
    }

    if (accuracy >= 0.92 && stat.attempts >= 5) {
      weight *= 0.45;
    }

    return clamp(weight, 0.12, 8.5);
  }

  function computeTopicMasteryStats() {
    return appState.topics.map(function (topic) {
      var cards = appState.allCards.filter(function (card) {
        return card.topicId === topic.id;
      });
      var totalCards = cards.length;
      var seenCards = 0;
      var reviewNeeded = 0;
      var scoreSum = 0;
      var attempts = 0;
      var correct = 0;

      cards.forEach(function (card) {
        var stat = getQuestionStat(card.id);
        var mastery = getCardMasteryScore(card.id);
        scoreSum += mastery;
        if (stat && stat.attempts > 0) {
          seenCards += 1;
          attempts += stat.attempts;
          correct += stat.correct;
        }
        if (!stat || !stat.attempts || mastery < 65) {
          reviewNeeded += 1;
        }
      });

      return {
        topicId: topic.id,
        topicName: topic.name,
        totalCards: totalCards,
        seenCards: seenCards,
        reviewNeeded: reviewNeeded,
        mastery: totalCards ? Math.round(scoreSum / totalCards) : 0,
        coverage: totalCards ? Math.round((seenCards / totalCards) * 100) : 0,
        rawAccuracy: attempts ? Math.round((correct / attempts) * 100) : null
      };
    }).sort(function (a, b) {
      if (a.mastery !== b.mastery) {
        return a.mastery - b.mastery;
      }
      return a.coverage - b.coverage;
    });
  }

  function recalculateProfileFromHistory() {
    var attempts = Array.isArray(appState.attempts) ? appState.attempts : [];
    var drills = Array.isArray(appState.cognitive.drillLogs) ? appState.cognitive.drillLogs : [];
    var allDates = attempts.map(function (entry) {
      return toLocalDateKey(entry.timestamp);
    }).concat(drills.map(function (entry) {
      return toLocalDateKey(entry.timestamp);
    })).filter(Boolean);

    var uniqueDays = Array.from(new Set(allDates)).sort();
    var streak = 0;
    if (uniqueDays.length) {
      streak = 1;
      var cursor = new Date(uniqueDays[uniqueDays.length - 1] + "T00:00:00");
      for (var idx = uniqueDays.length - 2; idx >= 0; idx -= 1) {
        var prev = new Date(uniqueDays[idx] + "T00:00:00");
        var dayDiff = Math.round((cursor.getTime() - prev.getTime()) / 86400000);
        if (dayDiff === 1) {
          streak += 1;
          cursor = prev;
        } else {
          break;
        }
      }
    }

    var totalXp = attempts.reduce(function (sum, entry) {
      return sum + (Math.max(0, Math.round(Number(entry.xpEarned) || 0)));
    }, 0) + drills.reduce(function (sum, entry) {
      return sum + (Math.max(0, Math.round(Number(entry.xpEarned) || 0)));
    }, 0);

    appState.profile.quizCount = attempts.length;
    appState.profile.lastPracticeDate = uniqueDays.length ? uniqueDays[uniqueDays.length - 1] : null;
    appState.profile.streak = streak;
    appState.profile.xp = totalXp;
  }

  function bindElements() {
    els.gate = byId("training-gate");
    els.app = byId("training-app");
    els.gateForm = byId("gate-form");
    els.gateEmail = byId("gate-email");
    els.gatePassword = byId("gate-password");
    els.gateDisplayName = byId("gate-display-name");
    els.gateSignIn = byId("gate-signin");
    els.gateSignUp = byId("gate-signup");
    els.gateLocal = byId("gate-local");
    els.gateModeNote = byId("gate-mode-note");
    els.gateStatus = byId("gate-status");
    els.authUserLabel = byId("auth-user-label");
    els.authSignout = byId("auth-signout");

    els.profileLevel = byId("profile-level");
    els.profileXp = byId("profile-xp");
    els.profileStreak = byId("profile-streak");
    els.profileQuizCount = byId("profile-quiz-count");

    els.tabButtons = Array.from(document.querySelectorAll(".astro-tab"));
    els.tabPanels = Array.from(document.querySelectorAll(".astro-panel"));

    els.topicFolders = byId("topic-folders");
    els.flashCard = byId("flash-card");
    els.flashQ = byId("flash-q");
    els.flashA = byId("flash-a");
    els.flashQFigure = byId("flash-q-figure");
    els.flashQImage = byId("flash-q-image");
    els.flashMeta = byId("flash-meta");
    els.flashTopicSelect = byId("flash-topic-select");
    els.flashOrderSelect = byId("flash-order-select");
    els.flashPrev = byId("flash-prev");
    els.flashNext = byId("flash-next");
    els.flashFlip = byId("flash-flip");
    els.flashRandom = byId("flash-random");

    els.quizMode = byId("quiz-mode");
    els.quizTopic = byId("quiz-topic");
    els.quizCount = byId("quiz-count");
    els.quizInstant = byId("quiz-instant");
    els.quizStart = byId("quiz-start");
    els.quizLive = byId("quiz-live");
    els.quizQuestionTitle = byId("quiz-question-title");
    els.quizQuestionText = byId("quiz-question-text");
    els.quizQuestionFigure = byId("quiz-question-figure");
    els.quizQuestionImage = byId("quiz-question-image");
    els.quizOptions = byId("quiz-options");
    els.quizProgress = byId("quiz-progress");
    els.quizRecommendation = byId("quiz-recommendation");
    els.quizSubmit = byId("quiz-submit");
    els.quizNext = byId("quiz-next");
    els.quizResult = byId("quiz-result");
    els.quizScoreTitle = byId("quiz-score-title");
    els.quizScoreText = byId("quiz-score-text");
    els.quizRestart = byId("quiz-restart");
    els.quizReview = byId("quiz-review");

    els.digitSequence = byId("digit-sequence");
    els.digitFeedback = byId("digit-feedback");
    els.digitInput = byId("digit-input");
    els.digitStart = byId("digit-start");
    els.digitCheck = byId("digit-check");
    els.digitStatus = byId("digit-status");

    els.memoryGrid = byId("memory-grid");
    els.memoryShow = byId("memory-show");
    els.memorySubmit = byId("memory-submit");
    els.memoryReset = byId("memory-reset");
    els.memoryStatus = byId("memory-status");
    els.concRoundInfo = byId("conc-round-info");
    els.concRuleTop = byId("conc-rule-top");
    els.concRuleBottom = byId("conc-rule-bottom");
    els.concRevealTop = byId("conc-reveal-top");
    els.concRevealBottom = byId("conc-reveal-bottom");
    els.concGenerateRules = byId("conc-generate-rules");
    els.concTriangle = byId("conc-triangle");
    els.concTopBtn = byId("conc-top-btn");
    els.concBottomBtn = byId("conc-bottom-btn");
    els.concNoneBtn = byId("conc-none-btn");
    els.concProgress = byId("conc-progress");
    els.concTime = byId("conc-time");
    els.concStartBtn = byId("conc-start-btn");
    els.concPauseBtn = byId("conc-pause-btn");
    els.concResetBtn = byId("conc-reset-btn");
    els.concStatus = byId("conc-status");

    els.reactionTarget = byId("reaction-target");
    els.reactionStart = byId("reaction-start");
    els.reactionPause = byId("reaction-pause");
    els.reactionReset = byId("reaction-reset");
    els.reactionStatus = byId("reaction-status");
    els.reactionModeMeta = byId("reaction-mode-meta");
    els.reactionSessionProgress = byId("reaction-session-progress");
    els.reactionModeTabs = Array.from(document.querySelectorAll(".reaction-mode-tab"));

    els.rmsMeta = byId("rms-meta");
    els.rmsStream = byId("rms-stream");
    els.rmsSpeedSelect = byId("rms-speed-select");
    els.rmsSpeedReset = byId("rms-speed-reset");
    els.rmsInput = byId("rms-input");
    els.rmsStart = byId("rms-start");
    els.rmsCheck = byId("rms-check");
    els.rmsStatus = byId("rms-status");

    els.speedTarget = byId("speed-target");
    els.speedTimer = byId("speed-timer");
    els.speedGrid = byId("speed-grid");
    els.speedStart = byId("speed-start");
    els.speedSubmit = byId("speed-submit");
    els.speedStatus = byId("speed-status");
    els.speedCard = byId("speed-card");
    els.speed2Card = byId("speed2-card");
    els.speedModeTabs = Array.from(document.querySelectorAll(".speed-mode-tab"));
    els.speed2Rule = byId("speed2-rule");
    els.speed2Time = byId("speed2-time");
    els.speed2Level = byId("speed2-level");
    els.speed2Best = byId("speed2-best");
    els.speed2Grid = byId("speed2-grid");
    els.speed2Input = byId("speed2-input");
    els.speed2Start = byId("speed2-start");
    els.speed2Pause = byId("speed2-pause");
    els.speed2Reset = byId("speed2-reset");
    els.speed2Check = byId("speed2-check");
    els.speed2Status = byId("speed2-status");

    els.rotPrompt = byId("rot-prompt");
    els.rotOptions = byId("rot-options");
    els.rotStart = byId("rot-start");
    els.rotStatus = byId("rot-status");

    els.mathTimer = byId("math-timer");
    els.mathQuestion = byId("math-question");
    els.mathOptions = byId("math-options");
    els.mathStart = byId("math-start");
    els.mathStop = byId("math-stop");
    els.mathStatus = byId("math-status");
    els.cognitivePacingNote = byId("cognitive-pacing-note");
    els.timingQualitySummary = byId("timing-quality-summary");
    els.sessionBreakBtn = byId("session-break-btn");
    els.timingQualityReset = byId("timing-quality-reset");

    els.progressAverage = byId("progress-average");
    els.progressBest = byId("progress-best");
    els.progressQuestions = byId("progress-questions");
    els.progressLast = byId("progress-last");
    els.progressCognitiveCount = byId("progress-cognitive-count");
    els.progressCognitiveAverage = byId("progress-cognitive-average");
    els.progressMasteryCoverage = byId("progress-mastery-coverage");
    els.progressNeedsReview = byId("progress-needs-review");
    els.progressRange = byId("progress-range");
    els.progressGranularity = byId("progress-granularity");
    els.historyLimit = byId("history-limit");
    els.progressSummary = byId("progress-summary");
    els.progressChart = byId("progress-chart");
    els.topicMasteryList = byId("topic-mastery-list");
    els.masteryFocus = byId("mastery-focus");
    els.badgeRow = byId("badge-row");
    els.historyBody = byId("history-body");
    els.historyOverview = byId("history-overview");
    els.exportHistory = byId("export-history");
    els.importHistory = byId("import-history");
    els.importHistoryFile = byId("import-history-file");
    els.progressSyncStatus = byId("progress-sync-status");
    els.clearHistory = byId("clear-history");
    els.leaderboardDisplayName = byId("leaderboard-display-name");
    els.leaderboardOptIn = byId("leaderboard-opt-in");
    els.leaderboardSave = byId("leaderboard-save");
    els.leaderboardRefresh = byId("leaderboard-refresh");
    els.leaderboardStatus = byId("leaderboard-status");
    els.leaderboardList = byId("leaderboard-list");

    els.sourcesList = byId("sources-list");
  }

  function loadData() {
    var data = window.ASTRO_TRAINING_DATA;
    if (!data || !Array.isArray(data.topics)) {
      throw new Error("Astronaut training data was not found.");
    }

    appState.topics = data.topics
      .filter(function (topic) {
        return topic && topic.id && topic.name && Array.isArray(topic.cards) && topic.cards.length > 0;
      })
      .map(function (topic) {
        return {
          id: topic.id,
          name: topic.name,
          icon: topic.icon || "mdi:folder-outline",
          description: topic.description || "",
          cards: topic.cards.map(function (card, index) {
            return {
              id: card.id || topic.id + "-" + String(index + 1),
              q: String(card.q || "").trim(),
              a: String(card.a || "").trim(),
              image: typeof card.image === "string" ? card.image.trim() : "",
              imageAlt: typeof card.imageAlt === "string" ? card.imageAlt.trim() : "",
              topicId: topic.id,
              topicName: topic.name
            };
          }).filter(function (card) {
            return card.q.length > 0 && card.a.length > 0;
          })
        };
      });

    appState.allCards = appState.topics.reduce(function (acc, topic) {
      return acc.concat(topic.cards);
    }, []);

    if (!appState.topics.length) {
      throw new Error("No valid training topics were found.");
    }

    appState.currentTopicId = appState.topics[0].id;

    var sources = Array.isArray(data.sources) ? data.sources : [];
    els.sourcesList.innerHTML = "";
    sources.forEach(function (src) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = src.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = src.label || src.url;
      li.appendChild(a);
      els.sourcesList.appendChild(li);
    });
  }

  function restoreState() {
    ensureInstallationId();

    var profileRaw = safeRead(STORE_KEYS.profile, null);
    if (profileRaw && typeof profileRaw === "object") {
      appState.profile.xp = Number(profileRaw.xp) || 0;
      appState.profile.streak = Number(profileRaw.streak) || 0;
      appState.profile.quizCount = Number(profileRaw.quizCount) || 0;
      appState.profile.lastPracticeDate = profileRaw.lastPracticeDate || null;
      appState.profile.badges = Array.isArray(profileRaw.badges) ? profileRaw.badges : [];
    }

    var attemptsRaw = safeRead(STORE_KEYS.attempts, []);
    appState.attempts = dedupeHistoryById(
      (Array.isArray(attemptsRaw) ? attemptsRaw : [])
        .map(normalizeAttemptEntry)
        .filter(Boolean)
    );

    var prefsRaw = safeRead(STORE_KEYS.progressPrefs, null);
    if (prefsRaw && typeof prefsRaw === "object") {
      appState.progressPrefs.range = sanitizeProgressRange(prefsRaw.range);
      appState.progressPrefs.granularity = sanitizeProgressGranularity(prefsRaw.granularity);
      appState.progressPrefs.speedMode = sanitizeSpeedMode(prefsRaw.speedMode);
      appState.progressPrefs.historyLimit = sanitizeHistoryLimit(prefsRaw.historyLimit);
    }

    var leaderboardRaw = safeRead(STORE_KEYS.leaderboardPrefs, null);
    if (leaderboardRaw && typeof leaderboardRaw === "object") {
      appState.leaderboard.displayName = String(leaderboardRaw.displayName || "").trim();
      appState.leaderboard.optIn = Boolean(leaderboardRaw.optIn);
    }

    var leaderboardCacheRaw = safeRead(STORE_KEYS.leaderboardCache, null);
    if (leaderboardCacheRaw && typeof leaderboardCacheRaw === "object") {
      appState.leaderboardCache.rows = normalizeLeaderboardRows(leaderboardCacheRaw.rows);
      appState.leaderboardCache.fetchedAt = normalizeIsoTimestamp(leaderboardCacheRaw.fetchedAt);
    }

    var cogRaw = safeRead(STORE_KEYS.cognitive, null);
    if (cogRaw && typeof cogRaw === "object") {
      appState.cognitive.digitLevel = Number(cogRaw.digitLevel) || 4;
      appState.cognitive.digitBest = Number(cogRaw.digitBest) || appState.cognitive.digitLevel;
      var visualLevel = Number(cogRaw.visualLevel);
      if (!Number.isFinite(visualLevel)) {
        visualLevel = Number(cogRaw.visualTiles);
      }
      visualLevel = clamp(Math.round(Number(visualLevel) || 5), 5, 18);
      appState.cognitive.visualLevel = visualLevel;
      appState.cognitive.visualBest = clamp(Math.round(Number(cogRaw.visualBest) || visualLevel), 5, 18);
      appState.cognitive.visualMistakes = clamp(Math.round(Number(cogRaw.visualMistakes) || 0), 0, 2);
      appState.cognitive.rmsLevel = Number(cogRaw.rmsLevel) || 3;
      appState.cognitive.rmsBest = Number(cogRaw.rmsBest) || appState.cognitive.rmsLevel;
      appState.cognitive.rmsSpeedFactor = normalizeRmsSpeedFactor(cogRaw.rmsSpeedFactor);
      appState.cognitive.speedLevel = Number(cogRaw.speedLevel) || 1;
      appState.cognitive.speedBest = Number(cogRaw.speedBest) || appState.cognitive.speedLevel;
      appState.cognitive.speed2Level = Number(cogRaw.speed2Level) || 1;
      appState.cognitive.speed2Best = Number(cogRaw.speed2Best) || appState.cognitive.speed2Level;
      appState.cognitive.rotationLevel = Number(cogRaw.rotationLevel) || 2;
      appState.cognitive.rotationBest = Number(cogRaw.rotationBest) || appState.cognitive.rotationLevel;
      appState.cognitive.mathLevel = Number(cogRaw.mathLevel) || 1;
      appState.cognitive.mathBest = Number(cogRaw.mathBest) || appState.cognitive.mathLevel;
      appState.cognitive.concentrationLevel = clamp(Number(cogRaw.concentrationLevel) || 1, 1, 8);
      appState.cognitive.concentrationBest = Math.max(
        appState.cognitive.concentrationLevel,
        clamp(Number(cogRaw.concentrationBest) || appState.cognitive.concentrationLevel, 1, 8)
      );
      appState.cognitive.reactionRuns = Array.isArray(cogRaw.reactionRuns)
        ? cogRaw.reactionRuns.map(function (value) {
          return Math.round(Number(value) || 0);
        }).filter(function (value) {
          return Number.isFinite(value) && value >= REACTION_MIN_VALID_MS && value <= 3000;
        })
        : [];
      appState.cognitive.reactionAudit = Array.isArray(cogRaw.reactionAudit)
        ? cogRaw.reactionAudit.filter(function (entry) {
          return entry && typeof entry === "object";
        }).slice(-200)
        : [];
      appState.cognitive.speedAudit = Array.isArray(cogRaw.speedAudit)
        ? cogRaw.speedAudit.filter(function (entry) {
          return entry && typeof entry === "object";
        }).slice(-200)
        : [];
      appState.cognitive.speed2Audit = Array.isArray(cogRaw.speed2Audit)
        ? cogRaw.speed2Audit.filter(function (entry) {
          return entry && typeof entry === "object";
        }).slice(-200)
        : [];
      appState.cognitive.drillLogs = dedupeHistoryById(
        (Array.isArray(cogRaw.drillLogs) ? cogRaw.drillLogs : [])
          .map(normalizeDrillLogEntry)
          .filter(Boolean)
      );
    }

    refreshQuestionStatsFromAttempts();
    recalculateProfileFromHistory();
  }

  function persistState() {
    safeWrite(STORE_KEYS.profile, appState.profile);
    safeWrite(STORE_KEYS.attempts, appState.attempts);
    safeWrite(STORE_KEYS.cognitive, appState.cognitive);
    safeWrite(STORE_KEYS.progressPrefs, appState.progressPrefs);
    safeWrite(STORE_KEYS.leaderboardPrefs, appState.leaderboard);
    safeWrite(STORE_KEYS.installationId, appState.installationId);
    scheduleLeaderboardSync("persist");
  }

  function showGateStatus(message, type) {
    els.gateStatus.textContent = message || "";
    els.gateStatus.classList.remove("error", "success");
    if (type) {
      els.gateStatus.classList.add(type);
    }
  }

  function setGateModeNote(message) {
    if (!els.gateModeNote) {
      return;
    }
    els.gateModeNote.textContent = message || "";
  }

  function setGateBusy(isBusy) {
    var busy = Boolean(isBusy);
    if (els.gateEmail) {
      els.gateEmail.disabled = busy;
    }
    if (els.gatePassword) {
      els.gatePassword.disabled = busy;
    }
    if (els.gateDisplayName) {
      els.gateDisplayName.disabled = busy;
    }
    if (els.gateSignIn) {
      els.gateSignIn.disabled = busy;
    }
    if (els.gateSignUp) {
      els.gateSignUp.disabled = busy;
    }
    if (els.gateLocal) {
      els.gateLocal.disabled = busy;
    }
  }

  function hasSupabaseAuthConfig() {
    return (
      AUTH_PROVIDER === "supabase" &&
      typeof window.supabase === "object" &&
      typeof window.supabase.createClient === "function" &&
      typeof AUTH_CONFIG.supabaseUrl === "string" &&
      AUTH_CONFIG.supabaseUrl.trim().length > 0 &&
      typeof AUTH_CONFIG.supabaseAnonKey === "string" &&
      AUTH_CONFIG.supabaseAnonKey.trim().length > 0
    );
  }

  function getSupabaseClient() {
    if (!hasSupabaseAuthConfig()) {
      return null;
    }
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(
        AUTH_CONFIG.supabaseUrl.trim(),
        AUTH_CONFIG.supabaseAnonKey.trim(),
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }
    return supabaseClient;
  }

  function normalizeAuthEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function hashLocalPassword(password) {
    var input = String(password || "");
    var hash = 2166136261; // FNV-1a 32-bit
    for (var i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return "fnv1a32:" + (hash >>> 0).toString(16);
  }

  function readLocalAccountsStore() {
    var raw = safeRead(STORE_KEYS.localAccounts, { users: {} });
    if (!raw || typeof raw !== "object") {
      return { users: {} };
    }
    if (!raw.users || typeof raw.users !== "object") {
      raw.users = {};
    }
    return raw;
  }

  function writeLocalAccountsStore(store) {
    safeWrite(STORE_KEYS.localAccounts, store || { users: {} });
  }

  function buildLocalAuthUser(email, displayName) {
    var normalizedEmail = normalizeAuthEmail(email);
    var cleanName = String(displayName || "").trim();
    return {
      id: "local:" + normalizedEmail,
      email: normalizedEmail,
      user_metadata: {
        display_name: cleanName || normalizedEmail
      }
    };
  }

  function createLocalAccount(email, password, displayName) {
    var normalizedEmail = normalizeAuthEmail(email);
    var secret = String(password || "");
    if (!normalizedEmail) {
      return { error: "Email is required." };
    }
    if (secret.length < LOCAL_ACCOUNT_PASSWORD_MIN) {
      return { error: "Password must be at least " + LOCAL_ACCOUNT_PASSWORD_MIN + " characters." };
    }

    var store = readLocalAccountsStore();
    if (store.users[normalizedEmail]) {
      return { error: "This local account already exists. Use Sign In." };
    }

    var cleanName = String(displayName || "").trim();
    store.users[normalizedEmail] = {
      email: normalizedEmail,
      displayName: cleanName || normalizedEmail,
      passwordHash: hashLocalPassword(secret),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    writeLocalAccountsStore(store);
    safeWrite(STORE_KEYS.localLastAccount, normalizedEmail);
    return {
      user: buildLocalAuthUser(normalizedEmail, store.users[normalizedEmail].displayName)
    };
  }

  function signInLocalAccount(email, password) {
    var normalizedEmail = normalizeAuthEmail(email);
    var secret = String(password || "");
    if (!normalizedEmail || !secret) {
      return { error: "Email and password are required." };
    }

    var store = readLocalAccountsStore();
    var account = store.users[normalizedEmail];
    if (!account) {
      return { error: "No local account found. Create one first." };
    }

    var hash = hashLocalPassword(secret);
    if (account.passwordHash !== hash) {
      return { error: "Incorrect password for this local account." };
    }

    account.lastLoginAt = new Date().toISOString();
    store.users[normalizedEmail] = account;
    writeLocalAccountsStore(store);
    safeWrite(STORE_KEYS.localLastAccount, normalizedEmail);
    return {
      user: buildLocalAuthUser(normalizedEmail, account.displayName)
    };
  }

  function authDisplayName(user) {
    if (!user || typeof user !== "object") {
      return "Unknown user";
    }
    var metadata = user.user_metadata && typeof user.user_metadata === "object"
      ? user.user_metadata
      : {};
    var candidate = String(metadata.display_name || metadata.full_name || "").trim();
    if (candidate) {
      return candidate;
    }
    var email = String(user.email || "").trim();
    if (email) {
      return email;
    }
    return "Authenticated user";
  }

  function updateAuthBadge() {
    if (!els.authUserLabel) {
      return;
    }
    if (activeAccessMode === "supabase" && activeAuthUser) {
      els.authUserLabel.textContent = "Signed in: " + authDisplayName(activeAuthUser);
      if (els.authSignout) {
        els.authSignout.hidden = false;
      }
      return;
    }
    if (activeAccessMode === "local-account" && activeAuthUser) {
      els.authUserLabel.textContent = "Signed in (local): " + authDisplayName(activeAuthUser);
      if (els.authSignout) {
        els.authSignout.hidden = false;
      }
      return;
    }
    els.authUserLabel.textContent = "Mode: local only";
    if (els.authSignout) {
      els.authSignout.hidden = true;
    }
  }

  function lockApp(message) {
    sessionStorage.removeItem(STORE_KEYS.unlocked);
    activeAccessMode = "local";
    activeAuthSession = null;
    activeAuthUser = null;
    updateAuthBadge();
    populateLeaderboardControls();
    els.app.hidden = true;
    els.gate.hidden = false;
    if (message) {
      showGateStatus(message, "error");
    }
  }

  function unlockApp(mode, session) {
    var accessMode = mode === "supabase"
      ? "supabase"
      : (mode === "local-account" ? "local-account" : "local");
    if (accessMode === "local") {
      sessionStorage.setItem(STORE_KEYS.unlocked, "1");
      activeAuthSession = null;
      activeAuthUser = null;
    } else if (accessMode === "local-account") {
      sessionStorage.setItem(STORE_KEYS.unlocked, "1");
      activeAuthSession = null;
      activeAuthUser = session && session.user ? session.user : null;
    } else {
      sessionStorage.removeItem(STORE_KEYS.unlocked);
      activeAuthSession = session || null;
      activeAuthUser = session && session.user ? session.user : null;
      if (!String(appState.leaderboard.displayName || "").trim() && activeAuthUser) {
        appState.leaderboard.displayName = authDisplayName(activeAuthUser);
      }
    }
    activeAccessMode = accessMode;
    updateAuthBadge();
    els.gate.hidden = true;
    els.app.hidden = false;
    try {
      if (!trainingUiInitialized) {
        initializeTrainingUI();
        trainingUiInitialized = true;
      } else {
        renderProfile();
        renderProgress();
      }
      populateLeaderboardControls();
      if (canUseRemoteLeaderboard() && appState.leaderboard.optIn) {
        scheduleLeaderboardSync("auth");
      }
    } catch (err) {
      console.error(err);
      trainingUiInitialized = false;
      lockApp("Unable to initialize training app.");
    }
  }

  function initGate() {
    var localUnlocked = sessionStorage.getItem(STORE_KEYS.unlocked) === "1";
    updateAuthBadge();

    if (els.authSignout) {
      els.authSignout.addEventListener("click", function () {
        var client = getSupabaseClient();
        if (!client) {
          lockApp("Signed out of local session.");
          return;
        }
        setGateBusy(true);
        client.auth.signOut()
          .then(function (result) {
            if (result && result.error) {
              throw result.error;
            }
            lockApp("Signed out.");
          })
          .catch(function (err) {
            console.error(err);
            showGateStatus("Sign-out failed. Please try again.", "error");
          })
          .finally(function () {
            setGateBusy(false);
          });
      });
    }

    els.gateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var client = getSupabaseClient();
      var email = String(els.gateEmail.value || "").trim();
      var password = String(els.gatePassword.value || "");
      if (!email || !password) {
        showGateStatus("Email and password are required.", "error");
        return;
      }

      if (!client) {
        var localResult = signInLocalAccount(email, password);
        if (localResult.error) {
          showGateStatus(localResult.error, "error");
          return;
        }
        if (localResult.user) {
          var localDisplay = authDisplayName(localResult.user);
          if (els.gateDisplayName && !String(els.gateDisplayName.value || "").trim()) {
            els.gateDisplayName.value = localDisplay;
          }
          appState.leaderboard.displayName = localDisplay;
          showGateStatus("Signed in with local account.", "success");
          unlockApp("local-account", { user: localResult.user });
          return;
        }
        showGateStatus("Unable to sign in locally. Please try again.", "error");
        return;
      }

      setGateBusy(true);
      client.auth.signInWithPassword({ email: email, password: password })
        .then(function (result) {
          if (result.error) {
            throw result.error;
          }
          if (result.data && result.data.session) {
            showGateStatus("Signed in successfully.", "success");
            unlockApp("supabase", result.data.session);
            return;
          }
          showGateStatus("Sign-in succeeded but no session was returned.", "error");
        })
        .catch(function (err) {
          console.error(err);
          showGateStatus("Sign-in failed: " + String(err.message || err), "error");
        })
        .finally(function () {
          setGateBusy(false);
        });
    });

    if (els.gateSignUp) {
      els.gateSignUp.addEventListener("click", function () {
        var client = getSupabaseClient();
        var email = String(els.gateEmail.value || "").trim();
        var password = String(els.gatePassword.value || "");
        var displayName = String(els.gateDisplayName.value || "").trim();
        if (!email || !password) {
          showGateStatus("Email and password are required to create an account.", "error");
          return;
        }

        if (!client) {
          var localCreated = createLocalAccount(email, password, displayName);
          if (localCreated.error) {
            showGateStatus(localCreated.error, "error");
            return;
          }
          if (localCreated.user) {
            var localName = authDisplayName(localCreated.user);
            if (els.gateDisplayName && !String(els.gateDisplayName.value || "").trim()) {
              els.gateDisplayName.value = localName;
            }
            appState.leaderboard.displayName = localName;
            showGateStatus("Local account created on this device and signed in.", "success");
            unlockApp("local-account", { user: localCreated.user });
            return;
          }
          showGateStatus("Unable to create local account. Please try again.", "error");
          return;
        }

        setGateBusy(true);
        client.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              display_name: displayName || email
            }
          }
        }).then(function (result) {
          if (result.error) {
            throw result.error;
          }
          if (result.data && result.data.session) {
            showGateStatus("Account created and signed in.", "success");
            unlockApp("supabase", result.data.session);
            return;
          }
          showGateStatus("Account created. Check your email to confirm before signing in.", "success");
        }).catch(function (err) {
          console.error(err);
          showGateStatus("Create-account failed: " + String(err.message || err), "error");
        }).finally(function () {
          setGateBusy(false);
        });
      });
    }

    if (els.gateLocal) {
      els.gateLocal.addEventListener("click", function () {
        showGateStatus("Local-only mode unlocked on this browser session.", "success");
        unlockApp("local", null);
      });
    }

    if (!hasSupabaseAuthConfig()) {
      setGateModeNote(
        "Auth backend status: Supabase not configured. You can still Create Account locally on this device, Sign In to that local account, or continue in Local-Only Mode."
      );
      var rememberedLocalEmail = String(safeRead(STORE_KEYS.localLastAccount, "") || "").trim();
      if (rememberedLocalEmail && els.gateEmail && !String(els.gateEmail.value || "").trim()) {
        els.gateEmail.value = rememberedLocalEmail;
      }
      if (localUnlocked) {
        unlockApp("local", null);
      }
      return;
    }

    setGateModeNote("Auth backend status: Supabase configured. Sign in to unlock account-backed training.");
    var client = getSupabaseClient();
    setGateBusy(true);
    client.auth.getSession()
      .then(function (result) {
        if (result && result.error) {
          throw result.error;
        }
        var session = result && result.data ? result.data.session : null;
        if (session && session.user) {
          unlockApp("supabase", session);
          return;
        }
        if (localUnlocked) {
          unlockApp("local", null);
        }
      })
      .catch(function (err) {
        console.error(err);
        showGateStatus("Unable to restore auth session; you can still use Local-Only Mode.", "error");
        if (localUnlocked) {
          unlockApp("local", null);
        }
      })
      .finally(function () {
        setGateBusy(false);
      });

    client.auth.onAuthStateChange(function (_event, session) {
      if (session && session.user) {
        unlockApp("supabase", session);
      } else if (!els.app.hidden && activeAccessMode === "supabase") {
        lockApp("Session ended. Please sign in again or continue in Local-Only Mode.");
      }
    });
  }

  function canUseRemoteLeaderboard() {
    return (
      activeAccessMode === "supabase" &&
      activeAuthUser &&
      typeof activeAuthUser.id === "string" &&
      activeAuthUser.id.length > 0 &&
      Boolean(getSupabaseClient())
    );
  }

  function leaderboardDisplayName() {
    var localName = String(appState.leaderboard.displayName || "").trim();
    if (localName) {
      return localName;
    }
    if (activeAuthUser) {
      return authDisplayName(activeAuthUser);
    }
    return "";
  }

  function normalizeLeaderboardRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    return list.map(function (row) {
      if (!row || typeof row !== "object") {
        return null;
      }
      var name = String(row.displayName || "").trim().slice(0, 40);
      var xp = Math.max(0, Math.round(Number(row.totalXp) || 0));
      var quizCount = Math.max(0, Math.round(Number(row.quizCount) || 0));
      var cognitiveCount = Math.max(0, Math.round(Number(row.cognitiveCount) || 0));
      if (!name) {
        return null;
      }
      return {
        displayName: name,
        totalXp: xp,
        quizCount: quizCount,
        cognitiveCount: cognitiveCount
      };
    }).filter(Boolean).slice(0, 50);
  }

  function leaderboardCacheStampLabel(iso) {
    var ts = normalizeIsoTimestamp(iso);
    return ts ? formatAttemptDate(ts) : "";
  }

  function persistLeaderboardCache(rows, fetchedAt) {
    var normalizedRows = normalizeLeaderboardRows(rows);
    var timestamp = normalizeIsoTimestamp(fetchedAt) || new Date().toISOString();
    appState.leaderboardCache = {
      rows: normalizedRows,
      fetchedAt: timestamp
    };
    safeWrite(STORE_KEYS.leaderboardCache, appState.leaderboardCache);
  }

  function setLeaderboardStatus(message, type) {
    if (!els.leaderboardStatus) {
      return;
    }
    var fallback = canUseRemoteLeaderboard()
      ? "Signed in. Save your opt-in settings and refresh leaderboard."
      : "Sign in to sync leaderboard settings.";
    els.leaderboardStatus.textContent = message || fallback;
    els.leaderboardStatus.classList.remove("success", "error");
    if (type) {
      els.leaderboardStatus.classList.add(type);
    }
  }

  function renderLeaderboardList(rows) {
    if (!els.leaderboardList) {
      return;
    }
    var list = Array.isArray(rows) ? rows : [];
    els.leaderboardList.innerHTML = "";
    if (!list.length) {
      var empty = document.createElement("li");
      empty.textContent = "No public leaderboard entries yet.";
      els.leaderboardList.appendChild(empty);
      return;
    }
    list.forEach(function (item, idx) {
      var li = document.createElement("li");
      li.className = "leaderboard-item";
      var rank = document.createElement("span");
      rank.className = "leaderboard-rank";
      rank.textContent = "#" + String(idx + 1);
      var name = document.createElement("span");
      name.className = "leaderboard-name";
      name.textContent = String(item.displayName || "Anonymous");
      var meta = document.createElement("span");
      meta.className = "leaderboard-meta";
      meta.textContent =
        String(item.totalXp || 0) + " XP | " +
        String(item.quizCount || 0) + " quizzes | " +
        String(item.cognitiveCount || 0) + " drills";
      li.appendChild(rank);
      li.appendChild(name);
      li.appendChild(meta);
      els.leaderboardList.appendChild(li);
    });
  }

  function setLeaderboardControlsEnabled(enabled) {
    var active = Boolean(enabled);
    if (els.leaderboardDisplayName) {
      els.leaderboardDisplayName.disabled = !active;
    }
    if (els.leaderboardOptIn) {
      els.leaderboardOptIn.disabled = !active;
    }
    if (els.leaderboardSave) {
      els.leaderboardSave.disabled = !active;
    }
    if (els.leaderboardRefresh) {
      els.leaderboardRefresh.disabled = !active;
    }
  }

  function populateLeaderboardControls() {
    if (els.leaderboardDisplayName) {
      els.leaderboardDisplayName.value = leaderboardDisplayName();
    }
    if (els.leaderboardOptIn) {
      els.leaderboardOptIn.checked = Boolean(appState.leaderboard.optIn);
    }
    setLeaderboardControlsEnabled(canUseRemoteLeaderboard());
  }

  function leaderboardSnapshotRow() {
    var attempts = Array.isArray(appState.attempts) ? appState.attempts : [];
    var drills = Array.isArray(appState.cognitive.drillLogs) ? appState.cognitive.drillLogs : [];
    var avgQuiz = attempts.length
      ? Math.round(attempts.reduce(function (sum, entry) { return sum + (Number(entry.score) || 0); }, 0) / attempts.length)
      : 0;
    var avgDrill = drills.length
      ? Math.round(drills.reduce(function (sum, entry) { return sum + (Number(entry.score) || 0); }, 0) / drills.length)
      : 0;
    var bestQuiz = attempts.length
      ? Math.max.apply(null, attempts.map(function (entry) { return Number(entry.score) || 0; }))
      : 0;
    var bestDrill = drills.length
      ? Math.max.apply(null, drills.map(function (entry) { return Number(entry.score) || 0; }))
      : 0;

    return {
      user_id: activeAuthUser.id,
      total_xp: Number(appState.profile.xp) || 0,
      streak_days: Number(appState.profile.streak) || 0,
      quiz_count: attempts.length,
      cognitive_count: drills.length,
      avg_quiz_score: avgQuiz,
      avg_cognitive_score: avgDrill,
      best_quiz_score: bestQuiz,
      best_cognitive_score: bestDrill,
      updated_at: new Date().toISOString()
    };
  }

  function syncLeaderboardNow(reason) {
    if (!canUseRemoteLeaderboard()) {
      return Promise.resolve(false);
    }
    var client = getSupabaseClient();
    var profileRow = {
      user_id: activeAuthUser.id,
      display_name: String(appState.leaderboard.displayName || authDisplayName(activeAuthUser)).trim().slice(0, 40),
      leaderboard_opt_in: Boolean(appState.leaderboard.optIn),
      updated_at: new Date().toISOString()
    };
    var scoreRow = leaderboardSnapshotRow();
    return client.from("astro_profiles")
      .upsert([profileRow], { onConflict: "user_id" })
      .then(function (profileResult) {
        if (profileResult && profileResult.error) {
          throw profileResult.error;
        }
        return client.from("astro_leaderboard_scores")
          .upsert([scoreRow], { onConflict: "user_id" });
      }).then(function (scoreResult) {
        if (scoreResult && scoreResult.error) {
          throw scoreResult.error;
        }
        setLeaderboardStatus(
          "Leaderboard sync complete" + (reason ? " (" + reason + ")" : "") + ".",
          "success"
        );
        return true;
      }).catch(function (err) {
        console.error(err);
        setLeaderboardStatus(
          "Leaderboard sync failed. Ensure tables + RLS are configured. (" + String(err.message || err) + ")",
          "error"
        );
        return false;
      });
  }

  function scheduleLeaderboardSync(reason) {
    if (!canUseRemoteLeaderboard()) {
      return;
    }
    if (leaderboardSyncTimer) {
      clearTimeout(leaderboardSyncTimer);
    }
    leaderboardSyncTimer = setTimeout(function () {
      syncLeaderboardNow(reason || "auto");
    }, 1400);
  }

  function refreshLeaderboardList() {
    var cachedRows = normalizeLeaderboardRows(appState.leaderboardCache.rows);
    var cachedStamp = leaderboardCacheStampLabel(appState.leaderboardCache.fetchedAt);
    var cachedStampText = cachedStamp || "your recent session";
    if (!canUseRemoteLeaderboard()) {
      if (cachedRows.length) {
        renderLeaderboardList(cachedRows);
        setLeaderboardStatus(
          "Showing cached leaderboard from " + cachedStampText + ". Sign in to refresh live data."
        );
        return Promise.resolve(true);
      }
      setLeaderboardStatus("Sign in to fetch leaderboard data.", "error");
      renderLeaderboardList([]);
      return Promise.resolve(false);
    }
    var client = getSupabaseClient();
    return client.from("astro_leaderboard_scores")
      .select("user_id,total_xp,quiz_count,cognitive_count,updated_at")
      .order("total_xp", { ascending: false })
      .limit(50)
      .then(function (scoresResult) {
        if (scoresResult && scoresResult.error) {
          throw scoresResult.error;
        }
        var scoreRows = Array.isArray(scoresResult.data) ? scoresResult.data : [];
        if (!scoreRows.length) {
          persistLeaderboardCache([], new Date().toISOString());
          renderLeaderboardList([]);
          setLeaderboardStatus("Leaderboard is empty for now.");
          return true;
        }
        var userIds = scoreRows.map(function (row) { return row.user_id; }).filter(Boolean);
        return client.from("astro_profiles")
          .select("user_id,display_name,leaderboard_opt_in")
          .in("user_id", userIds)
          .eq("leaderboard_opt_in", true)
          .then(function (profilesResult) {
            if (profilesResult && profilesResult.error) {
              throw profilesResult.error;
            }
            var profileMap = {};
            (profilesResult.data || []).forEach(function (profile) {
              profileMap[profile.user_id] = profile;
            });
            var rows = scoreRows
              .filter(function (row) { return Boolean(profileMap[row.user_id]); })
              .map(function (row) {
                var profile = profileMap[row.user_id];
                return {
                  displayName: profile.display_name || "Anonymous",
                  totalXp: row.total_xp || 0,
                  quizCount: row.quiz_count || 0,
                  cognitiveCount: row.cognitive_count || 0
                };
              });
            persistLeaderboardCache(rows, new Date().toISOString());
            renderLeaderboardList(rows);
            setLeaderboardStatus("Leaderboard refreshed.");
            return true;
          });
      })
      .catch(function (err) {
        console.error(err);
        if (cachedRows.length) {
          renderLeaderboardList(cachedRows);
          setLeaderboardStatus(
            "Live refresh failed. Showing cached leaderboard from " + cachedStampText + ".",
            "error"
          );
          return true;
        }
        setLeaderboardStatus(
          "Could not load leaderboard. Check schema/RLS setup. (" + String(err.message || err) + ")",
          "error"
        );
        return false;
      });
  }

  function setTab(panelId) {
    els.tabButtons.forEach(function (button) {
      var active = button.getAttribute("aria-controls") === panelId;
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    els.tabPanels.forEach(function (panel) {
      panel.hidden = panel.id !== panelId;
    });

    if (panelId === "panel-progress") {
      renderProgress();
      populateLeaderboardControls();
      refreshLeaderboardList();
    } else if (panelId === "panel-quiz") {
      renderQuizRecommendation();
    }
  }

  function initTabs() {
    els.tabButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var panelId = button.getAttribute("aria-controls");
        setTab(panelId);
      });
    });
  }

  function populateTopicInputs() {
    els.flashTopicSelect.innerHTML = "";
    els.quizTopic.innerHTML = "";

    appState.topics.forEach(function (topic) {
      var optFlash = document.createElement("option");
      optFlash.value = topic.id;
      optFlash.textContent = topic.name;
      els.flashTopicSelect.appendChild(optFlash);

      var optQuiz = document.createElement("option");
      optQuiz.value = topic.id;
      optQuiz.textContent = topic.name;
      els.quizTopic.appendChild(optQuiz);
    });

    els.flashTopicSelect.value = appState.currentTopicId;
    els.quizTopic.value = appState.currentTopicId;
  }

  function renderFolders() {
    els.topicFolders.innerHTML = "";
    appState.topics.forEach(function (topic) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "astro-folder" + (topic.id === appState.currentTopicId ? " active" : "");
      button.dataset.topicId = topic.id;
      button.innerHTML =
        '<span class="astro-folder-name"><iconify-icon icon="' + topic.icon + '"></iconify-icon> ' + topic.name + '</span>' +
        '<span class="astro-folder-meta">' + topic.cards.length + " cards</span>";
      button.addEventListener("click", function () {
        appState.currentTopicId = topic.id;
        els.flashTopicSelect.value = topic.id;
        els.quizTopic.value = topic.id;
        prepareFlashDeck();
        renderFolders();
      });
      els.topicFolders.appendChild(button);
    });
  }

  function getCurrentTopic() {
    return appState.topics.find(function (topic) {
      return topic.id === appState.currentTopicId;
    }) || appState.topics[0];
  }

  function prepareFlashDeck() {
    var topic = getCurrentTopic();
    var cards = topic.cards.slice();

    if (appState.flashOrder === "random") {
      cards = shuffle(cards);
    }

    appState.flashDeck = cards;
    appState.flashIndex = 0;
    renderFlashCard();
  }

  function renderFlashCard() {
    if (!appState.flashDeck.length) {
      els.flashQ.textContent = "No cards available.";
      els.flashA.textContent = "";
      els.flashMeta.textContent = "";
      if (els.flashQFigure) {
        els.flashQFigure.hidden = true;
      }
      return;
    }

    var card = appState.flashDeck[appState.flashIndex];
    var topic = getCurrentTopic();
    els.flashQ.textContent = card.q;
    els.flashA.textContent = card.a;
    els.flashMeta.textContent =
      topic.name + " | Card " + (appState.flashIndex + 1) + " of " + appState.flashDeck.length;
    if (els.flashQFigure && els.flashQImage) {
      if (card.image) {
        els.flashQImage.src = card.image;
        els.flashQImage.alt = card.imageAlt || "Training reference image";
        els.flashQFigure.hidden = false;
      } else {
        els.flashQImage.removeAttribute("src");
        els.flashQImage.alt = "";
        els.flashQFigure.hidden = true;
      }
    }
    els.flashCard.classList.remove("is-flipped");
  }

  function initFlashcards() {
    els.flashTopicSelect.addEventListener("change", function () {
      appState.currentTopicId = els.flashTopicSelect.value;
      prepareFlashDeck();
      renderFolders();
    });

    els.flashOrderSelect.addEventListener("change", function () {
      appState.flashOrder = els.flashOrderSelect.value;
      prepareFlashDeck();
    });

    function flipFlash() {
      els.flashCard.classList.toggle("is-flipped");
    }

    els.flashCard.addEventListener("click", flipFlash);
    els.flashCard.addEventListener("keydown", function (event) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        flipFlash();
      }
    });

    els.flashFlip.addEventListener("click", flipFlash);

    els.flashPrev.addEventListener("click", function () {
      if (!appState.flashDeck.length) {
        return;
      }
      appState.flashIndex = (appState.flashIndex - 1 + appState.flashDeck.length) % appState.flashDeck.length;
      renderFlashCard();
    });

    els.flashNext.addEventListener("click", function () {
      if (!appState.flashDeck.length) {
        return;
      }
      appState.flashIndex = (appState.flashIndex + 1) % appState.flashDeck.length;
      renderFlashCard();
    });

    els.flashRandom.addEventListener("click", function () {
      if (!appState.flashDeck.length) {
        return;
      }
      appState.flashIndex = Math.floor(Math.random() * appState.flashDeck.length);
      renderFlashCard();
    });
  }

  function setQuizTopicInputState() {
    var mode = els.quizMode.value;
    els.quizTopic.disabled = mode === "random-all" || mode === "adaptive-weak";
    renderQuizRecommendation();
  }

  function renderQuizRecommendation() {
    if (!els.quizRecommendation) {
      return;
    }
    var topicStats = computeTopicMasteryStats();
    if (!topicStats.length) {
      els.quizRecommendation.textContent = "Adaptive mode targets weaker and less-practiced concepts as your history grows.";
      return;
    }

    var practicedTopics = topicStats.filter(function (topic) {
      return topic.seenCards > 0;
    });

    if (!practicedTopics.length) {
      els.quizRecommendation.textContent =
        "Run one full quiz first, then use Adaptive weak-area mode for targeted review.";
      return;
    }

    var weakest = topicStats[0];
    els.quizRecommendation.textContent =
      "Recommended next focus: " +
      weakest.topicName +
      " (" + weakest.mastery + "% mastery, " + weakest.coverage + "% coverage).";
  }

  function buildQuestion(card, mode) {
    var explicitOptions = Array.isArray(card.options)
      ? card.options.map(function (opt) { return String(opt || "").trim(); }).filter(Boolean)
      : [];
    if (explicitOptions.length >= 2) {
      if (!explicitOptions.some(function (opt) { return opt === card.a; })) {
        explicitOptions.unshift(card.a);
      }
      explicitOptions = uniqueBy(explicitOptions, function (opt) { return opt; });
      return {
        id: card.id,
        prompt: card.q,
        image: card.image || "",
        imageAlt: card.imageAlt || "",
        correctAnswer: card.a,
        options: shuffle(explicitOptions),
        topicId: card.topicId,
        topicName: card.topicName
      };
    }

    var sameTopicPool = appState.allCards.filter(function (c) {
      return c.topicId === card.topicId && c.id !== card.id;
    });
    var globalPool = appState.allCards.filter(function (c) {
      return c.id !== card.id;
    });

    var prioritizedPool = sameTopicPool.slice();
    if (prioritizedPool.length < 8) {
      prioritizedPool = prioritizedPool.concat(globalPool.filter(function (c) {
        return c.topicId !== card.topicId;
      }));
    }

    var uniquePool = uniqueBy(prioritizedPool, function (c) {
      return c.a;
    });

    var ranked = uniquePool.map(function (candidate) {
      var base = candidate.topicId === card.topicId ? 6 : 0;
      return {
        card: candidate,
        score: base + answerSimilarity(card.a, candidate.a)
      };
    }).sort(function (a, b) {
      return b.score - a.score;
    });

    var topBand = ranked.slice(0, Math.max(12, Math.min(40, ranked.length)));
    var distractorCards = sample(topBand, Math.min(3, topBand.length)).map(function (entry) {
      return entry.card;
    });

    if (distractorCards.length < 3) {
      var remaining = uniqueBy(globalPool, function (c) { return c.a; }).filter(function (candidate) {
        return !distractorCards.some(function (d) { return d.id === candidate.id; });
      });
      distractorCards = distractorCards.concat(sample(remaining, 3 - distractorCards.length));
    }

    var distractors = distractorCards.map(function (d) { return d.a; });
    var options = shuffle([card.a].concat(distractors.slice(0, 3)));

    return {
      id: card.id,
      prompt: card.q,
      image: card.image || "",
      imageAlt: card.imageAlt || "",
      correctAnswer: card.a,
      options: options,
      topicId: card.topicId,
      topicName: card.topicName
    };
  }

  function buildQuizSet() {
    refreshQuestionStatsFromAttempts();

    var mode = els.quizMode.value;
    var count = clamp(Number(els.quizCount.value) || 20, 5, 100);
    var selectedTopicId = els.quizTopic.value || appState.currentTopicId;

    var pool = [];
    if (mode === "random-all" || mode === "adaptive-weak") {
      pool = appState.allCards.slice();
    } else {
      pool = appState.allCards.filter(function (card) {
        return card.topicId === selectedTopicId;
      });
    }

    if (!pool.length) {
      return null;
    }

    var chosen;
    if (mode === "series-topic") {
      chosen = pool.slice(0, Math.min(count, pool.length));
    } else if (mode === "adaptive-weak") {
      var targetCount = Math.min(count, pool.length);
      var ranked = pool.slice().sort(function (a, b) {
        return getCardMasteryScore(a.id) - getCardMasteryScore(b.id);
      });
      var weakQuota = targetCount <= 3 ? targetCount : clamp(Math.round(targetCount * 0.45), 3, targetCount);
      var weakAnchors = ranked.slice(0, weakQuota);
      var weakIds = new Set(weakAnchors.map(function (card) { return card.id; }));
      var weightedPool = pool.filter(function (card) { return !weakIds.has(card.id); });
      var weightedPick = weightedSampleWithoutReplacement(
        weightedPool,
        Math.max(0, targetCount - weakAnchors.length),
        computeAdaptiveWeight
      );
      chosen = shuffle(weakAnchors.concat(weightedPick));
    } else {
      chosen = sample(pool, Math.min(count, pool.length));
    }

    return {
      mode: mode,
      topicId: selectedTopicId,
      questions: chosen.map(function (card) {
        return buildQuestion(card, mode);
      })
    };
  }

  function renderQuizQuestion() {
    var quiz = appState.quiz;
    if (quiz.autoNextTimer) {
      clearTimeout(quiz.autoNextTimer);
      quiz.autoNextTimer = null;
    }
    var question = quiz.questions[quiz.index];
    if (!question) {
      return;
    }

    quiz.selectedIndex = null;
    quiz.answered = false;

    els.quizQuestionTitle.textContent = "Question " + (quiz.index + 1);
    els.quizQuestionText.textContent = question.prompt;
    if (els.quizQuestionFigure && els.quizQuestionImage) {
      if (question.image) {
        els.quizQuestionImage.src = question.image;
        els.quizQuestionImage.alt = question.imageAlt || "Question reference image";
        els.quizQuestionFigure.hidden = false;
      } else {
        els.quizQuestionImage.removeAttribute("src");
        els.quizQuestionImage.alt = "";
        els.quizQuestionFigure.hidden = true;
      }
    }
    els.quizProgress.textContent = "Question " + (quiz.index + 1) + " / " + quiz.questions.length;
    els.quizOptions.innerHTML = "";

    question.options.forEach(function (optionText, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-option";
      btn.dataset.index = String(idx);
      btn.textContent = optionText;
      btn.addEventListener("click", function () {
        if (quiz.answered) {
          return;
        }
        quiz.selectedIndex = idx;
        Array.from(els.quizOptions.children).forEach(function (child, childIndex) {
          child.classList.toggle("selected", childIndex === idx);
        });

        if (els.quizInstant && els.quizInstant.checked) {
          submitQuizAnswer();
          if (quiz.running) {
            quiz.autoNextTimer = setTimeout(function () {
              if (quiz.running && quiz.answered) {
                handleQuizNext();
              }
            }, 650);
          }
        }
      });
      els.quizOptions.appendChild(btn);
    });

    els.quizSubmit.disabled = false;
    els.quizNext.disabled = true;
  }

  function startQuiz() {
    var setup = buildQuizSet();
    if (!setup || !setup.questions.length) {
      els.quizScoreText.textContent = "No questions available for this selection.";
      els.quizResult.hidden = false;
      return;
    }

    appState.quiz.running = true;
    appState.quiz.mode = setup.mode;
    appState.quiz.topicId = setup.topicId;
    appState.quiz.questions = setup.questions;
    appState.quiz.index = 0;
    appState.quiz.records = [];
    if (appState.quiz.autoNextTimer) {
      clearTimeout(appState.quiz.autoNextTimer);
      appState.quiz.autoNextTimer = null;
    }

    els.quizResult.hidden = true;
    els.quizLive.hidden = false;
    renderQuizQuestion();
  }

  function submitQuizAnswer() {
    var quiz = appState.quiz;
    if (!quiz.running || quiz.answered) {
      return;
    }

    if (quiz.selectedIndex == null) {
      els.quizProgress.textContent = "Select an option before submitting.";
      return;
    }

    var question = quiz.questions[quiz.index];
    var selectedAnswer = question.options[quiz.selectedIndex];
    var correct = selectedAnswer === question.correctAnswer;

    quiz.answered = true;

    var optionNodes = Array.from(els.quizOptions.children);
    optionNodes.forEach(function (node, idx) {
      var option = question.options[idx];
      node.disabled = true;
      if (option === question.correctAnswer) {
        node.classList.add("correct");
      }
      if (idx === quiz.selectedIndex && option !== question.correctAnswer) {
        node.classList.add("wrong");
      }
    });

    quiz.records.push({
      questionId: question.id,
      topicId: question.topicId,
      question: question.prompt,
      topicName: question.topicName,
      selected: selectedAnswer,
      correctAnswer: question.correctAnswer,
      correct: correct
    });

    els.quizSubmit.disabled = true;
    els.quizNext.disabled = false;
    els.quizProgress.textContent = correct ? "Correct." : "Incorrect.";
    pulseStatus(els.quizProgress);
    triggerHaptic(correct ? "success" : "error");
  }

  function xpFromResult(score, correct, total) {
    var base = correct * 4;
    var completionBonus = total >= 20 ? 14 : 8;
    var precisionBonus = score >= 90 ? 22 : (score >= 75 ? 10 : 0);
    return base + completionBonus + precisionBonus;
  }

  function updateStreak() {
    var today = todayKey();
    var yesterday = yesterdayKey();

    if (appState.profile.lastPracticeDate === today) {
      return;
    }

    if (appState.profile.lastPracticeDate === yesterday) {
      appState.profile.streak += 1;
    } else {
      appState.profile.streak = 1;
    }

    appState.profile.lastPracticeDate = today;
  }

  function getLatestTimestamp(items) {
    if (!Array.isArray(items) || !items.length) {
      return null;
    }
    return items.reduce(function (latest, item) {
      if (!item || !item.timestamp) {
        return latest;
      }
      var ts = new Date(item.timestamp).getTime();
      if (Number.isNaN(ts)) {
        return latest;
      }
      if (latest == null || ts > latest) {
        return ts;
      }
      return latest;
    }, null);
  }

  function drillXpConfig(type) {
    var table = {
      "digit-span": { base: 4.8, refSec: 14, levelScale: 0.045, scoreWeight: 0.72, durationMode: "longer", min: 2, max: 14 },
      "visual-pattern": { base: 6.8, refSec: 22, levelScale: 0.06, scoreWeight: 0.76, durationMode: "longer", min: 4, max: 20 },
      "triangle-concentration": { base: 36, refSec: 110, levelScale: 0.07, scoreWeight: 0.84, durationMode: "longer", min: 18, max: 85 },
      "reaction-time": { base: 0.95, refSec: 4.5, levelScale: 0.01, scoreWeight: 0.5, durationMode: "longer", min: 0, max: 3 },
      "reaction-go-nogo": { base: 10.5, refSec: 35, levelScale: 0.045, scoreWeight: 0.78, durationMode: "faster", min: 6, max: 28 },
      "reaction-stroop": { base: 13, refSec: 45, levelScale: 0.05, scoreWeight: 0.82, durationMode: "faster", min: 7, max: 34 },
      "running-memory-span": { base: 6.4, refSec: 20, levelScale: 0.055, scoreWeight: 0.76, durationMode: "longer", min: 3, max: 18 },
      "perceptual-speed": { base: 4.9, refSec: 16, levelScale: 0.05, scoreWeight: 0.74, durationMode: "faster", min: 3, max: 16 },
      "perceptual-speed-panel": { base: 4.8, refSec: 15, levelScale: 0.055, scoreWeight: 0.76, durationMode: "faster", min: 3, max: 17 },
      "spatial-rotation": { base: 7.2, refSec: 24, levelScale: 0.06, scoreWeight: 0.75, durationMode: "longer", min: 4, max: 20 },
      "math-physics-sprint": { base: 19, refSec: 60, levelScale: 0.05, scoreWeight: 0.83, durationMode: "longer", min: 10, max: 50 }
    };
    return table[type] || { base: 6, refSec: 20, levelScale: 0.05, scoreWeight: 0.7, durationMode: "longer", min: 3, max: 20 };
  }

  function sameDrillStreakMultiplier(type) {
    var logs = Array.isArray(appState.cognitive.drillLogs) ? appState.cognitive.drillLogs : [];
    if (!logs.length) {
      return 1;
    }
    var streak = 0;
    for (var idx = logs.length - 1; idx >= 0; idx -= 1) {
      if (logs[idx] && logs[idx].type === type) {
        streak += 1;
      } else {
        break;
      }
    }
    if (streak >= 12) {
      return 0.45;
    }
    if (streak >= 8) {
      return 0.6;
    }
    if (streak >= 5) {
      return 0.72;
    }
    if (streak >= 3) {
      return 0.85;
    }
    return 1;
  }

  function xpFromCognitiveScore(type, score, meta) {
    var cfg = drillXpConfig(type);
    var safeMeta = meta && typeof meta === "object" ? meta : {};
    var durationSecRaw = Number(safeMeta.durationSec);
    var durationSec = Number.isFinite(durationSecRaw) ? durationSecRaw : cfg.refSec;
    durationSec = clamp(durationSec, cfg.refSec * 0.4, cfg.refSec * 3.2);
    var level = clamp(Math.round(Number(safeMeta.level) || 1), 1, 20);
    var scoreFactor = 0.45 + (clamp(Number(score) || 0, 0, 100) / 100) * cfg.scoreWeight;
    var durationRatio = durationSec / cfg.refSec;
    var durationFactor;
    if (cfg.durationMode === "faster") {
      durationFactor = Math.sqrt(1 / durationRatio);
    } else {
      durationFactor = Math.sqrt(durationRatio);
    }
    durationFactor = clamp(durationFactor, 0.75, 1.35);
    var levelFactor = 1 + (level - 1) * cfg.levelScale;
    var farmFactor = sameDrillStreakMultiplier(type);
    var invalidFactor = safeMeta.invalidQuality ? 0.25 : 1;
    var xp = cfg.base * scoreFactor * durationFactor * levelFactor * farmFactor * invalidFactor;
    return clamp(Math.round(xp), cfg.min, cfg.max);
  }

  function ensureSessionState() {
    if (!appState.session.startedAt) {
      var now = Date.now();
      appState.session.startedAt = now;
      appState.session.lastBreakAt = now;
      appState.session.drillsSinceBreak = 0;
      appState.session.totalDrills = 0;
    }
  }

  function updateSessionPacingNote(forceMessage) {
    if (!els.cognitivePacingNote) {
      return;
    }
    ensureSessionState();
    if (forceMessage) {
      els.cognitivePacingNote.textContent = forceMessage;
      pulseStatus(els.cognitivePacingNote);
      return;
    }

    var elapsedMs = Date.now() - appState.session.lastBreakAt;
    var drills = appState.session.drillsSinceBreak;
    if (drills >= SESSION_BREAK_DRILL_THRESHOLD || elapsedMs >= SESSION_BREAK_ELAPSED_MS) {
      els.cognitivePacingNote.textContent =
        "Pacing tip: take a 2-minute break now (quality drops after ~" +
        SESSION_BREAK_DRILL_THRESHOLD + " drills or ~18 minutes continuous load).";
      pulseStatus(els.cognitivePacingNote);
      return;
    }

    var mins = Math.max(0, Math.round(elapsedMs / 60000));
    els.cognitivePacingNote.textContent =
      "Current block: " + drills + " drills in " + mins + " min since last break.";
  }

  function registerSessionBreak() {
    ensureSessionState();
    appState.session.lastBreakAt = Date.now();
    appState.session.drillsSinceBreak = 0;
    updateSessionPacingNote("Break logged. Nice reset. Start the next block when ready.");
    triggerHaptic("ready");
  }

  function registerDrillForPacing() {
    ensureSessionState();
    appState.session.drillsSinceBreak += 1;
    appState.session.totalDrills += 1;
    updateSessionPacingNote();
  }

  function auditStoreForType(kind) {
    if (kind === "reaction") {
      return appState.cognitive.reactionAudit;
    }
    if (kind === "speed") {
      return appState.cognitive.speedAudit;
    }
    return appState.cognitive.speed2Audit;
  }

  function recordTimingAudit(kind, valid, reason, details) {
    var store = auditStoreForType(kind);
    if (!Array.isArray(store)) {
      return;
    }
    pushCapped(store, {
      timestamp: new Date().toISOString(),
      valid: Boolean(valid),
      reason: String(reason || ""),
      details: details || {}
    }, 200);
    renderTimingQualitySummary();
    persistState();
  }

  function qualitySummaryFor(store) {
    if (!Array.isArray(store) || !store.length) {
      return { total: 0, valid: 0, pct: null };
    }
    var valid = store.filter(function (entry) { return entry && entry.valid; }).length;
    var total = store.length;
    return {
      total: total,
      valid: valid,
      pct: Math.round((valid / total) * 100)
    };
  }

  function renderTimingQualitySummary() {
    if (!els.timingQualitySummary) {
      return;
    }
    var reaction = qualitySummaryFor(appState.cognitive.reactionAudit);
    var speed = qualitySummaryFor(appState.cognitive.speedAudit);
    var speed2 = qualitySummaryFor(appState.cognitive.speed2Audit);
    if (!reaction.total && !speed.total && !speed2.total) {
      els.timingQualitySummary.textContent = "Timing quality: no timing rounds recorded yet.";
      return;
    }

    function fmt(label, item) {
      if (!item.total) {
        return label + ": n/a";
      }
      return label + ": " + item.pct + "% valid (" + item.valid + "/" + item.total + ")";
    }

    els.timingQualitySummary.textContent =
      "Timing quality - " +
      fmt("Reaction", reaction) +
      " | " +
      fmt("Speed", speed) +
      " | " +
      fmt("Speed v2", speed2) + ".";
  }

  function resetTimingQualityAudits() {
    appState.cognitive.reactionAudit = [];
    appState.cognitive.speedAudit = [];
    appState.cognitive.speed2Audit = [];
    renderTimingQualitySummary();
    persistState();
  }

  function markTimingInterruption(reason) {
    if (
      appState.reaction.waiting ||
      appState.reaction.ready ||
      appState.reaction.sessionRunning ||
      appState.reaction.awaitingSessionResponse
    ) {
      appState.reaction.interrupted = true;
    }
    if (appState.speed.running) {
      appState.speed.interrupted = true;
    }
    if (appState.speed2.previewing || appState.speed2.presenting || appState.speed2.challenge) {
      appState.speed2.interrupted = true;
    }
    if (reason && els.timingQualitySummary) {
      pulseStatus(els.timingQualitySummary);
    }
  }

  function markStatusAccessible(el) {
    if (!el) {
      return;
    }
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
  }

  function setupStatusAccessibility() {
    [
      els.digitStatus,
      els.memoryStatus,
      els.concStatus,
      els.reactionStatus,
      els.rmsStatus,
      els.speedStatus,
      els.speed2Status,
      els.rotStatus,
      els.mathStatus,
      els.cognitivePacingNote,
      els.timingQualitySummary
    ].forEach(markStatusAccessible);
  }

  function logCognitiveActivity(type, score, detail, meta) {
    var boundedScore = clamp(Math.round(score), 0, 100);
    var safeMeta = meta && typeof meta === "object" ? meta : {};
    var xpEarned = xpFromCognitiveScore(type, boundedScore, safeMeta);
    var entry = {
      id: createHistoryEntryId("dr"),
      timestamp: new Date().toISOString(),
      type: type,
      score: boundedScore,
      detail: detail || "",
      meta: safeMeta,
      xpEarned: xpEarned
    };

    appState.cognitive.drillLogs.push(entry);
    appState.profile.xp += xpEarned;
    registerDrillForPacing();
    updateStreak();
    refreshBadges();
    persistState();
    renderProfile();
    renderProgress();
    return entry;
  }

  function refreshBadges() {
    var highScoreCount = appState.attempts.filter(function (attempt) {
      return Number(attempt.score) >= 90;
    }).length;

    var topicCoverage = new Set(appState.attempts.map(function (attempt) {
      return attempt.topicId;
    })).size;

    var totalQuestions = appState.attempts.reduce(function (sum, attempt) {
      return sum + (Number(attempt.total) || 0);
    }, 0);

    var ctx = {
      profile: appState.profile,
      highScoreCount: highScoreCount,
      topicCoverage: topicCoverage,
      topicCount: appState.topics.length,
      totalQuestions: totalQuestions
    };

    appState.profile.badges = BADGE_DEFS.filter(function (badge) {
      return badge.check(ctx);
    }).map(function (badge) {
      return badge.id;
    });
  }

  function badgeInfoById(id) {
    return BADGE_DEFS.find(function (badge) {
      return badge.id === id;
    });
  }

  function saveQuizAttempt() {
    var quiz = appState.quiz;
    var total = quiz.records.length;
    var correct = quiz.records.filter(function (r) { return r.correct; }).length;
    var score = total ? Math.round((correct / total) * 100) : 0;
    var xpEarned = xpFromResult(score, correct, total);
    var modeLabel = quiz.mode;

    var attempt = {
      id: createHistoryEntryId("qz"),
      timestamp: new Date().toISOString(),
      mode: modeLabel,
      topicId: (quiz.mode === "random-all" || quiz.mode === "adaptive-weak") ? "all" : quiz.topicId,
      topicName: (quiz.mode === "random-all" || quiz.mode === "adaptive-weak")
        ? "All topics"
        : (appState.topics.find(function (topic) { return topic.id === quiz.topicId; }) || { name: "Unknown" }).name,
      total: total,
      correct: correct,
      score: score,
      xpEarned: xpEarned,
      questionLog: quiz.records.map(function (record) {
        return {
          questionId: record.questionId,
          topicId: record.topicId,
          correct: Boolean(record.correct)
        };
      }).filter(function (entry) {
        return entry.questionId;
      })
    };

    appState.attempts.push(attempt);
    refreshQuestionStatsFromAttempts();

    appState.profile.quizCount += 1;
    appState.profile.xp += xpEarned;
    updateStreak();
    refreshBadges();

    persistState();
    maybeSendEmailReport(attempt);

    return attempt;
  }

  function maybeSendEmailReport(attempt) {
    if (!EMAIL_REPORTS_ENABLED) {
      return;
    }

    // Intentionally disabled for the static-site version; could later call serverless endpoint.
    console.debug("Email report hook", attempt);
  }

  function finishQuiz() {
    if (appState.quiz.autoNextTimer) {
      clearTimeout(appState.quiz.autoNextTimer);
      appState.quiz.autoNextTimer = null;
    }
    var attempt = saveQuizAttempt();
    var level = Math.floor(appState.profile.xp / 500) + 1;

    els.quizLive.hidden = true;
    els.quizResult.hidden = false;
    els.quizScoreTitle.textContent = "Score: " + attempt.score + "%";
    els.quizScoreText.textContent =
      attempt.correct + " / " + attempt.total + " correct | +" + attempt.xpEarned + " XP" +
      " | Level " + level;

    els.quizReview.innerHTML = "";
    appState.quiz.records.forEach(function (record) {
      var item = document.createElement("li");
      item.textContent = record.correct
        ? "Correct: " + record.question
        : "Review: " + record.question + " | Correct: " + record.correctAnswer;
      els.quizReview.appendChild(item);
    });

    appState.quiz.running = false;

    renderProfile();
    renderProgress();
  }

  function handleQuizNext() {
    if (!appState.quiz.running) {
      return;
    }

    if (appState.quiz.autoNextTimer) {
      clearTimeout(appState.quiz.autoNextTimer);
      appState.quiz.autoNextTimer = null;
    }

    if (appState.quiz.index < appState.quiz.questions.length - 1) {
      appState.quiz.index += 1;
      renderQuizQuestion();
    } else {
      finishQuiz();
    }
  }

  function initQuiz() {
    setQuizTopicInputState();

    els.quizMode.addEventListener("change", setQuizTopicInputState);

    els.quizStart.addEventListener("click", function () {
      startQuiz();
    });

    els.quizSubmit.addEventListener("click", function () {
      submitQuizAnswer();
    });

    els.quizNext.addEventListener("click", function () {
      handleQuizNext();
    });

    els.quizRestart.addEventListener("click", function () {
      els.quizResult.hidden = true;
      startQuiz();
    });
  }

  function generateDigits(length) {
    var out = "";
    for (var i = 0; i < length; i += 1) {
      out += String(Math.floor(Math.random() * 10));
    }
    return out;
  }

  function clearDigitFeedback() {
    if (appState.digit.feedbackTimer) {
      clearTimeout(appState.digit.feedbackTimer);
      appState.digit.feedbackTimer = null;
    }
    els.digitFeedback.innerHTML = "";
  }

  function renderDigitCorrectFlash(sequence) {
    var markup = String(sequence).split("").map(function (ch) {
      return '<span class="digit-char ok">' + ch + "</span>";
    }).join("");
    els.digitFeedback.innerHTML = '<span class="digit-line">' + markup + "</span>";
  }

  function renderDigitErrorFlash(correctSequence, guess) {
    var target = String(correctSequence || "");
    var typed = String(guess || "");
    var maxLen = Math.max(target.length, typed.length);
    var firstWrong = -1;
    for (var i = 0; i < maxLen; i += 1) {
      if ((typed[i] || "") !== (target[i] || "")) {
        firstWrong = i;
        break;
      }
    }
    if (firstWrong < 0) {
      firstWrong = target.length;
    }

    var prefix = typed.slice(0, firstWrong);
    var wrongChar = typed[firstWrong] || "∅";

    var prefixMarkup = prefix.split("").map(function (ch) {
      return '<span class="digit-char ok">' + ch + "</span>";
    }).join("");
    var wrongMarkup = '<span class="digit-char bad">' + wrongChar + "</span>";
    els.digitFeedback.innerHTML =
      '<span class="digit-line digit-correct-label">Correct: ' + target + "</span>" +
      '<span class="digit-line">' + prefixMarkup + wrongMarkup + "</span>";
  }

  function startDigitRound() {
    if (appState.digit.revealTimer) {
      clearTimeout(appState.digit.revealTimer);
      appState.digit.revealTimer = null;
    }
    clearDigitFeedback();

    var level = clamp(appState.cognitive.digitLevel, 3, 14);
    var seq = generateDigits(level);
    appState.digit.current = seq;
    appState.digit.startedAt = performance.now();

    els.digitInput.value = "";
    els.digitInput.disabled = true;
    els.digitSequence.textContent = seq;
    els.digitStatus.textContent = "Memorize the sequence.";
    els.digitStatus.className = "astro-status";

    var revealMs = clamp(720 + level * 130, 1200, 3000);
    appState.digit.revealTimer = setTimeout(function () {
      els.digitSequence.textContent = "*".repeat(seq.length);
      els.digitInput.disabled = false;
      els.digitInput.focus();
      els.digitStatus.textContent = "Now type it and press Check.";
    }, revealMs);
  }

  function checkDigitRound() {
    var guess = String(els.digitInput.value || "").replace(/\D+/g, "");
    var priorLevel = clamp(appState.cognitive.digitLevel, 3, 14);
    if (!appState.digit.current) {
      els.digitStatus.textContent = "Start a sequence first.";
      els.digitStatus.className = "astro-status error";
      return;
    }

    if (!guess) {
      els.digitStatus.textContent = "Type your answer first.";
      els.digitStatus.className = "astro-status error";
      return;
    }

    clearDigitFeedback();
    var score;
    var logEntry;
    var durationSec = appState.digit.startedAt
      ? Math.max(1, (performance.now() - appState.digit.startedAt) / 1000)
      : 0;
    if (guess === appState.digit.current) {
      appState.cognitive.digitLevel = clamp(appState.cognitive.digitLevel + 1, 3, 14);
      appState.cognitive.digitBest = Math.max(appState.cognitive.digitBest, appState.cognitive.digitLevel);
      score = clamp(58 + priorLevel * 4, 40, 100);
      logEntry = logCognitiveActivity("digit-span", score, "correct", {
        durationSec: durationSec,
        level: priorLevel
      });
      renderDigitCorrectFlash(guess);
      els.digitStatus.textContent = "Correct. Next level: " + appState.cognitive.digitLevel + " | +" + logEntry.xpEarned + " XP";
      els.digitStatus.className = "astro-status success";
    } else {
      appState.cognitive.digitLevel = clamp(appState.cognitive.digitLevel - 1, 3, 14);
      score = clamp(34 + priorLevel * 3, 20, 90);
      logEntry = logCognitiveActivity("digit-span", score, "incorrect", {
        durationSec: durationSec,
        level: priorLevel
      });
      renderDigitErrorFlash(appState.digit.current, guess);
      els.digitStatus.textContent = "Not quite. Full correct sequence is shown above. | +" + logEntry.xpEarned + " XP";
      els.digitStatus.className = "astro-status error";
    }
  }

  function visualGridSizeForTiles(tileCount) {
    if (tileCount >= 14) {
      return 7;
    }
    if (tileCount >= 9) {
      return 6;
    }
    if (tileCount >= 6) {
      return 5;
    }
    return 4;
  }

  function getVisualLevelInfo() {
    var tileCount = clamp(Math.round(Number(appState.cognitive.visualLevel) || 5), 5, 18);
    var gridSize = visualGridSizeForTiles(tileCount);
    return {
      tileCount: tileCount,
      gridSize: gridSize
    };
  }

  function createMemoryGrid(gridSize) {
    var size = clamp(Number(gridSize) || 4, 4, 7);
    appState.memory.gridSize = size;
    els.memoryGrid.style.setProperty("--memory-cols", String(size));
    els.memoryGrid.innerHTML = "";
    var total = size * size;
    for (var i = 0; i < total; i += 1) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "memory-cell";
      cell.dataset.index = String(i);
      cell.addEventListener("click", function () {
        if (appState.memory.revealLock) {
          return;
        }
        var index = Number(this.dataset.index);
        if (appState.memory.picks.has(index)) {
          appState.memory.picks.delete(index);
          this.classList.remove("user-picked");
        } else {
          appState.memory.picks.add(index);
          this.classList.add("user-picked");
        }
      });
      els.memoryGrid.appendChild(cell);
    }
  }

  function clearMemoryPicks() {
    appState.memory.picks = new Set();
    Array.from(els.memoryGrid.children).forEach(function (cell) {
      cell.classList.remove("user-picked");
    });
  }

  function showMemoryPattern() {
    if (appState.memory.revealTimer) {
      clearTimeout(appState.memory.revealTimer);
      appState.memory.revealTimer = null;
    }

    clearMemoryPicks();
    appState.memory.revealLock = true;
    appState.memory.startedAt = performance.now();

    var info = getVisualLevelInfo();
    if (appState.memory.gridSize !== info.gridSize) {
      createMemoryGrid(info.gridSize);
    }

    var totalCells = info.gridSize * info.gridSize;
    var allIndices = Array.from({ length: totalCells }, function (_, idx) { return idx; });
    appState.memory.activePattern = sample(allIndices, info.tileCount).sort(function (a, b) { return a - b; });

    Array.from(els.memoryGrid.children).forEach(function (cell) {
      var idx = Number(cell.dataset.index);
      if (appState.memory.activePattern.includes(idx)) {
        cell.classList.add("active");
      }
    });

    els.memoryStatus.textContent =
      "Memorize " + info.tileCount + " tiles on a " + info.gridSize + "x" + info.gridSize + " grid.";
    els.memoryStatus.className = "astro-status";

    var revealMs = clamp(1050 + info.tileCount * 90 + info.gridSize * 70, 1300, 3600);
    appState.memory.revealTimer = setTimeout(function () {
      Array.from(els.memoryGrid.children).forEach(function (cell) {
        cell.classList.remove("active");
      });
      appState.memory.revealLock = false;
      appState.memory.revealTimer = null;
      els.memoryStatus.textContent =
        "Reproduce the pattern and press Submit Pattern. Two misses at this tile level will drop you down.";
    }, revealMs);
  }

  function submitMemoryPattern() {
    if (!appState.memory.activePattern.length) {
      els.memoryStatus.textContent = "Show a pattern first.";
      els.memoryStatus.className = "astro-status error";
      return;
    }

    if (appState.memory.revealLock) {
      els.memoryStatus.textContent = "Wait until reveal is done.";
      els.memoryStatus.className = "astro-status error";
      return;
    }

    var priorLevel = clamp(Math.round(Number(appState.cognitive.visualLevel) || 5), 5, 18);
    var priorGrid = visualGridSizeForTiles(priorLevel);
    var picked = Array.from(appState.memory.picks).sort(function (a, b) { return a - b; });
    var target = appState.memory.activePattern;
    var ok = picked.length === target.length && picked.every(function (val, idx) {
      return val === target[idx];
    });
    var targetSet = new Set(target);
    var hits = picked.filter(function (idx) { return targetSet.has(idx); }).length;
    var precision = target.length ? hits / target.length : 0;
    var durationSec = appState.memory.startedAt
      ? Math.max(1, (performance.now() - appState.memory.startedAt) / 1000)
      : 0;

    var score;
    var logEntry;
    if (ok) {
      appState.cognitive.visualLevel = clamp(priorLevel + 1, 5, 18);
      appState.cognitive.visualBest = Math.max(appState.cognitive.visualBest, appState.cognitive.visualLevel);
      appState.cognitive.visualMistakes = 0;
      score = clamp(52 + priorLevel * 2 + priorGrid * 5, 40, 100);
      logEntry = logCognitiveActivity("visual-pattern", score, "correct", {
        durationSec: durationSec,
        level: priorLevel
      });
      var nextGrid = visualGridSizeForTiles(appState.cognitive.visualLevel);
      els.memoryStatus.textContent =
        "Correct. Next: " + appState.cognitive.visualLevel + " tiles on " + nextGrid + "x" + nextGrid +
        " | +" + logEntry.xpEarned + " XP";
      els.memoryStatus.className = "astro-status success";
    } else {
      appState.cognitive.visualMistakes = clamp((Number(appState.cognitive.visualMistakes) || 0) + 1, 0, 2);
      var demoted = false;
      if (appState.cognitive.visualMistakes >= 2) {
        appState.cognitive.visualLevel = clamp(priorLevel - 1, 5, 18);
        appState.cognitive.visualMistakes = 0;
        demoted = true;
      } else {
        appState.cognitive.visualLevel = priorLevel;
      }
      score = clamp(Math.round(22 + precision * 58 + priorGrid * 3), 15, 92);
      logEntry = logCognitiveActivity("visual-pattern", score, "incorrect", {
        durationSec: durationSec,
        level: priorLevel
      });
      var strikeText = demoted
        ? "Second miss: dropped to " + appState.cognitive.visualLevel + " tiles."
        : "One miss recorded (" + appState.cognitive.visualMistakes + "/2).";
      els.memoryStatus.textContent =
        "Not exact (" + hits + "/" + target.length + " hits). " + strikeText + " | +" + logEntry.xpEarned + " XP";
      els.memoryStatus.className = "astro-status error";
    }
    clearMemoryPicks();
    appState.memory.activePattern = [];
  }

  function concentrationRuleLabel(rule) {
    if (rule === "orientation") {
      return "Match orientation";
    }
    if (rule === "dots") {
      return "Match dot count";
    }
    return "Match color";
  }

  function concentrationRuleDomain(rule) {
    if (rule === "orientation") {
      return CONCENTRATION_ORIENTATIONS;
    }
    if (rule === "dots") {
      return CONCENTRATION_DOTS;
    }
    return CONCENTRATION_COLORS;
  }

  function concentrationPolygonPoints(orientation) {
    if (orientation === "down") {
      return "12,24 108,24 60,106";
    }
    if (orientation === "left") {
      return "16,60 102,14 102,106";
    }
    if (orientation === "right") {
      return "18,14 104,60 18,106";
    }
    return "60,14 108,102 12,102";
  }

  function concentrationDotPattern(count, orientation) {
    var layouts = {
      up: {
        1: [[60, 70]],
        2: [[54, 74], [66, 62]],
        3: [[52, 74], [68, 74], [60, 62]],
        4: [[52, 78], [68, 78], [54, 64], [66, 64]]
      },
      down: {
        1: [[60, 50]],
        2: [[54, 46], [66, 58]],
        3: [[52, 46], [68, 46], [60, 58]],
        4: [[52, 42], [68, 42], [54, 56], [66, 56]]
      },
      left: {
        1: [[52, 60]],
        2: [[56, 52], [56, 68]],
        3: [[58, 50], [58, 70], [72, 60]],
        4: [[60, 48], [60, 72], [74, 54], [74, 66]]
      },
      right: {
        1: [[68, 60]],
        2: [[64, 52], [64, 68]],
        3: [[62, 50], [62, 70], [48, 60]],
        4: [[60, 48], [60, 72], [46, 54], [46, 66]]
      }
    };
    var byOrientation = layouts[orientation] || layouts.up;
    return byOrientation[count] ? byOrientation[count].slice() : [];
  }

  function concentrationColor(colorName) {
    var palette = {
      red: "#e74545",
      green: "#2fb268",
      blue: "#3c6fe8",
      yellow: "#f0c629"
    };
    return palette[colorName] || "#3c6fe8";
  }

  function renderConcentrationTriangle(stimulus) {
    if (!stimulus) {
      els.concTriangle.textContent = "Press Start Round";
      return;
    }
    var points = concentrationPolygonPoints(stimulus.orientation);
    var fill = concentrationColor(stimulus.color);
    var dots = concentrationDotPattern(stimulus.dots, stimulus.orientation);
    var circles = dots.map(function (pair) {
      return '<circle cx="' + pair[0] + '" cy="' + pair[1] + '" r="4.4" fill="#0f1218"></circle>';
    }).join("");
    els.concTriangle.innerHTML =
      '<svg viewBox="0 0 120 120" role="img" aria-label="Triangle stimulus">' +
      '<polygon points="' + points + '" fill="' + fill + '" stroke="#11161f" stroke-width="2"></polygon>' +
      circles +
      "</svg>";
  }

  function randomConcentrationStimulus() {
    return {
      orientation: sample(CONCENTRATION_ORIENTATIONS, 1)[0],
      color: sample(CONCENTRATION_COLORS, 1)[0],
      dots: sample(CONCENTRATION_DOTS, 1)[0]
    };
  }

  function randomDifferent(domain, currentValue) {
    var candidates = domain.filter(function (value) {
      return value !== currentValue;
    });
    return sample(candidates, 1)[0];
  }

  function makeConcentrationStimulus(prevStimulus, topRule, bottomRule, expectedAction) {
    var next = randomConcentrationStimulus();
    if (expectedAction === "top") {
      next[topRule] = prevStimulus[topRule];
      next[bottomRule] = randomDifferent(concentrationRuleDomain(bottomRule), prevStimulus[bottomRule]);
    } else if (expectedAction === "bottom") {
      next[topRule] = randomDifferent(concentrationRuleDomain(topRule), prevStimulus[topRule]);
      next[bottomRule] = prevStimulus[bottomRule];
    } else {
      next[topRule] = randomDifferent(concentrationRuleDomain(topRule), prevStimulus[topRule]);
      next[bottomRule] = randomDifferent(concentrationRuleDomain(bottomRule), prevStimulus[bottomRule]);
    }
    return next;
  }

  function makeConcentrationSequence(roundSize, topRule, bottomRule) {
    var size = Math.max(2, Number(roundSize) || 30);
    var outcomes = ["top", "bottom", "none"];
    var seq = [];
    var first = randomConcentrationStimulus();
    seq.push({
      stimulus: first,
      expectedAction: "none"
    });
    for (var i = 1; i < size; i += 1) {
      var expectedAction = sample(outcomes, 1)[0];
      var next = makeConcentrationStimulus(seq[i - 1].stimulus, topRule, bottomRule, expectedAction);
      seq.push({
        stimulus: next,
        expectedAction: expectedAction
      });
    }
    return seq;
  }

  function concentrationTimeoutForLevel(level) {
    return clamp(4700 - (level - 1) * 240, 2900, 4700);
  }

  function clearConcentrationTimer() {
    if (appState.concentration.timer) {
      clearTimeout(appState.concentration.timer);
      appState.concentration.timer = null;
    }
  }

  function clearConcentrationRuleHideTimer() {
    if (appState.concentration.ruleHideTimer) {
      clearTimeout(appState.concentration.ruleHideTimer);
      appState.concentration.ruleHideTimer = null;
    }
  }

  function clearConcentrationRevealTimer(which) {
    var timerKey = which === "top" ? "revealTopTimer" : "revealBottomTimer";
    if (appState.concentration[timerKey]) {
      clearTimeout(appState.concentration[timerKey]);
      appState.concentration[timerKey] = null;
    }
  }

  function clearConcentrationRevealState() {
    clearConcentrationRevealTimer("top");
    clearConcentrationRevealTimer("bottom");
    appState.concentration.revealTop = false;
    appState.concentration.revealBottom = false;
  }

  function renderConcentrationRuleUI() {
    var topLabel = concentrationRuleLabel(appState.concentration.topRule);
    var bottomLabel = concentrationRuleLabel(appState.concentration.bottomRule);
    var topVisible = !appState.concentration.rulesMasked || appState.concentration.revealTop;
    var bottomVisible = !appState.concentration.rulesMasked || appState.concentration.revealBottom;

    els.concRuleTop.textContent = topVisible ? topLabel : "Hidden";
    els.concRuleBottom.textContent = bottomVisible ? bottomLabel : "Hidden";
    els.concRevealTop.textContent = topVisible && appState.concentration.rulesMasked ? "Hide" : "Reveal";
    els.concRevealBottom.textContent = bottomVisible && appState.concentration.rulesMasked ? "Hide" : "Reveal";
    els.concRevealTop.disabled = !appState.concentration.rulesMasked;
    els.concRevealBottom.disabled = !appState.concentration.rulesMasked;

    if (appState.concentration.rulesMasked) {
      els.concTopBtn.textContent = "Top button";
      els.concBottomBtn.textContent = "Bottom button";
    } else {
      els.concTopBtn.textContent = "Top: " + topLabel;
      els.concBottomBtn.textContent = "Bottom: " + bottomLabel;
    }
    els.concNoneBtn.textContent = "Neither / Next";
  }

  function maskConcentrationRules() {
    clearConcentrationRuleHideTimer();
    clearConcentrationRevealState();
    appState.concentration.rulesMasked = true;
    renderConcentrationRuleUI();
  }

  function showConcentrationRulesForMs(ms) {
    clearConcentrationRuleHideTimer();
    clearConcentrationRevealState();
    appState.concentration.rulesMasked = false;
    renderConcentrationRuleUI();
    var previewMs = clamp(Number(ms) || 10000, 1000, 20000);
    appState.concentration.ruleHideTimer = setTimeout(function () {
      maskConcentrationRules();
    }, previewMs);
  }

  function revealConcentrationRule(which) {
    if (!appState.concentration.rulesMasked) {
      return;
    }
    var key = which === "top" ? "revealTop" : "revealBottom";
    var currentlyVisible = appState.concentration[key];
    if (currentlyVisible) {
      appState.concentration[key] = false;
      clearConcentrationRevealTimer(which);
      renderConcentrationRuleUI();
      return;
    }
    appState.concentration[key] = true;
    clearConcentrationRevealTimer(which);
    renderConcentrationRuleUI();
    var timerKey = which === "top" ? "revealTopTimer" : "revealBottomTimer";
    appState.concentration[timerKey] = setTimeout(function () {
      appState.concentration[key] = false;
      appState.concentration[timerKey] = null;
      renderConcentrationRuleUI();
    }, 4000);
  }

  function generateConcentrationRules() {
    if (appState.concentration.running) {
      return;
    }
    var shuffled = shuffle(CONCENTRATION_TRAITS);
    appState.concentration.topRule = shuffled[0];
    appState.concentration.bottomRule = shuffled[1];
    appState.concentration.rulesConfigured = true;
    showConcentrationRulesForMs(10000);
    els.concStatus.textContent = "New rules generated. They will hide after 10 seconds.";
    els.concStatus.className = "astro-status";
  }

  function setConcentrationButtonsEnabled(enabled) {
    var canRespond = Boolean(enabled) && appState.concentration.running && !appState.concentration.paused;
    var disabled = !canRespond;
    els.concTopBtn.disabled = disabled;
    els.concBottomBtn.disabled = disabled;
    els.concNoneBtn.disabled = disabled;
  }

  function renderConcentrationMeta() {
    var level = clamp(appState.cognitive.concentrationLevel, 1, 8);
    appState.concentration.level = level;
    if (!appState.concentration.running) {
      els.concStartBtn.disabled = false;
      els.concPauseBtn.disabled = true;
      els.concPauseBtn.textContent = "Pause";
      els.concGenerateRules.disabled = false;
      els.concRoundInfo.textContent = "Round: 30 triangles | Level " + level;
      els.concProgress.textContent = "Progress: 0 / 30";
      els.concTime.textContent = "Time left: -";
      renderConcentrationRuleUI();
      renderConcentrationTriangle(null);
      setConcentrationButtonsEnabled(false);
    }
  }

  function scheduleConcentrationTimeout(ms) {
    clearConcentrationTimer();
    var timeoutMs = clamp(Number(ms) || appState.concentration.timeoutMs, 250, 12000);
    appState.concentration.timeRemainingMs = timeoutMs;
    appState.concentration.deadlineAt = performance.now() + timeoutMs;
    els.concTime.textContent = "Time left: " + (timeoutMs / 1000).toFixed(1) + "s";
    appState.concentration.timer = setTimeout(function () {
      if (!appState.concentration.running || appState.concentration.locked || appState.concentration.paused) {
        return;
      }
      appState.concentration.timeouts += 1;
      els.concTime.textContent = "Time left: 0.0s";
      handleConcentrationAction("timeout");
    }, timeoutMs);
  }

  function renderConcentrationStimulus() {
    if (!appState.concentration.running) {
      return;
    }
    if (appState.concentration.paused) {
      return;
    }
    clearConcentrationTimer();

    var idx = appState.concentration.index;
    var total = appState.concentration.sequence.length;
    var item = appState.concentration.sequence[idx];
    if (!item) {
      finishConcentrationRound();
      return;
    }

    renderConcentrationTriangle(item.stimulus);
    els.concProgress.textContent = "Progress: " + (idx + 1) + " / " + total;
    els.concTime.textContent = "Time left: " + (appState.concentration.timeoutMs / 1000).toFixed(1) + "s";
    if (idx === 0) {
      els.concStatus.textContent = "Baseline triangle. Tap Neither / Next to begin comparisons.";
      els.concStatus.className = "astro-status";
    }
    appState.concentration.locked = false;
    setConcentrationButtonsEnabled(true);
    scheduleConcentrationTimeout(appState.concentration.timeoutMs);
  }

  function startConcentrationRound() {
    if (appState.concentration.running) {
      return;
    }
    clearConcentrationTimer();
    if (!appState.concentration.rulesConfigured) {
      var shuffled = shuffle(CONCENTRATION_TRAITS);
      appState.concentration.topRule = shuffled[0];
      appState.concentration.bottomRule = shuffled[1];
      appState.concentration.rulesConfigured = true;
    }
    var level = clamp(appState.cognitive.concentrationLevel, 1, 8);
    appState.concentration.roundSize = 30;
    appState.concentration.timeoutMs = concentrationTimeoutForLevel(level);
    appState.concentration.sequence = makeConcentrationSequence(
      appState.concentration.roundSize,
      appState.concentration.topRule,
      appState.concentration.bottomRule
    );
    appState.concentration.index = 0;
    appState.concentration.correct = 0;
    appState.concentration.wrong = 0;
    appState.concentration.timeouts = 0;
    appState.concentration.running = true;
    appState.concentration.locked = false;
    appState.concentration.paused = false;
    appState.concentration.deadlineAt = 0;
    appState.concentration.timeRemainingMs = appState.concentration.timeoutMs;
    appState.concentration.level = level;
    appState.concentration.roundStartedAt = performance.now();

    showConcentrationRulesForMs(10000);
    els.concRoundInfo.textContent =
      "Round: 30 triangles | Level " + level + " | Respond in " + (appState.concentration.timeoutMs / 1000).toFixed(1) + "s";
    els.concStatus.textContent = "Round live. Compare with the previous triangle and tap the correct rule.";
    els.concStatus.className = "astro-status";
    els.concStartBtn.disabled = true;
    els.concPauseBtn.disabled = false;
    els.concPauseBtn.textContent = "Pause";
    els.concGenerateRules.disabled = true;
    setConcentrationButtonsEnabled(true);

    renderConcentrationStimulus();
  }

  function toggleConcentrationPause() {
    if (!appState.concentration.running) {
      return;
    }
    if (appState.concentration.paused) {
      appState.concentration.paused = false;
      els.concPauseBtn.textContent = "Pause";
      els.concStatus.textContent = "Resumed.";
      els.concStatus.className = "astro-status";
      setConcentrationButtonsEnabled(true);
      scheduleConcentrationTimeout(appState.concentration.timeRemainingMs || appState.concentration.timeoutMs);
      return;
    }

    appState.concentration.paused = true;
    clearConcentrationTimer();
    var remaining = Math.max(120, Math.round(appState.concentration.deadlineAt - performance.now()));
    appState.concentration.timeRemainingMs = remaining;
    els.concPauseBtn.textContent = "Resume";
    els.concTime.textContent = "Paused (" + (remaining / 1000).toFixed(1) + "s left)";
    els.concStatus.textContent = "Paused. Press Resume to continue this triangle.";
    els.concStatus.className = "astro-status";
    setConcentrationButtonsEnabled(false);
  }

  function resetConcentrationRound(mode) {
    clearConcentrationTimer();
    clearConcentrationRuleHideTimer();
    clearConcentrationRevealState();
    appState.concentration.running = false;
    appState.concentration.paused = false;
    appState.concentration.locked = false;
    appState.concentration.deadlineAt = 0;
    appState.concentration.timeRemainingMs = 0;
    appState.concentration.rulesMasked = false;
    appState.concentration.roundStartedAt = 0;
    appState.concentration.sequence = [];
    appState.concentration.index = 0;
    appState.concentration.correct = 0;
    appState.concentration.wrong = 0;
    appState.concentration.timeouts = 0;

    els.concStartBtn.disabled = false;
    els.concPauseBtn.disabled = true;
    els.concPauseBtn.textContent = "Pause";
    els.concGenerateRules.disabled = false;
    els.concProgress.textContent = "Progress: 0 / 30";
    els.concTime.textContent = "Time left: -";
    renderConcentrationTriangle(null);
    setConcentrationButtonsEnabled(false);
    renderConcentrationRuleUI();

    if (mode === "manual") {
      els.concRoundInfo.textContent = "Round reset | Level " + clamp(appState.cognitive.concentrationLevel, 1, 8);
      els.concStatus.textContent = "Round reset. You can generate new rules or start again.";
      els.concStatus.className = "astro-status";
    }
  }

  function finishConcentrationRound() {
    clearConcentrationTimer();
    appState.concentration.running = false;
    appState.concentration.paused = false;
    appState.concentration.locked = false;
    appState.concentration.deadlineAt = 0;
    appState.concentration.timeRemainingMs = 0;
    var roundDurationSec = appState.concentration.roundStartedAt
      ? Math.max(1, (performance.now() - appState.concentration.roundStartedAt) / 1000)
      : 0;
    appState.concentration.roundStartedAt = 0;
    els.concStartBtn.disabled = false;
    els.concPauseBtn.disabled = true;
    els.concPauseBtn.textContent = "Pause";
    els.concGenerateRules.disabled = false;
    setConcentrationButtonsEnabled(false);
    els.concTime.textContent = "Time left: -";
    maskConcentrationRules();

    var total = appState.concentration.sequence.length || appState.concentration.roundSize || 30;
    var correct = appState.concentration.correct;
    var wrong = appState.concentration.wrong;
    var timeouts = appState.concentration.timeouts;
    var accuracy = total ? Math.round((correct / total) * 100) : 0;
    var level = clamp(appState.cognitive.concentrationLevel, 1, 8);
    var score = clamp(Math.round(25 + accuracy * 0.63 + level * 4 - timeouts), 15, 100);
    var detail = correct + "/" + total + " | timeouts " + timeouts;
    var logEntry = logCognitiveActivity("triangle-concentration", score, detail, {
      durationSec: roundDurationSec,
      level: level
    });

    if (accuracy >= 82 && wrong <= Math.floor(total * 0.28)) {
      appState.cognitive.concentrationLevel = clamp(level + 1, 1, 8);
    } else if (accuracy < 55) {
      appState.cognitive.concentrationLevel = clamp(level - 1, 1, 8);
    }
    appState.cognitive.concentrationBest = Math.max(
      appState.cognitive.concentrationBest,
      appState.cognitive.concentrationLevel
    );

    els.concRoundInfo.textContent =
      "Round complete | Level " + appState.cognitive.concentrationLevel + " | Best " + appState.cognitive.concentrationBest;
    els.concStatus.textContent =
      "Accuracy: " + accuracy + "% (" + correct + "/" + total + ") | Timeouts: " + timeouts +
      " | +" + logEntry.xpEarned + " XP";
    els.concStatus.className = accuracy >= 70 ? "astro-status success" : "astro-status error";
  }

  function handleConcentrationAction(action) {
    if (!appState.concentration.running || appState.concentration.locked || appState.concentration.paused) {
      return;
    }
    appState.concentration.locked = true;
    clearConcentrationTimer();

    var idx = appState.concentration.index;
    var item = appState.concentration.sequence[idx];
    if (!item) {
      finishConcentrationRound();
      return;
    }

    var selected = action === "timeout" ? "none" : action;
    var correct = action !== "timeout" && selected === item.expectedAction;
    if (correct) {
      appState.concentration.correct += 1;
    } else {
      appState.concentration.wrong += 1;
    }

    if (action === "timeout") {
      els.concStatus.textContent = "Timed out. Next triangle.";
      els.concStatus.className = "astro-status error";
    } else if (correct) {
      els.concStatus.textContent = "Correct.";
      els.concStatus.className = "astro-status success";
    } else {
      els.concStatus.textContent = "Incorrect.";
      els.concStatus.className = "astro-status error";
    }

    if (idx >= appState.concentration.sequence.length - 1) {
      finishConcentrationRound();
      return;
    }

    appState.concentration.index += 1;
    setTimeout(function () {
      renderConcentrationStimulus();
    }, correct ? 130 : 190);
  }

  function clearReactionTimer() {
    if (appState.reaction.timer) {
      clearTimeout(appState.reaction.timer);
      appState.reaction.timer = null;
    }
  }

  function reactionModeLabel(mode) {
    if (mode === "go-nogo") {
      return "Go/No-Go";
    }
    if (mode === "stroop") {
      return "Text-Color Match";
    }
    return "Baseline";
  }

  function renderReactionModeUI() {
    var mode = appState.reaction.mode || "baseline";
    if (els.reactionModeTabs && els.reactionModeTabs.length) {
      els.reactionModeTabs.forEach(function (tab) {
        var active = tab.getAttribute("data-reaction-mode") === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
    if (els.reactionStart) {
      els.reactionStart.textContent = mode === "baseline" ? "Start Trial" : "Start 10-Round Session";
      els.reactionStart.disabled = appState.reaction.sessionRunning && mode !== "baseline";
    }
    if (els.reactionPause) {
      els.reactionPause.disabled =
        mode === "baseline" ||
        !appState.reaction.sessionRunning ||
        appState.reaction.awaitingSessionResponse;
      els.reactionPause.textContent = appState.reaction.sessionPaused ? "Resume" : "Pause";
    }
    if (els.reactionModeMeta) {
      if (mode === "baseline") {
        els.reactionModeMeta.textContent = "Mode: Baseline | Click only when the panel turns green.";
      } else if (mode === "go-nogo") {
        els.reactionModeMeta.textContent = "Mode: Go/No-Go | Click on GREEN GO, do not click RED NO-GO.";
      } else {
        els.reactionModeMeta.textContent = "Mode: Text-Color Match | Click only when word meaning matches font color.";
      }
    }
    if (els.reactionSessionProgress) {
      if (mode === "baseline") {
        els.reactionSessionProgress.textContent = "Session: baseline single-trial mode";
      } else {
        els.reactionSessionProgress.textContent =
          "Session: " + appState.reaction.sessionIndex + " / " + appState.reaction.sessionRounds;
      }
    }
  }

  function setReactionMode(mode) {
    var allowed = ["baseline", "go-nogo", "stroop"];
    appState.reaction.mode = allowed.indexOf(mode) >= 0 ? mode : "baseline";
    resetReaction();
  }

  function setReactionState(label, className, textColor) {
    els.reactionTarget.textContent = label;
    els.reactionTarget.className = "reaction-target" + (className ? " " + className : "");
    if (typeof textColor === "string" && textColor) {
      els.reactionTarget.style.color = textColor;
    } else {
      els.reactionTarget.style.color = "";
    }
  }

  function resetReaction() {
    clearReactionTimer();
    appState.reaction.waiting = false;
    appState.reaction.ready = false;
    appState.reaction.readyAt = 0;
    appState.reaction.trialStartedAt = 0;
    appState.reaction.interrupted = false;
    appState.reaction.sessionRunning = false;
    appState.reaction.sessionPaused = false;
    appState.reaction.sessionIndex = 0;
    appState.reaction.sessionPlan = [];
    appState.reaction.sessionResults = [];
    appState.reaction.awaitingSessionResponse = false;
    appState.reaction.currentStimulus = "none";
    setReactionState("Press Start", "");
    renderReactionModeUI();
    renderReactionStatus();
  }

  function renderReactionStatus() {
    var runs = appState.cognitive.reactionRuns;
    var audit = qualitySummaryFor(appState.cognitive.reactionAudit);
    if (!runs.length) {
      els.reactionStatus.textContent = "No valid reaction samples yet.";
      els.reactionStatus.className = "astro-status";
      return;
    }

    var avg = Math.round(runs.reduce(function (sum, val) { return sum + val; }, 0) / runs.length);
    var best = Math.min.apply(null, runs);
    var qualityText = audit.total ? " | Quality: " + audit.pct + "% valid" : "";
    els.reactionStatus.textContent = "Average: " + avg + " ms | Best: " + best + " ms" + qualityText;
    els.reactionStatus.className = "astro-status";
  }

  function startReactionBaselineTrial() {
    if (appState.reaction.waiting || appState.reaction.ready || appState.reaction.sessionRunning) {
      return;
    }

    appState.reaction.waiting = true;
    appState.reaction.interrupted = false;
    appState.reaction.trialStartedAt = performance.now();
    setReactionState("Wait for green...", "waiting");

    var delay = 1100 + Math.random() * 2500;
    appState.reaction.timer = setTimeout(function () {
      appState.reaction.waiting = false;
      setReactionState("CLICK NOW", "ready");
      triggerHaptic("ready");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          appState.reaction.ready = true;
          appState.reaction.readyAt = performance.now();
        });
      });
    }, delay);
  }

  function createStroopStimulus(forceShouldClick) {
    var word = sample(STROOP_COLORS, 1)[0];
    var shouldClick = typeof forceShouldClick === "boolean" ? forceShouldClick : Math.random() < 0.6;
    var ink = word;
    if (!shouldClick) {
      var other = STROOP_COLORS.filter(function (item) {
        return item.name !== word.name;
      });
      ink = sample(other, 1)[0];
    }
    return {
      shouldClick: shouldClick,
      label: word.name,
      textColor: ink.hex,
      className: shouldClick ? "ready stroop-match" : "waiting",
      timeoutMs: shouldClick ? 1800 : 1500
    };
  }

  function createGoNoGoStimulus(forceShouldClick) {
    var shouldClick = typeof forceShouldClick === "boolean" ? forceShouldClick : Math.random() < 0.6;
    return {
      shouldClick: shouldClick,
      label: shouldClick ? "GO" : "NO-GO",
      textColor: "",
      className: shouldClick ? "ready" : "nogo",
      timeoutMs: 1500
    };
  }

  function currentReactionStimulus() {
    var forceShouldClick = null;
    var plan = Array.isArray(appState.reaction.sessionPlan) ? appState.reaction.sessionPlan : [];
    if (plan.length && appState.reaction.sessionIndex < plan.length) {
      forceShouldClick = Boolean(plan[appState.reaction.sessionIndex]);
    }
    if (appState.reaction.mode === "stroop") {
      return createStroopStimulus(forceShouldClick);
    }
    return createGoNoGoStimulus(forceShouldClick);
  }

  function finishReactionSession() {
    clearReactionTimer();
    appState.reaction.sessionRunning = false;
    appState.reaction.sessionPaused = false;
    appState.reaction.awaitingSessionResponse = false;
    appState.reaction.sessionPlan = [];
    appState.reaction.ready = false;
    appState.reaction.waiting = false;
    setReactionState("Session done", "");

    var results = appState.reaction.sessionResults.slice();
    var total = results.length;
    if (!total) {
      els.reactionStatus.textContent = "No session rounds recorded.";
      els.reactionStatus.className = "astro-status";
      renderReactionModeUI();
      return;
    }

    var shouldClickItems = results.filter(function (r) { return r.shouldClick; });
    var noClickItems = results.filter(function (r) { return !r.shouldClick; });
    var hits = shouldClickItems.filter(function (r) { return r.correct; }).length;
    var misses = shouldClickItems.length - hits;
    var correctRejects = noClickItems.filter(function (r) { return r.correct; }).length;
    var falseAlarms = noClickItems.length - correctRejects;
    var hitRts = shouldClickItems.filter(function (r) { return r.correct && Number.isFinite(r.rtMs); }).map(function (r) {
      return r.rtMs;
    });
    hitRts.forEach(function (rt) {
      appState.cognitive.reactionRuns.push(rt);
    });
    var meanRt = hitRts.length
      ? Math.round(hitRts.reduce(function (sum, value) { return sum + value; }, 0) / hitRts.length)
      : 900;
    var accuracy = Math.round(((hits + correctRejects) / total) * 100);
    var speedScore = clamp(Math.round(100 - (meanRt - 180) / 5), 20, 100);
    var modeBonus = appState.reaction.mode === "stroop" ? 5 : 2;
    var score = clamp(Math.round(accuracy * 0.72 + speedScore * 0.28 + modeBonus), 12, 100);
    var type = appState.reaction.mode === "stroop" ? "reaction-stroop" : "reaction-go-nogo";
    var sessionDurationSec = Math.max(10, Math.round((performance.now() - appState.reaction.sessionStartedAt) / 1000));
    var logEntry = logCognitiveActivity(
      type,
      score,
      "hits " + hits + "/" + shouldClickItems.length + ", false alarms " + falseAlarms,
      {
        durationSec: sessionDurationSec,
        level: appState.reaction.mode === "stroop" ? 3 : 2
      }
    );
    recordTimingAudit("reaction", true, "session-ok", {
      mode: appState.reaction.mode,
      accuracy: accuracy,
      meanRt: meanRt
    });
    renderReactionStatus();
    els.reactionStatus.textContent =
      reactionModeLabel(appState.reaction.mode) +
      " complete | Accuracy " + accuracy + "% | Mean RT " + meanRt + " ms | +" + logEntry.xpEarned + " XP";
    els.reactionStatus.className = accuracy >= 70 ? "astro-status success" : "astro-status error";
    pulseStatus(els.reactionStatus);
    triggerHaptic(accuracy >= 70 ? "success" : "error");
    renderReactionModeUI();
  }

  function queueReactionSessionRound(delayMs) {
    clearReactionTimer();
    appState.reaction.interrupted = false;
    appState.reaction.waiting = true;
    appState.reaction.ready = false;
    appState.reaction.awaitingSessionResponse = false;
    setReactionState("...", "waiting");
    appState.reaction.timer = setTimeout(function () {
      if (!appState.reaction.sessionRunning || appState.reaction.sessionPaused) {
        return;
      }
      var stimulus = currentReactionStimulus();
      appState.reaction.currentStimulus = stimulus;
      appState.reaction.waiting = false;
      appState.reaction.ready = true;
      appState.reaction.awaitingSessionResponse = true;
      appState.reaction.readyAt = performance.now();
      setReactionState(stimulus.label, stimulus.className, stimulus.textColor);
      if (stimulus.shouldClick) {
        triggerHaptic("ready");
      }
      clearReactionTimer();
      appState.reaction.timer = setTimeout(function () {
        if (!appState.reaction.sessionRunning || appState.reaction.sessionPaused) {
          return;
        }
        if (!appState.reaction.awaitingSessionResponse) {
          return;
        }
        var roundInterrupted = appState.reaction.interrupted;
        appState.reaction.awaitingSessionResponse = false;
        appState.reaction.ready = false;
        if (roundInterrupted) {
          recordTimingAudit("reaction", false, "focus-interrupted", { mode: appState.reaction.mode, via: "timeout" });
        }
        appState.reaction.sessionResults.push({
          shouldClick: stimulus.shouldClick,
          correct: !roundInterrupted && !stimulus.shouldClick,
          rtMs: null
        });
        appState.reaction.sessionIndex += 1;
        if (appState.reaction.sessionIndex >= appState.reaction.sessionRounds) {
          finishReactionSession();
        } else {
          renderReactionModeUI();
          queueReactionSessionRound(340);
        }
      }, stimulus.timeoutMs);
    }, delayMs);
  }

  function startReactionSession() {
    if (appState.reaction.sessionRunning) {
      return;
    }
    appState.reaction.sessionRunning = true;
    appState.reaction.sessionPaused = false;
    appState.reaction.interrupted = false;
    appState.reaction.sessionIndex = 0;
    appState.reaction.sessionRounds = REACTION_SESSION_ROUNDS;
    appState.reaction.sessionResults = [];
    if (appState.reaction.sessionRounds <= 1) {
      appState.reaction.sessionPlan = [true];
    } else {
      var targetCount = Math.round(appState.reaction.sessionRounds * 0.6);
      targetCount = clamp(targetCount, 1, appState.reaction.sessionRounds - 1);
      var nonTargetCount = appState.reaction.sessionRounds - targetCount;
      var plan = [];
      for (var targetIdx = 0; targetIdx < targetCount; targetIdx += 1) {
        plan.push(true);
      }
      for (var nontargetIdx = 0; nontargetIdx < nonTargetCount; nontargetIdx += 1) {
        plan.push(false);
      }
      appState.reaction.sessionPlan = shuffle(plan);
    }
    appState.reaction.sessionStartedAt = performance.now();
    appState.reaction.trialStartedAt = 0;
    appState.reaction.awaitingSessionResponse = false;
    appState.reaction.ready = false;
    appState.reaction.waiting = false;
    renderReactionModeUI();
    els.reactionStatus.textContent = reactionModeLabel(appState.reaction.mode) + " session running.";
    els.reactionStatus.className = "astro-status";
    queueReactionSessionRound(240);
  }

  function toggleReactionPause() {
    if (!appState.reaction.sessionRunning || appState.reaction.mode === "baseline") {
      return;
    }
    if (appState.reaction.awaitingSessionResponse) {
      els.reactionStatus.textContent = "Pause is available between stimuli to avoid skipping active rounds.";
      els.reactionStatus.className = "astro-status";
      pulseStatus(els.reactionStatus);
      return;
    }
    if (appState.reaction.sessionPaused) {
      appState.reaction.sessionPaused = false;
      renderReactionModeUI();
      els.reactionStatus.textContent = "Resumed.";
      els.reactionStatus.className = "astro-status";
      queueReactionSessionRound(220);
      return;
    }
    appState.reaction.sessionPaused = true;
    appState.reaction.ready = false;
    appState.reaction.waiting = false;
    appState.reaction.awaitingSessionResponse = false;
    clearReactionTimer();
    setReactionState("Paused", "waiting");
    els.reactionStatus.textContent = "Paused.";
    els.reactionStatus.className = "astro-status";
    renderReactionModeUI();
  }

  function handleReactionSessionClick(event) {
    if (!appState.reaction.sessionRunning || appState.reaction.sessionPaused) {
      return;
    }
    if (!appState.reaction.awaitingSessionResponse) {
      return;
    }
    var trusted = eventIsTrusted(event);
    if (!trusted) {
      recordTimingAudit("reaction", false, "untrusted-input", { mode: appState.reaction.mode });
      return;
    }
    if (appState.reaction.interrupted) {
      recordTimingAudit("reaction", false, "focus-interrupted", { mode: appState.reaction.mode });
      appState.reaction.awaitingSessionResponse = false;
      appState.reaction.ready = false;
      appState.reaction.sessionResults.push({
        shouldClick: Boolean(appState.reaction.currentStimulus && appState.reaction.currentStimulus.shouldClick),
        correct: false,
        rtMs: null
      });
      appState.reaction.sessionIndex += 1;
      if (appState.reaction.sessionIndex >= appState.reaction.sessionRounds) {
        finishReactionSession();
      } else {
        renderReactionModeUI();
        queueReactionSessionRound(320);
      }
      return;
    }

    var stimulus = appState.reaction.currentStimulus;
    if (!stimulus) {
      return;
    }
    clearReactionTimer();
    appState.reaction.awaitingSessionResponse = false;
    appState.reaction.ready = false;
    var elapsed = Math.round(performance.now() - appState.reaction.readyAt);
    var correct = false;
    if (stimulus.shouldClick) {
      correct = elapsed >= REACTION_MIN_VALID_MS;
    } else {
      correct = false;
    }
    if (stimulus.shouldClick && elapsed < REACTION_MIN_VALID_MS) {
      recordTimingAudit("reaction", false, "too-fast-threshold", { elapsedMs: elapsed, mode: appState.reaction.mode });
    }
    appState.reaction.sessionResults.push({
      shouldClick: stimulus.shouldClick,
      correct: correct,
      rtMs: stimulus.shouldClick ? elapsed : null
    });
    appState.reaction.sessionIndex += 1;
    setReactionState(
      correct ? (elapsed + " ms") : (stimulus.shouldClick ? "Too early" : "False alarm"),
      correct ? "ready" : "too-soon"
    );
    if (appState.reaction.sessionIndex >= appState.reaction.sessionRounds) {
      finishReactionSession();
    } else {
      renderReactionModeUI();
      queueReactionSessionRound(correct ? 260 : 360);
    }
  }

  function startReactionTrial() {
    if (appState.reaction.mode === "baseline") {
      startReactionBaselineTrial();
      return;
    }
    startReactionSession();
  }

  function handleReactionBaselineClick(event) {
    var trusted = eventIsTrusted(event);
    if (appState.reaction.waiting) {
      clearReactionTimer();
      appState.reaction.waiting = false;
      appState.reaction.trialStartedAt = 0;
      setReactionState("Too early", "too-soon");
      els.reactionStatus.textContent = "False start. Wait for green next run.";
      els.reactionStatus.className = "astro-status error";
      pulseStatus(els.reactionStatus);
      triggerHaptic("error");
      recordTimingAudit("reaction", false, "false-start", { trusted: trusted });
      return;
    }

    if (!appState.reaction.ready) {
      return;
    }

    if (!trusted) {
      appState.reaction.ready = false;
      appState.reaction.trialStartedAt = 0;
      setReactionState("Untrusted input", "too-soon");
      els.reactionStatus.textContent = "Quality check: synthetic/untrusted input blocked.";
      els.reactionStatus.className = "astro-status error";
      pulseStatus(els.reactionStatus);
      triggerHaptic("warning");
      recordTimingAudit("reaction", false, "untrusted-input", {});
      return;
    }

    if (appState.reaction.interrupted) {
      appState.reaction.ready = false;
      appState.reaction.trialStartedAt = 0;
      setReactionState("Interrupted", "too-soon");
      els.reactionStatus.textContent = "Quality check: focus changed during trial. Round discarded.";
      els.reactionStatus.className = "astro-status error";
      pulseStatus(els.reactionStatus);
      triggerHaptic("warning");
      recordTimingAudit("reaction", false, "focus-interrupted", {});
      return;
    }

    var elapsed = Math.round(performance.now() - appState.reaction.readyAt);
    appState.reaction.ready = false;
    if (elapsed < REACTION_MIN_VALID_MS) {
      setReactionState(elapsed + " ms", "too-soon");
      els.reactionStatus.textContent =
        "Quality check: " + elapsed + " ms is below valid threshold (" + REACTION_MIN_VALID_MS + " ms).";
      els.reactionStatus.className = "astro-status error";
      pulseStatus(els.reactionStatus);
      triggerHaptic("warning");
      recordTimingAudit("reaction", false, "too-fast-threshold", { elapsedMs: elapsed });
      return;
    }

    setReactionState(elapsed + " ms", "");

    appState.cognitive.reactionRuns.push(elapsed);
    var score = clamp(Math.round(100 - (elapsed - 180) / 6), 15, 100);
    var logEntry = logCognitiveActivity("reaction-time", score, elapsed + "ms", {
      durationSec: appState.reaction.trialStartedAt
        ? Math.max(1, (performance.now() - appState.reaction.trialStartedAt) / 1000)
        : Math.max(1, elapsed / 1000),
      level: 1
    });
    appState.reaction.trialStartedAt = 0;
    recordTimingAudit("reaction", true, "ok", { elapsedMs: elapsed, score: score });
    renderReactionStatus();
    els.reactionStatus.textContent = els.reactionStatus.textContent + " | Last: " + elapsed + " ms | +" + logEntry.xpEarned + " XP";
    els.reactionStatus.className = "astro-status success";
    pulseStatus(els.reactionStatus);
    triggerHaptic("success");
  }

  function handleReactionClick(event) {
    if (appState.reaction.mode === "baseline") {
      handleReactionBaselineClick(event);
      return;
    }
    handleReactionSessionClick(event);
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomCode(length) {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < length; i += 1) {
      out += chars[randomInt(0, chars.length - 1)];
    }
    return out;
  }

  function mutateCodeSimilar(code) {
    var letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    var digits = "23456789";
    var arr = String(code || "").split("");
    if (!arr.length) {
      return code;
    }

    if (Math.random() < 0.55 || arr.length < 2) {
      var idx = randomInt(0, arr.length - 1);
      var src = arr[idx];
      var pool = /\d/.test(src) ? digits : letters;
      var replacement = src;
      while (replacement === src) {
        replacement = pool[randomInt(0, pool.length - 1)];
      }
      arr[idx] = replacement;
    } else {
      var a = randomInt(0, arr.length - 1);
      var b = randomInt(0, arr.length - 1);
      while (b === a) {
        b = randomInt(0, arr.length - 1);
      }
      var tmp = arr[a];
      arr[a] = arr[b];
      arr[b] = tmp;
    }

    var candidate = arr.join("");
    if (candidate === code) {
      return mutateCodeSimilar(code);
    }
    return candidate;
  }

  function disableContainerButtons(container, disabled) {
    if (!container) {
      return;
    }
    Array.from(container.querySelectorAll("button")).forEach(function (btn) {
      btn.disabled = !!disabled;
    });
  }

  function rmsSpeedLabel(factor) {
    var value = Number(factor) || 1.2;
    if (value >= 1.3) {
      return "slower";
    }
    if (value >= 1.1) {
      return "default";
    }
    if (value >= 0.95) {
      return "faster";
    }
    return "very fast";
  }

  function normalizeRmsSpeedFactor(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 1.2;
    }
    return RMS_SPEED_OPTIONS.reduce(function (closest, candidate) {
      if (Math.abs(candidate - numeric) < Math.abs(closest - numeric)) {
        return candidate;
      }
      return closest;
    }, RMS_SPEED_OPTIONS[0]);
  }

  function rmsSpeedOptionValue(factor) {
    if (factor === 1.35) {
      return "1.35";
    }
    if (factor === 1.2) {
      return "1.2";
    }
    if (factor === 1.0) {
      return "1.0";
    }
    return "0.85";
  }

  function renderRmsMeta() {
    var level = clamp(appState.cognitive.rmsLevel, 3, 10);
    var factor = normalizeRmsSpeedFactor(appState.cognitive.rmsSpeedFactor);
    appState.cognitive.rmsSpeedFactor = factor;
    els.rmsMeta.textContent = "Recall length: " + level + " | Best: " + appState.cognitive.rmsBest + " | Speed: " + rmsSpeedLabel(factor);
    if (els.rmsSpeedSelect) {
      els.rmsSpeedSelect.value = rmsSpeedOptionValue(factor);
    }
  }

  function clearRmsTimer() {
    if (appState.rms.timer) {
      clearTimeout(appState.rms.timer);
      appState.rms.timer = null;
    }
  }

  function startRmsRound() {
    clearRmsTimer();
    var level = clamp(appState.cognitive.rmsLevel, 3, 10);
    var streamLength = level + randomInt(2, 5);
    var seq = generateDigits(streamLength).split("");

    appState.rms.sequence = seq;
    appState.rms.target = seq.slice(-level).join("");
    appState.rms.index = 0;
    appState.rms.running = true;
    appState.rms.readyForInput = false;
    appState.rms.startedAt = performance.now();

    els.rmsInput.value = "";
    els.rmsInput.disabled = true;
    els.rmsStream.textContent = "...";
    els.rmsStatus.textContent = "Watch the stream. Recall only the final " + level + " digits.";
    els.rmsStatus.className = "astro-status";
    renderRmsMeta();

    var factor = normalizeRmsSpeedFactor(appState.cognitive.rmsSpeedFactor);
    var stepMs = clamp((680 - level * 42) * factor, 260, 900);
    function tick() {
      if (appState.rms.index >= appState.rms.sequence.length) {
        appState.rms.running = false;
        appState.rms.readyForInput = true;
        els.rmsStream.textContent = "*";
        els.rmsInput.disabled = false;
        els.rmsInput.focus();
        els.rmsStatus.textContent = "Enter the last " + level + " digits and press Check.";
        return;
      }

      els.rmsStream.textContent = appState.rms.sequence[appState.rms.index];
      appState.rms.index += 1;
      appState.rms.timer = setTimeout(tick, stepMs);
    }

    appState.rms.timer = setTimeout(tick, 280);
  }

  function checkRmsRound() {
    if (appState.rms.running) {
      els.rmsStatus.textContent = "Wait for the stream to finish.";
      els.rmsStatus.className = "astro-status error";
      return;
    }

    if (!appState.rms.readyForInput || !appState.rms.target) {
      els.rmsStatus.textContent = "Start a stream first.";
      els.rmsStatus.className = "astro-status error";
      return;
    }

    var guess = String(els.rmsInput.value || "").replace(/\s+/g, "");
    if (!guess) {
      els.rmsStatus.textContent = "Enter your answer before checking.";
      els.rmsStatus.className = "astro-status error";
      return;
    }

    var target = appState.rms.target;
    var priorLevel = clamp(appState.cognitive.rmsLevel, 3, 10);
    var durationSec = appState.rms.startedAt
      ? Math.max(1, (performance.now() - appState.rms.startedAt) / 1000)
      : 0;
    var exact = guess === target;
    var positionalHits = 0;
    for (var i = 0; i < Math.min(guess.length, target.length); i += 1) {
      if (guess[i] === target[i]) {
        positionalHits += 1;
      }
    }
    var hitRatio = target.length ? positionalHits / target.length : 0;

    var score;
    var logEntry;
    if (exact) {
      appState.cognitive.rmsLevel = clamp(appState.cognitive.rmsLevel + 1, 3, 10);
      appState.cognitive.rmsBest = Math.max(appState.cognitive.rmsBest, appState.cognitive.rmsLevel);
      score = clamp(62 + priorLevel * 4, 35, 100);
      logEntry = logCognitiveActivity("running-memory-span", score, "exact", {
        durationSec: durationSec,
        level: priorLevel
      });
      els.rmsStatus.textContent = "Correct. Next level: " + appState.cognitive.rmsLevel + " | +" + logEntry.xpEarned + " XP";
      els.rmsStatus.className = "astro-status success";
    } else {
      appState.cognitive.rmsLevel = clamp(appState.cognitive.rmsLevel - 1, 3, 10);
      score = clamp(25 + Math.round(hitRatio * 45) + priorLevel * 2, 15, 90);
      logEntry = logCognitiveActivity("running-memory-span", score, "partial", {
        durationSec: durationSec,
        level: priorLevel
      });
      els.rmsStatus.textContent = "Not exact. Target: " + target + " | Hits: " + positionalHits + "/" + target.length + " | +" + logEntry.xpEarned + " XP";
      els.rmsStatus.className = "astro-status error";
    }

    appState.rms.readyForInput = false;
    appState.rms.target = "";
    renderRmsMeta();
  }

  function cancelClassicSpeedForModeSwitch() {
    if (!appState.speed.running) {
      return;
    }
    clearSpeedTimer();
    appState.speed.running = false;
    renderSpeedTimer();
    disableContainerButtons(els.speedGrid, true);
    els.speedSubmit.disabled = true;
    els.speedStatus.textContent = "Classic speed round canceled due to drill-mode switch.";
    els.speedStatus.className = "astro-status";
  }

  function cancelPanelSpeedForModeSwitch() {
    if (!(appState.speed2.previewing || appState.speed2.presenting || appState.speed2.challenge)) {
      return;
    }
    resetSpeed2Round(false);
    els.speed2Status.textContent = "Instrument panel round canceled due to drill-mode switch.";
    els.speed2Status.className = "astro-status";
  }

  function renderSpeedModeUI() {
    var mode = sanitizeSpeedMode(appState.progressPrefs.speedMode);
    appState.progressPrefs.speedMode = mode;
    if (els.speedModeTabs && els.speedModeTabs.length) {
      els.speedModeTabs.forEach(function (tab) {
        var active = tab.getAttribute("data-speed-mode") === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
    if (els.speedCard) {
      els.speedCard.hidden = mode !== "classic";
    }
    if (els.speed2Card) {
      els.speed2Card.hidden = mode !== "panel";
    }
  }

  function setSpeedMode(mode) {
    var targetMode = sanitizeSpeedMode(mode);
    if (targetMode === appState.progressPrefs.speedMode) {
      return;
    }
    if (appState.progressPrefs.speedMode === "classic") {
      cancelClassicSpeedForModeSwitch();
    } else {
      cancelPanelSpeedForModeSwitch();
    }
    appState.progressPrefs.speedMode = targetMode;
    renderSpeedModeUI();
    persistState();
  }

  function renderSpeedTimer() {
    if (!appState.speed.running) {
      if (appState.speed.durationMs > 0) {
        els.speedTimer.textContent = "0.0s";
      } else {
        els.speedTimer.textContent = "-";
      }
      return;
    }
    var remainingMs = Math.max(0, appState.speed.deadline - performance.now());
    els.speedTimer.textContent = (remainingMs / 1000).toFixed(1) + "s";
  }

  function clearSpeedTimer() {
    if (appState.speed.timer) {
      clearInterval(appState.speed.timer);
      appState.speed.timer = null;
    }
  }

  function renderSpeedOptions() {
    els.speedGrid.innerHTML = "";
    appState.speed.options.forEach(function (code, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "speed-option";
      btn.textContent = code;
      btn.dataset.index = String(idx);
      btn.disabled = !appState.speed.running;
      btn.addEventListener("click", function (event) {
        if (!appState.speed.running) {
          return;
        }
        if (!eventIsTrusted(event)) {
          appState.speed.submittedTrusted = false;
          return;
        }
        appState.speed.interactionCount += 1;
        if (appState.speed.selected.has(idx)) {
          appState.speed.selected.delete(idx);
          btn.classList.remove("selected");
        } else {
          appState.speed.selected.add(idx);
          btn.classList.add("selected");
        }
      });
      els.speedGrid.appendChild(btn);
    });
  }

  function startSpeedRound() {
    clearSpeedTimer();

    var level = clamp(appState.cognitive.speedLevel, 1, 8);
    var codeLength = clamp(3 + Math.floor(level / 2), 3, 6);
    var optionCount = clamp(6 + level, 6, 12);
    var matchCount = level >= 7 ? 3 : (level >= 4 ? 2 : 1);
    var target = randomCode(codeLength);

    var options = [];
    for (var i = 0; i < matchCount; i += 1) {
      options.push(target);
    }
    while (options.length < optionCount) {
      var candidate = Math.random() < 0.8 ? mutateCodeSimilar(target) : randomCode(codeLength);
      if (candidate !== target) {
        options.push(candidate);
      }
    }

    appState.speed.options = shuffle(options);
    appState.speed.target = target;
    appState.speed.correctIndices = appState.speed.options
      .map(function (value, idx) { return value === target ? idx : -1; })
      .filter(function (idx) { return idx >= 0; });
    appState.speed.selected = new Set();
    appState.speed.durationMs = clamp(19000 - level * 1400, 7000, 19000);
    appState.speed.deadline = performance.now() + appState.speed.durationMs;
    appState.speed.running = true;
    appState.speed.roundStartedAt = performance.now();
    appState.speed.interactionCount = 0;
    appState.speed.interrupted = false;
    appState.speed.submittedTrusted = true;

    els.speedTarget.textContent = target;
    els.speedStatus.textContent = "Select all exact matches. Similar distractors are intentional.";
    els.speedStatus.className = "astro-status";
    els.speedSubmit.disabled = false;
    renderSpeedOptions();
    renderSpeedTimer();

    appState.speed.timer = setInterval(function () {
      renderSpeedTimer();
      if (performance.now() >= appState.speed.deadline) {
        finalizeSpeedRound(true);
      }
    }, 90);
  }

  function finalizeSpeedRound(timedOut) {
    if (!appState.speed.running) {
      return;
    }

    appState.speed.running = false;
    clearSpeedTimer();
    renderSpeedTimer();

    var selected = Array.from(appState.speed.selected).sort(function (a, b) { return a - b; });
    var correct = appState.speed.correctIndices.slice().sort(function (a, b) { return a - b; });

    var selectedSet = new Set(selected);
    var correctSet = new Set(correct);
    var truePos = selected.filter(function (idx) { return correctSet.has(idx); }).length;
    var falsePos = selected.filter(function (idx) { return !correctSet.has(idx); }).length;
    var falseNeg = correct.filter(function (idx) { return !selectedSet.has(idx); }).length;

    var precision = truePos + falsePos > 0 ? truePos / (truePos + falsePos) : 0;
    var recall = truePos + falseNeg > 0 ? truePos / (truePos + falseNeg) : 0;
    var f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    var exact = falsePos === 0 && falseNeg === 0 && truePos === correct.length;
    var remainingMs = Math.max(0, appState.speed.deadline - performance.now());
    var durationMs = Math.max(0, Math.round(performance.now() - appState.speed.roundStartedAt));
    var qualityFlags = [];
    if (appState.speed.interrupted) {
      qualityFlags.push("focus-interrupted");
    }
    if (!appState.speed.submittedTrusted) {
      qualityFlags.push("untrusted-input");
    }
    if (!timedOut && durationMs < SPEED_MIN_VALID_ROUND_MS) {
      qualityFlags.push("too-fast-duration");
    }
    if (!timedOut && appState.speed.interactionCount === 0) {
      qualityFlags.push("no-interaction");
    }

    var invalidQuality = qualityFlags.length > 0;

    Array.from(els.speedGrid.querySelectorAll("button")).forEach(function (btn, idx) {
      var isCorrect = correctSet.has(idx);
      var isSelected = selectedSet.has(idx);
      btn.disabled = true;
      if (isCorrect) {
        btn.classList.add("correct");
      }
      if (isSelected && !isCorrect) {
        btn.classList.add("wrong");
      }
    });

    if (invalidQuality) {
      els.speedSubmit.disabled = true;
      els.speedStatus.textContent =
        "Quality check failed (" + qualityFlags.join(", ") + "). Round discarded from scoring.";
      els.speedStatus.className = "astro-status error";
      pulseStatus(els.speedStatus);
      triggerHaptic("warning");
      recordTimingAudit("speed", false, qualityFlags.join(","), {
        durationMs: durationMs,
        interactionCount: appState.speed.interactionCount
      });
      return;
    }

    var priorLevel = clamp(appState.cognitive.speedLevel, 1, 8);
    if (exact) {
      appState.cognitive.speedLevel = clamp(appState.cognitive.speedLevel + 1, 1, 8);
      appState.cognitive.speedBest = Math.max(appState.cognitive.speedBest, appState.cognitive.speedLevel);
    } else if (f1 < 0.6) {
      appState.cognitive.speedLevel = clamp(appState.cognitive.speedLevel - 1, 1, 8);
    }

    var qualityTier = (durationMs < 1200 || appState.speed.interactionCount < 2) ? "moderate" : "high";
    var score = clamp(Math.round(f1 * 85 + (remainingMs / appState.speed.durationMs) * 15 + (exact ? 8 : 0)), 10, 100);
    var detail =
      "hits " + truePos + "/" + correct.length +
      ", false " + falsePos +
      ", duration " + durationMs + "ms" +
      ", qc " + qualityTier;
    var logEntry = logCognitiveActivity("perceptual-speed", score, detail, {
      durationSec: Math.max(1, durationMs / 1000),
      level: priorLevel
    });
    recordTimingAudit("speed", true, "ok-" + qualityTier, {
      durationMs: durationMs,
      interactionCount: appState.speed.interactionCount,
      score: score
    });
    els.speedSubmit.disabled = true;

    if (exact) {
      els.speedStatus.textContent =
        "Excellent scan. Level " + appState.cognitive.speedLevel +
        " | QC " + qualityTier + " | +" + logEntry.xpEarned + " XP";
      els.speedStatus.className = "astro-status success";
      triggerHaptic("success");
    } else {
      els.speedStatus.textContent =
        (timedOut ? "Time expired. " : "Submitted. ") +
        "Accuracy: " + Math.round(f1 * 100) + "% | Level " + appState.cognitive.speedLevel +
        " | QC " + qualityTier + " | +" + logEntry.xpEarned + " XP";
      els.speedStatus.className = "astro-status error";
      triggerHaptic("error");
    }
    pulseStatus(els.speedStatus);
  }

  function submitSpeedRound(event) {
    appState.speed.submittedTrusted = eventIsTrusted(event);
    finalizeSpeedRound(false);
  }

  function speed2RuleMatches(ruleId, instrument) {
    if (ruleId === "black-color") {
      return instrument.color === "black";
    }
    if (ruleId === "white-color") {
      return instrument.color === "white";
    }
    if (ruleId === "round-shape") {
      return instrument.shape === "round";
    }
    return instrument.shape === "square";
  }

  function speed2PresentationMsForLevel(level) {
    return clamp(
      Math.round(SPEED2_PRESENTATION_BASE_MS - (level - 1) * SPEED2_PRESENTATION_STEP_MS),
      SPEED2_PRESENTATION_MIN_MS,
      SPEED2_PRESENTATION_BASE_MS
    );
  }

  function speed2ValueAngle(value, orientationOffset) {
    var index = (value - 1 - orientationOffset + 80) % 8;
    var deg = -90 + index * 45;
    return (deg * Math.PI) / 180;
  }

  function speed2FormatMs(ms) {
    return (Math.max(0, ms) / 1000).toFixed(1) + "s";
  }

  function speed2CriticalIndices() {
    return sample([0, 1, 2, 3, 4, 5, 6, 7, 8], 4).sort(function (a, b) { return a - b; });
  }

  function makeSpeed2Challenge(level) {
    var lv = clamp(level, 1, 9);
    var rule = sample(SPEED2_RULES, 1)[0];
    var critical = speed2CriticalIndices();
    var criticalSet = new Set(critical);
    var orientationOffset = randomInt(0, 7);
    var visibleCount = lv >= 5 ? 2 : 3;
    var instruments = [];

    for (var i = 0; i < 9; i += 1) {
      var isCritical = criticalSet.has(i);
      var color = sample(["black", "white"], 1)[0];
      var shape = sample(["round", "square"], 1)[0];
      if (rule.id === "black-color") {
        color = isCritical ? "black" : "white";
      } else if (rule.id === "white-color") {
        color = isCritical ? "white" : "black";
      } else if (rule.id === "round-shape") {
        shape = isCritical ? "round" : "square";
      } else {
        shape = isCritical ? "square" : "round";
      }

      instruments.push({
        row: Math.floor(i / 3),
        col: i % 3,
        color: color,
        shape: shape,
        value: randomInt(1, 8),
        visibleValues: sample([1, 2, 3, 4, 5, 6, 7, 8], visibleCount).sort(function (a, b) { return a - b; })
      });
    }

    var orderedCriticalValues = critical.map(function (idx) {
      return String(instruments[idx].value);
    });
    return {
      level: lv,
      ruleId: rule.id,
      ruleLabel: rule.label,
      orientationOffset: orientationOffset,
      criticalIndices: critical,
      instruments: instruments,
      sequence: orderedCriticalValues.join(""),
      sequenceSpaced: orderedCriticalValues.join(" "),
      presentationMs: speed2PresentationMsForLevel(lv)
    };
  }

  function renderSpeed2InstrumentSvg(instrument, orientationOffset) {
    var isBlack = instrument.color === "black";
    var bg = isBlack ? "#07090f" : "#f5f7ff";
    var fg = isBlack ? "#f8fbff" : "#0e1421";
    var outline = isBlack ? "#f2f7ff" : "#101828";
    var outer = instrument.shape === "round"
      ? '<circle cx="50" cy="50" r="44" fill="' + bg + '" stroke="' + outline + '" stroke-width="2"></circle>'
      : '<rect x="7" y="7" width="86" height="86" rx="2" fill="' + bg + '" stroke="' + outline + '" stroke-width="2"></rect>';

    var marks = "";
    for (var value = 1; value <= 8; value += 1) {
      var ang = speed2ValueAngle(value, orientationOffset);
      var cos = Math.cos(ang);
      var sin = Math.sin(ang);
      var textX = 50 + cos * 34;
      var textY = 50 + sin * 34 + 4;
      var tickInX = 50 + cos * 30;
      var tickInY = 50 + sin * 30;
      var tickOutX = 50 + cos * 39;
      var tickOutY = 50 + sin * 39;
      if (instrument.visibleValues.includes(value)) {
        marks += '<text x="' + textX.toFixed(1) + '" y="' + textY.toFixed(1) +
          '" font-size="14" text-anchor="middle" fill="' + fg + '" font-weight="650">' + value + "</text>";
      } else {
        marks += '<line x1="' + tickInX.toFixed(1) + '" y1="' + tickInY.toFixed(1) +
          '" x2="' + tickOutX.toFixed(1) + '" y2="' + tickOutY.toFixed(1) +
          '" stroke="' + fg + '" stroke-width="2.2" stroke-linecap="round"></line>';
      }
    }

    var pointerAngle = speed2ValueAngle(instrument.value, orientationOffset);
    var pointerX = 50 + Math.cos(pointerAngle) * 22;
    var pointerY = 50 + Math.sin(pointerAngle) * 22;
    var pointer = '<line x1="50" y1="50" x2="' + pointerX.toFixed(1) + '" y2="' + pointerY.toFixed(1) +
      '" stroke="' + fg + '" stroke-width="5" stroke-linecap="round"></line>' +
      '<circle cx="50" cy="50" r="4.2" fill="' + fg + '"></circle>';

    return '<svg viewBox="0 0 100 100" role="img" aria-label="Instrument">' + outer + marks + pointer + "</svg>";
  }

  function renderSpeed2Grid(challenge, masked) {
    els.speed2Grid.innerHTML = "";
    if (!challenge || masked) {
      for (var i = 0; i < 9; i += 1) {
        var empty = document.createElement("div");
        empty.className = "speed2-cell masked";
        els.speed2Grid.appendChild(empty);
      }
      return;
    }

    challenge.instruments.forEach(function (instrument) {
      var cell = document.createElement("div");
      cell.className = "speed2-cell";
      cell.innerHTML = renderSpeed2InstrumentSvg(instrument, challenge.orientationOffset);
      els.speed2Grid.appendChild(cell);
    });
  }

  function clearSpeed2Timer() {
    if (appState.speed2.timer) {
      clearInterval(appState.speed2.timer);
      appState.speed2.timer = null;
    }
  }

  function clearSpeed2PreviewTimer() {
    if (appState.speed2.previewTimer) {
      clearTimeout(appState.speed2.previewTimer);
      appState.speed2.previewTimer = null;
    }
  }

  function renderSpeed2Meta(challenge, remainingMs) {
    var active = challenge || appState.speed2.challenge;
    if (!active) {
      els.speed2Rule.textContent = "-";
      els.speed2Time.textContent = "-";
    } else {
      els.speed2Rule.textContent = active.ruleLabel;
      if (appState.speed2.presenting) {
        els.speed2Time.textContent = speed2FormatMs(remainingMs != null ? remainingMs : appState.speed2.remainingMs);
      } else {
        els.speed2Time.textContent = speed2FormatMs(active.presentationMs);
      }
    }
    els.speed2Level.textContent = String(clamp(appState.cognitive.speed2Level, 1, 9));
    els.speed2Best.textContent = String(Math.max(appState.cognitive.speed2Best, appState.cognitive.speed2Level));
  }

  function finishSpeed2Presentation() {
    clearSpeed2Timer();
    clearSpeed2PreviewTimer();
    if (!appState.speed2.challenge) {
      return;
    }

    appState.speed2.previewing = false;
    appState.speed2.presenting = false;
    appState.speed2.paused = false;
    appState.speed2.remainingMs = 0;
    appState.speed2.deadline = 0;
    appState.speed2.answerStartedAt = performance.now();
    appState.speed2.inputKeyCount = 0;
    appState.speed2.checkTrusted = true;

    renderSpeed2Grid(appState.speed2.challenge, true);
    renderSpeed2Meta(appState.speed2.challenge, appState.speed2.challenge.presentationMs);

    els.speed2Start.disabled = false;
    els.speed2Pause.disabled = true;
    els.speed2Pause.textContent = "Pause";
    els.speed2Input.disabled = false;
    els.speed2Input.focus();
    els.speed2Check.disabled = false;
    els.speed2Status.textContent =
      "Enter the 4 memorized values in row order. Rule was " + appState.speed2.challenge.ruleLabel + ".";
    els.speed2Status.className = "astro-status";
  }

  function startSpeed2Ticker() {
    clearSpeed2Timer();
    appState.speed2.timer = setInterval(function () {
      if (!appState.speed2.presenting || appState.speed2.paused) {
        return;
      }
      var remaining = Math.max(0, appState.speed2.deadline - performance.now());
      appState.speed2.remainingMs = remaining;
      renderSpeed2Meta(appState.speed2.challenge, remaining);
      if (remaining <= 0) {
        finishSpeed2Presentation();
      }
    }, 70);
  }

  function beginSpeed2Presentation() {
    var challenge = appState.speed2.challenge;
    if (!challenge) {
      return;
    }

    appState.speed2.previewing = false;
    appState.speed2.presenting = true;
    appState.speed2.paused = false;
    appState.speed2.remainingMs = challenge.presentationMs;
    appState.speed2.deadline = performance.now() + challenge.presentationMs;

    renderSpeed2Grid(challenge, false);
    renderSpeed2Meta(challenge, challenge.presentationMs);

    els.speed2Pause.disabled = false;
    els.speed2Pause.textContent = "Pause";
    els.speed2Status.textContent =
      "Memorize values of " + challenge.ruleLabel + " instruments (exactly 4) in row order.";
    els.speed2Status.className = "astro-status";

    startSpeed2Ticker();
  }

  function startSpeed2Round() {
    clearSpeed2Timer();
    clearSpeed2PreviewTimer();
    var level = clamp(appState.cognitive.speed2Level, 1, 9);
    var challenge = makeSpeed2Challenge(level);
    appState.speed2.challenge = challenge;
    appState.speed2.previewing = true;
    appState.speed2.presenting = false;
    appState.speed2.paused = false;
    appState.speed2.remainingMs = challenge.presentationMs;
    appState.speed2.deadline = 0;
    appState.speed2.answerStartedAt = 0;
    appState.speed2.inputKeyCount = 0;
    appState.speed2.interrupted = false;
    appState.speed2.checkTrusted = true;
    appState.speed2.roundStartedAt = 0;
    appState.speed2.roundStartedAt = performance.now();

    renderSpeed2Grid(null, true);
    renderSpeed2Meta(challenge, challenge.presentationMs);

    els.speed2Input.value = "";
    els.speed2Input.disabled = true;
    els.speed2Check.disabled = true;
    els.speed2Start.disabled = true;
    els.speed2Pause.disabled = true;
    els.speed2Pause.textContent = "Pause";
    els.speed2Status.textContent =
      "Critical rule: " + challenge.ruleLabel + ". Panel starts in " +
      (SPEED2_RULE_PREVIEW_MS / 1000).toFixed(1) + "s.";
    els.speed2Status.className = "astro-status";

    appState.speed2.previewTimer = setTimeout(function () {
      appState.speed2.previewTimer = null;
      beginSpeed2Presentation();
    }, SPEED2_RULE_PREVIEW_MS);
  }

  function toggleSpeed2Pause() {
    if (appState.speed2.previewing) {
      els.speed2Status.textContent = "Rule preview in progress. Pause becomes available when panel appears.";
      els.speed2Status.className = "astro-status";
      return;
    }
    if (!appState.speed2.presenting || !appState.speed2.challenge) {
      return;
    }
    if (appState.speed2.paused) {
      appState.speed2.paused = false;
      appState.speed2.deadline = performance.now() + appState.speed2.remainingMs;
      els.speed2Pause.textContent = "Pause";
      els.speed2Status.textContent = "Resumed. Keep memorizing critical instruments.";
      els.speed2Status.className = "astro-status";
      startSpeed2Ticker();
      return;
    }

    appState.speed2.paused = true;
    appState.speed2.remainingMs = Math.max(0, appState.speed2.deadline - performance.now());
    clearSpeed2Timer();
    els.speed2Pause.textContent = "Resume";
    els.speed2Time.textContent = "Paused (" + speed2FormatMs(appState.speed2.remainingMs) + ")";
    els.speed2Status.textContent = "Paused.";
    els.speed2Status.className = "astro-status";
  }

  function resetSpeed2Round(manual) {
    clearSpeed2Timer();
    clearSpeed2PreviewTimer();
    appState.speed2.challenge = null;
    appState.speed2.previewing = false;
    appState.speed2.presenting = false;
    appState.speed2.paused = false;
    appState.speed2.deadline = 0;
    appState.speed2.remainingMs = 0;
    appState.speed2.answerStartedAt = 0;
    appState.speed2.inputKeyCount = 0;
    appState.speed2.interrupted = false;
    appState.speed2.checkTrusted = true;

    renderSpeed2Grid(null, true);
    renderSpeed2Meta(null, null);

    els.speed2Input.value = "";
    els.speed2Input.disabled = true;
    els.speed2Check.disabled = true;
    els.speed2Start.disabled = false;
    els.speed2Pause.disabled = true;
    els.speed2Pause.textContent = "Pause";
    if (manual) {
      els.speed2Status.textContent = "Panel reset.";
      els.speed2Status.className = "astro-status";
    } else {
      els.speed2Status.textContent = "";
      els.speed2Status.className = "astro-status";
    }
  }

  function checkSpeed2Round(event) {
    appState.speed2.checkTrusted = eventIsTrusted(event);
    if (appState.speed2.previewing) {
      els.speed2Status.textContent = "Wait for panel presentation to begin.";
      els.speed2Status.className = "astro-status error";
      return;
    }
    if (appState.speed2.presenting) {
      els.speed2Status.textContent = "Wait until panel presentation ends.";
      els.speed2Status.className = "astro-status error";
      return;
    }
    if (!appState.speed2.challenge) {
      els.speed2Status.textContent = "Start a panel first.";
      els.speed2Status.className = "astro-status error";
      return;
    }

    var guess = String(els.speed2Input.value || "").replace(/\D+/g, "");
    if (!guess) {
      els.speed2Status.textContent = "Type your 4-digit sequence first.";
      els.speed2Status.className = "astro-status error";
      return;
    }
    if (guess.length !== 4) {
      els.speed2Status.textContent = "Enter exactly 4 digits in row order.";
      els.speed2Status.className = "astro-status error";
      return;
    }

    var challenge = appState.speed2.challenge;
    var answerDurationMs = appState.speed2.answerStartedAt
      ? Math.max(0, Math.round(performance.now() - appState.speed2.answerStartedAt))
      : 0;
    var qualityFlags = [];
    if (!appState.speed2.checkTrusted) {
      qualityFlags.push("untrusted-input");
    }
    if (appState.speed2.interrupted) {
      qualityFlags.push("focus-interrupted");
    }
    if (answerDurationMs > 0 && answerDurationMs < SPEED2_MIN_VALID_ANSWER_MS) {
      qualityFlags.push("too-fast-answer");
    }
    if (appState.speed2.inputKeyCount < 2) {
      qualityFlags.push("insufficient-keystrokes");
    }
    if (qualityFlags.length) {
      recordTimingAudit("speed2", false, qualityFlags.join(","), {
        answerMs: answerDurationMs,
        keyCount: appState.speed2.inputKeyCount
      });
      resetSpeed2Round();
      els.speed2Status.textContent = "Quality check failed (" + qualityFlags.join(", ") + "). Round discarded.";
      els.speed2Status.className = "astro-status error";
      pulseStatus(els.speed2Status);
      triggerHaptic("warning");
      return;
    }

    var target = challenge.sequence;
    var exact = guess === target;
    var priorLevel = clamp(appState.cognitive.speed2Level, 1, 9);

    var firstWrong = -1;
    var maxLen = Math.max(guess.length, target.length);
    for (var i = 0; i < maxLen; i += 1) {
      if ((guess[i] || "") !== (target[i] || "")) {
        firstWrong = i;
        break;
      }
    }
    if (firstWrong < 0) {
      firstWrong = target.length;
    }
    var prefixHits = firstWrong;
    var hitRatio = target.length ? prefixHits / target.length : 0;

    var score;
    if (exact) {
      appState.cognitive.speed2Level = clamp(appState.cognitive.speed2Level + 1, 1, 9);
      appState.cognitive.speed2Best = Math.max(appState.cognitive.speed2Best, appState.cognitive.speed2Level);
      score = clamp(
        Math.round(58 + priorLevel * 4 + (SPEED2_PRESENTATION_BASE_MS - challenge.presentationMs) / 200),
        40,
        100
      );
    } else {
      appState.cognitive.speed2Level = clamp(appState.cognitive.speed2Level - 1, 1, 9);
      score = clamp(Math.round(22 + hitRatio * 55 + priorLevel * 3), 18, 92);
    }

    var detail = challenge.ruleLabel + " | target " + target + " | guess " + guess;
    detail += " | response " + answerDurationMs + "ms";
    var roundDurationSec = appState.speed2.roundStartedAt
      ? Math.max(1, (performance.now() - appState.speed2.roundStartedAt) / 1000)
      : Math.max(1, answerDurationMs / 1000);
    var logEntry = logCognitiveActivity("perceptual-speed-panel", score, detail, {
      durationSec: roundDurationSec,
      level: priorLevel
    });
    recordTimingAudit("speed2", true, "ok", {
      answerMs: answerDurationMs,
      keyCount: appState.speed2.inputKeyCount,
      score: score
    });
    renderSpeed2Grid(null, true);
    renderSpeed2Meta(null, null);
    els.speed2Input.disabled = true;
    els.speed2Check.disabled = true;
    els.speed2Start.disabled = false;
    els.speed2Pause.disabled = true;
    els.speed2Pause.textContent = "Pause";
    appState.speed2.challenge = null;

    if (exact) {
      els.speed2Status.textContent =
        "Correct (" + target + "). Level " + appState.cognitive.speed2Level + " | +" + logEntry.xpEarned + " XP";
      els.speed2Status.className = "astro-status success";
      triggerHaptic("success");
    } else {
      var wrongChar = guess[firstWrong] || "∅";
      els.speed2Status.textContent =
        "Not exact. Correct sequence: " + target + " | First wrong: " + wrongChar +
        " at position " + String(firstWrong + 1) + " | Level " + appState.cognitive.speed2Level +
        " | +" + logEntry.xpEarned + " XP";
      els.speed2Status.className = "astro-status error";
      triggerHaptic("error");
    }
    pulseStatus(els.speed2Status);
  }

  function vecKey(vec) {
    return vec[0] + "," + vec[1] + "," + vec[2];
  }

  function directionFromVector(vec) {
    var key = vecKey(vec);
    return DIRECTION_AXES.find(function (d) {
      return vecKey(d.vec) === key;
    }) || DIRECTION_AXES[0];
  }

  function dotVec(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function startRotationScenario() {
    var level = clamp(appState.cognitive.rotationLevel, 2, 8);
    appState.rotation.startedAt = performance.now();
    var stepCount = clamp(2 + Math.floor(level / 2), 2, 6);
    var start = sample(DIRECTION_AXES, 1)[0];
    var ops = [];
    var vec = start.vec.slice();

    for (var i = 0; i < stepCount; i += 1) {
      var op = ROTATION_OPS[randomInt(0, ROTATION_OPS.length - 1)];
      ops.push(op.label);
      vec = op.apply(vec);
    }

    var finalDirection = directionFromVector(vec);
    var distractors = sample(DIRECTION_AXES.filter(function (d) {
      return d.id !== finalDirection.id;
    }), 3);
    var options = shuffle([finalDirection].concat(distractors));

    appState.rotation.scenario = {
      start: start,
      steps: ops,
      correct: finalDirection,
      options: options
    };
    appState.rotation.answered = false;

    var prompt = "Initial direction: " + start.label + "\n";
    ops.forEach(function (label, idx) {
      prompt += String(idx + 1) + ") " + label + "\n";
    });
    prompt += "Final direction?";
    els.rotPrompt.textContent = prompt;

    els.rotOptions.innerHTML = "";
    options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rot-option";
      btn.textContent = opt.label;
      btn.dataset.id = opt.id;
      btn.addEventListener("click", function () {
        submitRotationAnswer(opt.id);
      });
      els.rotOptions.appendChild(btn);
    });

    els.rotStatus.textContent = "Solve mentally, then choose one option.";
    els.rotStatus.className = "astro-status";
  }

  function submitRotationAnswer(selectedId) {
    if (!appState.rotation.scenario || appState.rotation.answered) {
      return;
    }

    appState.rotation.answered = true;
    var scenario = appState.rotation.scenario;
    var selected = scenario.options.find(function (opt) { return opt.id === selectedId; }) || scenario.options[0];
    var correct = scenario.correct;
    var isCorrect = selected.id === correct.id;

    var priorLevel = clamp(appState.cognitive.rotationLevel, 2, 8);
    var score;
    if (isCorrect) {
      appState.cognitive.rotationLevel = clamp(appState.cognitive.rotationLevel + 1, 2, 8);
      appState.cognitive.rotationBest = Math.max(appState.cognitive.rotationBest, appState.cognitive.rotationLevel);
      score = clamp(66 + priorLevel * 4, 40, 100);
    } else {
      var dot = dotVec(selected.vec, correct.vec);
      var partial = dot === 0 ? 42 : 22;
      appState.cognitive.rotationLevel = clamp(appState.cognitive.rotationLevel - 1, 2, 8);
      score = clamp(partial + priorLevel * 3, 20, 88);
    }

    disableContainerButtons(els.rotOptions, true);
    Array.from(els.rotOptions.querySelectorAll("button")).forEach(function (btn) {
      if (btn.dataset.id === correct.id) {
        btn.classList.add("correct");
      }
      if (btn.dataset.id === selected.id && !isCorrect) {
        btn.classList.add("wrong");
      }
    });

    var durationSec = appState.rotation.startedAt
      ? Math.max(1, (performance.now() - appState.rotation.startedAt) / 1000)
      : 0;
    var logEntry = logCognitiveActivity("spatial-rotation", score, isCorrect ? "correct" : "incorrect", {
      durationSec: durationSec,
      level: priorLevel
    });
    if (isCorrect) {
      els.rotStatus.textContent = "Correct. Level " + appState.cognitive.rotationLevel + " | +" + logEntry.xpEarned + " XP";
      els.rotStatus.className = "astro-status success";
      triggerHaptic("success");
    } else {
      els.rotStatus.textContent = "Not quite. Correct: " + correct.label + " | Level " + appState.cognitive.rotationLevel + " | +" + logEntry.xpEarned + " XP";
      els.rotStatus.className = "astro-status error";
      triggerHaptic("error");
    }
    pulseStatus(els.rotStatus);
  }

  function formatValue(value, decimals) {
    var d = Number(decimals) || 0;
    var factor = Math.pow(10, d);
    var rounded = Math.round(value * factor) / factor;
    if (d === 0) {
      return String(Math.round(rounded));
    }
    return rounded.toFixed(d).replace(/\.?0+$/, "");
  }

  function buildNumericOptions(correctValue, distractorValues, unit, decimals) {
    var unitSuffix = unit ? " " + unit : "";
    var rawPool = [correctValue].concat(distractorValues || []);
    var unique = [];
    var seen = new Set();

    rawPool.forEach(function (value) {
      var key = formatValue(Number(value), decimals);
      if (!Number.isFinite(Number(value))) {
        return;
      }
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(Number(value));
      }
    });

    while (unique.length < 4) {
      var offset = (Math.random() < 0.5 ? -1 : 1) * randomInt(1, 4) * Math.max(1, Math.abs(correctValue) * 0.08);
      var candidate = Math.max(0, correctValue + offset);
      var candidateKey = formatValue(candidate, decimals);
      if (!seen.has(candidateKey)) {
        seen.add(candidateKey);
        unique.push(candidate);
      }
    }

    var trimmed = unique.slice(0, 4);
    var correctText = formatValue(correctValue, decimals) + unitSuffix;
    var options = shuffle(trimmed.map(function (value) {
      return formatValue(value, decimals) + unitSuffix;
    }));

    return {
      options: options,
      correctAnswer: correctText
    };
  }

  function pickMathType(level) {
    var easyPool = ["force", "ohm", "power", "convert", "capacitor-energy", "kinetic"];
    var mediumPool = easyPool.concat(["relative", "orbit", "visviva", "kepler-ratio", "circular-ratio", "escape-ratio"]);
    var hardPool = mediumPool.concat(["mdot", "magnetic-force", "plane-change", "rocket-mass-ratio", "hohmann-dv1", "hohmann-tof", "orbital-energy"]);

    var pool = level <= 2 ? easyPool : (level <= 4 ? mediumPool : hardPool);
    var recent = Array.isArray(appState.math.recentTypes) ? appState.math.recentTypes.slice(-3) : [];
    var candidates = pool.filter(function (typeId) {
      return recent.indexOf(typeId) === -1;
    });
    if (!candidates.length) {
      candidates = pool.slice();
    }

    var picked = candidates[randomInt(0, candidates.length - 1)];
    appState.math.recentTypes = recent.concat([picked]).slice(-3);
    return picked;
  }

  function makeMathQuestion(level) {
    var g0 = 9.81;
    var muEarth = 398600;
    var type = pickMathType(level);

    if (type === "force") {
      var mForce = randomInt(150, 950);
      var aForce = randomInt(2, 8);
      var force = mForce * aForce;
      var forceSet = buildNumericOptions(force, [mForce * (aForce - 1), mForce * (aForce + 1), mForce + aForce], "N", 0);
      return {
        type: type,
        prompt: "A " + mForce + " kg spacecraft accelerates at " + aForce + " m/s^2. Required force?",
        options: forceSet.options,
        correctAnswer: forceSet.correctAnswer
      };
    }

    if (type === "ohm") {
      var resistance = randomInt(3, 24);
      var current = randomInt(2, 10);
      var voltage = resistance * current;
      var ohmSet = buildNumericOptions(voltage, [resistance + current, voltage / 2, voltage + resistance], "V", 0);
      return {
        type: type,
        prompt: "A circuit has I = " + current + " A and R = " + resistance + " ohm. Voltage V = ?",
        options: ohmSet.options,
        correctAnswer: ohmSet.correctAnswer
      };
    }

    if (type === "power") {
      var vPower = randomInt(24, 120);
      var iPower = randomInt(3, 14);
      var power = vPower * iPower;
      var powerSet = buildNumericOptions(power, [vPower + iPower, power / 2, vPower * (iPower + 2)], "W", 0);
      return {
        type: type,
        prompt: "Electrical power with V = " + vPower + " V and I = " + iPower + " A is:",
        options: powerSet.options,
        correctAnswer: powerSet.correctAnswer
      };
    }

    if (type === "convert") {
      var km = randomInt(2, 18);
      var mVal = km * 1000;
      var convSet = buildNumericOptions(mVal, [km * 100, km * 10000, mVal + 500], "m", 0);
      return {
        type: type,
        prompt: "Convert " + km + " km to meters.",
        options: convSet.options,
        correctAnswer: convSet.correctAnswer
      };
    }

    if (type === "capacitor-energy") {
      var cMilliFarad = randomInt(10, 90);
      var cVolt = randomInt(12, 60);
      var capEnergy = 0.5 * (cMilliFarad / 1000) * cVolt * cVolt;
      var capSet = buildNumericOptions(capEnergy, [capEnergy * 2, capEnergy / 2, capEnergy * 1.3], "J", 2);
      return {
        type: type,
        prompt: "Stored capacitor energy E = 0.5*C*V^2. For C = " + cMilliFarad + " mF and V = " + cVolt + " V:",
        options: capSet.options,
        correctAnswer: capSet.correctAnswer
      };
    }

    if (type === "kinetic") {
      var mass = randomInt(150, 800);
      var vel = randomInt(5, 15);
      var kinetic = 0.5 * mass * vel * vel;
      var keSet = buildNumericOptions(kinetic, [mass * vel, kinetic / 2, kinetic * 1.3], "J", 0);
      return {
        type: type,
        prompt: "Kinetic energy for m = " + mass + " kg and v = " + vel + " m/s (E = 0.5*m*v^2):",
        options: keSet.options,
        correctAnswer: keSet.correctAnswer
      };
    }

    if (type === "relative") {
      var v1 = randomInt(2, 9) / 10;
      var v2 = randomInt(2, 9) / 10;
      var rel = v1 + v2;
      var relSet = buildNumericOptions(rel, [Math.abs(v1 - v2), rel + 0.4, Math.max(0.1, rel - 0.2)], "km/s", 2);
      return {
        type: type,
        prompt: "Two satellites approach head-on at " + formatValue(v1, 2) + " km/s and " + formatValue(v2, 2) + " km/s. Relative speed?",
        options: relSet.options,
        correctAnswer: relSet.correctAnswer
      };
    }

    if (type === "orbit") {
      var radius = randomInt(6700, 8200);
      var speed = randomInt(73, 82) / 10;
      var period = (2 * Math.PI * radius) / speed / 60;
      var orbitSet = buildNumericOptions(period, [period * 0.5, period * 1.2, period + 18], "min", 1);
      return {
        type: type,
        prompt: "For circular orbit radius " + radius + " km and speed " + formatValue(speed, 1) + " km/s, period is about:",
        options: orbitSet.options,
        correctAnswer: orbitSet.correctAnswer
      };
    }

    if (type === "visviva") {
      var aVis = randomInt(7600, 16000);
      var rVis = randomInt(6800, Math.floor(1.9 * aVis));
      var vVis = Math.sqrt(muEarth * (2 / rVis - 1 / aVis));
      var vVisSet = buildNumericOptions(vVis, [Math.sqrt(muEarth / rVis), vVis * 0.85, vVis * 1.12], "km/s", 2);
      return {
        type: type,
        prompt: "Vis-viva speed at r = " + rVis + " km for orbit with a = " + aVis + " km around Earth (mu = 398600 km^3/s^2):",
        options: vVisSet.options,
        correctAnswer: vVisSet.correctAnswer
      };
    }

    if (type === "kepler-ratio") {
      var aRatio = randomInt(12, 35) / 10;
      var tRatio = Math.pow(aRatio, 1.5);
      var tRatioSet = buildNumericOptions(tRatio, [Math.sqrt(aRatio), aRatio, Math.pow(aRatio, 2)], "", 3);
      return {
        type: type,
        prompt: "If semi-major axis scales by " + formatValue(aRatio, 1) + "x, what is T2/T1 from Kepler's 3rd law?",
        options: tRatioSet.options,
        correctAnswer: tRatioSet.correctAnswer
      };
    }

    if (type === "circular-ratio") {
      var rScale = [1.5, 2, 2.5, 3][randomInt(0, 3)];
      var vRatio = 1 / Math.sqrt(rScale);
      var vRatioSet = buildNumericOptions(vRatio, [1 / rScale, Math.sqrt(rScale), rScale], "", 3);
      return {
        type: type,
        prompt: "Circular speed scales as v ~ 1/sqrt(r). If r2 = " + formatValue(rScale, 1) + " * r1, what is v2/v1?",
        options: vRatioSet.options,
        correctAnswer: vRatioSet.correctAnswer
      };
    }

    if (type === "escape-ratio") {
      var escRatio = Math.sqrt(2);
      var escSet = buildNumericOptions(escRatio, [1.0, 2.0, 1.2], "", 3);
      return {
        type: type,
        prompt: "At the same radius, what is v_escape / v_circular?",
        options: escSet.options,
        correctAnswer: escSet.correctAnswer
      };
    }

    if (type === "mdot") {
      var thrust = randomInt(25, 120);
      var isp = randomInt(210, 320);
      var mdot = thrust / (isp * g0);
      var mdotSet = buildNumericOptions(mdot, [thrust / isp, thrust / g0, mdot * 2], "kg/s", 3);
      return {
        type: type,
        prompt: "Using mdot = F / (Isp*g0), what is mdot for F = " + thrust + " N and Isp = " + isp + " s?",
        options: mdotSet.options,
        correctAnswer: mdotSet.correctAnswer
      };
    }

    if (type === "magnetic-force") {
      var qMicro = randomInt(20, 120);
      var vMag = randomInt(100, 450);
      var bMilli = randomInt(5, 40);
      var fMilliN = qMicro * 1e-6 * vMag * bMilli * 1e-3 * 1000;
      var magSet = buildNumericOptions(fMilliN, [fMilliN * 2, fMilliN / 2, fMilliN * 1.25], "mN", 3);
      return {
        type: type,
        prompt: "For perpendicular vectors, F = q*v*B. If q = " + qMicro + " microC, v = " + vMag + " m/s, B = " + bMilli + " mT, force is:",
        options: magSet.options,
        correctAnswer: magSet.correctAnswer
      };
    }

    if (type === "plane-change") {
      var vPlane = randomInt(70, 82) / 10;
      var deltaI = randomInt(5, 35);
      var deltaVPlane = 2 * vPlane * Math.sin((deltaI * Math.PI / 180) / 2);
      var planeSet = buildNumericOptions(deltaVPlane, [vPlane * Math.sin(deltaI * Math.PI / 180), deltaVPlane * 0.7, deltaVPlane * 1.3], "km/s", 3);
      return {
        type: type,
        prompt: "Pure plane change at v = " + formatValue(vPlane, 1) + " km/s with Delta i = " + deltaI + " deg needs Delta-v:",
        options: planeSet.options,
        correctAnswer: planeSet.correctAnswer
      };
    }

    if (type === "rocket-mass-ratio") {
      var dvMs = randomInt(900, 3600);
      var ispRocket = randomInt(250, 380);
      var massRatio = Math.exp(dvMs / (ispRocket * g0));
      var ratioSet = buildNumericOptions(massRatio, [massRatio * 0.75, massRatio * 1.25, Math.max(1.05, Math.sqrt(massRatio))], "", 3);
      return {
        type: type,
        prompt: "Tsiolkovsky mass ratio m0/mf for Delta-v = " + dvMs + " m/s and Isp = " + ispRocket + " s:",
        options: ratioSet.options,
        correctAnswer: ratioSet.correctAnswer
      };
    }

    if (type === "hohmann-dv1") {
      var r1 = randomInt(6800, 7300);
      var r2 = randomInt(14000, 36000);
      var dv1 = Math.sqrt(muEarth / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
      var hohmannSet = buildNumericOptions(dv1, [dv1 * 0.8, dv1 * 1.2, Math.sqrt(muEarth / r1) - Math.sqrt(muEarth / r2)], "km/s", 3);
      return {
        type: type,
        prompt: "Hohmann transfer first burn from r1 = " + r1 + " km to r2 = " + r2 + " km (Earth mu = 398600):",
        options: hohmannSet.options,
        correctAnswer: hohmannSet.correctAnswer
      };
    }

    if (type === "hohmann-tof") {
      var rStart = randomInt(6800, 7300);
      var rEnd = randomInt(14000, 42000);
      var aTrans = (rStart + rEnd) / 2;
      var tofMinutes = Math.PI * Math.sqrt(Math.pow(aTrans, 3) / muEarth) / 60;
      var tofSet = buildNumericOptions(tofMinutes, [tofMinutes * 0.5, tofMinutes * 1.25, tofMinutes + 45], "min", 1);
      return {
        type: type,
        prompt: "Approximate Hohmann transfer time from r1 = " + rStart + " km to r2 = " + rEnd + " km:",
        options: tofSet.options,
        correctAnswer: tofSet.correctAnswer
      };
    }

    if (type === "orbital-energy") {
      var aEnergy = randomInt(7000, 42000);
      var energyMagnitude = muEarth / (2 * aEnergy);
      var energySet = buildNumericOptions(energyMagnitude, [energyMagnitude * 0.5, energyMagnitude * 1.5, Math.sqrt(energyMagnitude)], "MJ/kg", 3);
      return {
        type: type,
        prompt: "Magnitude of specific orbital energy |epsilon| = mu/(2a) for a = " + aEnergy + " km around Earth:",
        options: energySet.options,
        correctAnswer: energySet.correctAnswer
      };
    }

    // Fallback
    var fallbackMass = randomInt(150, 800);
    var fallbackVel = randomInt(5, 15);
    var fallbackEnergy = 0.5 * fallbackMass * fallbackVel * fallbackVel;
    var fallbackSet = buildNumericOptions(fallbackEnergy, [fallbackMass * fallbackVel, fallbackEnergy / 2, fallbackEnergy * 1.3], "J", 0);
    return {
      type: "kinetic",
      prompt: "Kinetic energy for m = " + fallbackMass + " kg and v = " + fallbackVel + " m/s (E = 0.5*m*v^2):",
      options: fallbackSet.options,
      correctAnswer: fallbackSet.correctAnswer
    };
  }

  function renderMathQuestion(question) {
    if (!question) {
      els.mathQuestion.textContent = "Press Start Sprint.";
      els.mathOptions.innerHTML = "";
      return;
    }

    els.mathQuestion.textContent = question.prompt;
    els.mathOptions.innerHTML = "";
    question.options.forEach(function (option) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "math-option";
      btn.textContent = option;
      btn.addEventListener("click", function () {
        submitMathAnswer(option);
      });
      els.mathOptions.appendChild(btn);
    });
  }

  function updateMathTimer() {
    if (!appState.math.active) {
      return;
    }
    var remainingMs = Math.max(0, appState.math.endAt - performance.now());
    els.mathTimer.textContent = (remainingMs / 1000).toFixed(1) + "s";
    if (remainingMs <= 0) {
      finishMathSprint("time");
    }
  }

  function queueNextMathQuestion() {
    if (!appState.math.active) {
      return;
    }
    appState.math.question = makeMathQuestion(clamp(appState.cognitive.mathLevel, 1, 8));
    renderMathQuestion(appState.math.question);
  }

  function finishMathSprint(reason) {
    if (!appState.math.active) {
      return;
    }

    appState.math.active = false;
    if (appState.math.timer) {
      clearInterval(appState.math.timer);
      appState.math.timer = null;
    }
    if (appState.math.nextTimer) {
      clearTimeout(appState.math.nextTimer);
      appState.math.nextTimer = null;
    }

    els.mathStart.disabled = false;
    els.mathStop.disabled = true;
    els.mathTimer.textContent = "0.0s";
    disableContainerButtons(els.mathOptions, true);

    if (appState.math.total < 1) {
      els.mathStatus.textContent = reason === "manual"
        ? "Sprint stopped. Start again when ready."
        : "No answers captured. Start another sprint.";
      els.mathStatus.className = "astro-status";
      els.mathQuestion.textContent = "Press Start Sprint.";
      return;
    }

    var accuracy = Math.round((appState.math.correct / appState.math.total) * 100);
    var paceBonus = Math.min(appState.math.total * 2, 18);
    var score = clamp(Math.round(accuracy * 0.82 + paceBonus), 10, 100);

    if (accuracy >= 78 && appState.math.total >= 8) {
      appState.cognitive.mathLevel = clamp(appState.cognitive.mathLevel + 1, 1, 8);
      appState.cognitive.mathBest = Math.max(appState.cognitive.mathBest, appState.cognitive.mathLevel);
    } else if (accuracy < 50 && appState.math.total >= 6) {
      appState.cognitive.mathLevel = clamp(appState.cognitive.mathLevel - 1, 1, 8);
    }

    var detail = appState.math.correct + "/" + appState.math.total + " answered";
    var durationSec = appState.math.startedAt
      ? Math.max(1, (performance.now() - appState.math.startedAt) / 1000)
      : 60;
    var logEntry = logCognitiveActivity("math-physics-sprint", score, detail, {
      durationSec: durationSec,
      level: appState.cognitive.mathLevel
    });
    els.mathStatus.textContent =
      "Sprint complete: " + detail + " (" + accuracy + "%) | Level " + appState.cognitive.mathLevel + " | +" + logEntry.xpEarned + " XP";
    els.mathStatus.className = accuracy >= 70 ? "astro-status success" : "astro-status error";
    els.mathQuestion.textContent = "Sprint complete. Press Start Sprint for a new set.";
  }

  function startMathSprint() {
    if (appState.math.active) {
      return;
    }

    if (appState.math.timer) {
      clearInterval(appState.math.timer);
      appState.math.timer = null;
    }
    if (appState.math.nextTimer) {
      clearTimeout(appState.math.nextTimer);
      appState.math.nextTimer = null;
    }

    appState.math.active = true;
    appState.math.endAt = performance.now() + 60000;
    appState.math.total = 0;
    appState.math.correct = 0;
    appState.math.question = null;
    appState.math.recentTypes = [];
    appState.math.startedAt = performance.now();

    els.mathStart.disabled = true;
    els.mathStop.disabled = false;
    els.mathStatus.textContent = "Sprint running. Tap answer directly; no submit required.";
    els.mathStatus.className = "astro-status";
    queueNextMathQuestion();
    updateMathTimer();

    appState.math.timer = setInterval(updateMathTimer, 90);
  }

  function submitMathAnswer(selectedOption) {
    if (!appState.math.active || !appState.math.question) {
      return;
    }

    if (appState.math.nextTimer) {
      clearTimeout(appState.math.nextTimer);
      appState.math.nextTimer = null;
    }

    var correct = selectedOption === appState.math.question.correctAnswer;
    appState.math.total += 1;
    if (correct) {
      appState.math.correct += 1;
    }

    Array.from(els.mathOptions.querySelectorAll("button")).forEach(function (btn) {
      btn.disabled = true;
      if (btn.textContent === appState.math.question.correctAnswer) {
        btn.classList.add("correct");
      }
      if (btn.textContent === selectedOption && !correct) {
        btn.classList.add("wrong");
      }
    });

    var runningAcc = Math.round((appState.math.correct / appState.math.total) * 100);
    els.mathStatus.textContent = (correct ? "Correct. " : "Incorrect. ") +
      "Running: " + appState.math.correct + "/" + appState.math.total + " (" + runningAcc + "%)";
    els.mathStatus.className = correct ? "astro-status success" : "astro-status error";

    if (performance.now() >= appState.math.endAt) {
      finishMathSprint("time");
      return;
    }

    appState.math.nextTimer = setTimeout(function () {
      queueNextMathQuestion();
    }, correct ? 130 : 210);
  }

  function initCognitive() {
    setupStatusAccessibility();
    ensureSessionState();
    updateSessionPacingNote();
    renderTimingQualitySummary();

    if (els.sessionBreakBtn) {
      els.sessionBreakBtn.addEventListener("click", function () {
        registerSessionBreak();
      });
    }
    if (els.timingQualityReset) {
      els.timingQualityReset.addEventListener("click", function () {
        resetTimingQualityAudits();
        els.timingQualitySummary.textContent = "Timing quality reset. New timing rounds will build fresh validity stats.";
        pulseStatus(els.timingQualitySummary);
      });
    }

    if (!initCognitive._qualityListenersBound) {
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
          markTimingInterruption("hidden");
        }
      });
      window.addEventListener("blur", function () {
        markTimingInterruption("blur");
      });
      initCognitive._qualityListenersBound = true;
    }

    els.digitStart.addEventListener("click", startDigitRound);
    els.digitCheck.addEventListener("click", checkDigitRound);
    els.digitInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        checkDigitRound();
      }
    });

    var visualInfo = getVisualLevelInfo();
    createMemoryGrid(visualInfo.gridSize);
    els.memoryShow.addEventListener("click", showMemoryPattern);
    els.memorySubmit.addEventListener("click", submitMemoryPattern);
    els.memoryReset.addEventListener("click", function () {
      clearMemoryPicks();
      els.memoryStatus.textContent = "Selections reset.";
      els.memoryStatus.className = "astro-status";
    });
    els.memoryStatus.textContent =
      "Level: " + visualInfo.tileCount + " tiles on " + visualInfo.gridSize + "x" + visualInfo.gridSize +
      ". First miss is tolerated; second miss drops a level.";
    els.memoryStatus.className = "astro-status";

    renderConcentrationMeta();
    els.concStartBtn.addEventListener("click", startConcentrationRound);
    els.concPauseBtn.addEventListener("click", toggleConcentrationPause);
    els.concResetBtn.addEventListener("click", function () {
      resetConcentrationRound("manual");
    });
    els.concGenerateRules.addEventListener("click", generateConcentrationRules);
    els.concRevealTop.addEventListener("click", function () {
      revealConcentrationRule("top");
    });
    els.concRevealBottom.addEventListener("click", function () {
      revealConcentrationRule("bottom");
    });
    els.concTopBtn.addEventListener("click", function () {
      handleConcentrationAction("top");
    });
    els.concBottomBtn.addEventListener("click", function () {
      handleConcentrationAction("bottom");
    });
    els.concNoneBtn.addEventListener("click", function () {
      handleConcentrationAction("none");
    });

    els.reactionStart.addEventListener("click", startReactionTrial);
    if (els.reactionPause) {
      els.reactionPause.addEventListener("click", toggleReactionPause);
    }
    els.reactionReset.addEventListener("click", resetReaction);
    if (els.reactionModeTabs && els.reactionModeTabs.length) {
      els.reactionModeTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          setReactionMode(tab.getAttribute("data-reaction-mode"));
        });
      });
    }
    els.reactionTarget.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      handleReactionClick(event);
    });
    els.reactionTarget.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleReactionClick(event);
      }
    });

    renderRmsMeta();
    if (els.rmsSpeedSelect) {
      els.rmsSpeedSelect.addEventListener("change", function () {
        appState.cognitive.rmsSpeedFactor = normalizeRmsSpeedFactor(els.rmsSpeedSelect.value);
        renderRmsMeta();
        persistState();
      });
    }
    if (els.rmsSpeedReset) {
      els.rmsSpeedReset.addEventListener("click", function () {
        appState.cognitive.rmsSpeedFactor = 1.2;
        renderRmsMeta();
        persistState();
      });
    }
    els.rmsStart.addEventListener("click", startRmsRound);
    els.rmsCheck.addEventListener("click", checkRmsRound);
    els.rmsInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        checkRmsRound();
      }
    });

    els.speedStart.addEventListener("click", startSpeedRound);
    els.speedSubmit.addEventListener("click", submitSpeedRound);
    els.speedSubmit.disabled = true;
    renderSpeedTimer();
    if (els.speedModeTabs && els.speedModeTabs.length) {
      els.speedModeTabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          setSpeedMode(tab.getAttribute("data-speed-mode"));
        });
      });
    }
    renderSpeedModeUI();
    els.speed2Start.addEventListener("click", startSpeed2Round);
    els.speed2Pause.addEventListener("click", toggleSpeed2Pause);
    els.speed2Reset.addEventListener("click", function () {
      resetSpeed2Round("manual");
    });
    els.speed2Check.addEventListener("click", checkSpeed2Round);
    els.speed2Input.addEventListener("keydown", function (event) {
      if (eventIsTrusted(event) && /[0-9]/.test(event.key)) {
        appState.speed2.inputKeyCount += 1;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        checkSpeed2Round(event);
      }
    });
    els.speed2Input.addEventListener("paste", function (event) {
      event.preventDefault();
      appState.speed2.checkTrusted = false;
      els.speed2Status.textContent = "Paste is disabled for quality-controlled timing practice.";
      els.speed2Status.className = "astro-status error";
      pulseStatus(els.speed2Status);
      triggerHaptic("warning");
    });
    resetSpeed2Round();

    els.rotStart.addEventListener("click", startRotationScenario);

    els.mathStart.addEventListener("click", startMathSprint);
    els.mathStop.addEventListener("click", function () {
      finishMathSprint("manual");
    });
    els.mathStop.disabled = true;

    renderReactionStatus();
    renderReactionModeUI();
  }

  function renderProfile() {
    var level = Math.floor(appState.profile.xp / 500) + 1;
    els.profileLevel.textContent = "Lv. " + level;
    els.profileXp.textContent = String(appState.profile.xp);
    els.profileStreak.textContent = appState.profile.streak + " day" + (appState.profile.streak === 1 ? "" : "s");
    els.profileQuizCount.textContent = String(appState.profile.quizCount);
  }

  function parseRangeDays(rangeKey) {
    if (rangeKey === "30d") {
      return 30;
    }
    if (rangeKey === "90d") {
      return 90;
    }
    if (rangeKey === "180d") {
      return 180;
    }
    if (rangeKey === "365d") {
      return 365;
    }
    return null;
  }

  function formatRangeLabel(rangeKey) {
    if (rangeKey === "30d") {
      return "Last 30 days";
    }
    if (rangeKey === "90d") {
      return "Last 90 days";
    }
    if (rangeKey === "180d") {
      return "Last 6 months";
    }
    if (rangeKey === "365d") {
      return "Last 12 months";
    }
    return "All time";
  }

  function resolveChartGranularity(preferred, rangeKey, minTs, maxTs) {
    if (preferred && preferred !== "auto") {
      return preferred;
    }
    var rangeDays = parseRangeDays(rangeKey);
    if (rangeDays == null) {
      var spanDays = Math.max(1, Math.round((maxTs - minTs) / 86400000));
      if (spanDays <= 75) {
        return "day";
      }
      if (spanDays <= 420) {
        return "week";
      }
      return "month";
    }
    if (rangeDays <= 75) {
      return "day";
    }
    if (rangeDays <= 420) {
      return "week";
    }
    return "month";
  }

  function bucketStartMs(ts, granularity) {
    var dt = new Date(ts);
    dt.setHours(0, 0, 0, 0);
    if (granularity === "week") {
      var day = (dt.getDay() + 6) % 7;
      dt.setDate(dt.getDate() - day);
    } else if (granularity === "month") {
      dt.setDate(1);
    }
    return dt.getTime();
  }

  function aggregateSeriesByTime(entries, granularity, startMs) {
    var buckets = new Map();
    entries.forEach(function (entry) {
      var ts = parseTimestampMs(entry.timestamp);
      if (ts == null || ts < startMs) {
        return;
      }
      var bucketTs = bucketStartMs(ts, granularity);
      var existing = buckets.get(bucketTs);
      if (existing) {
        existing.sum += clamp(Number(entry.score) || 0, 0, 100);
        existing.count += 1;
      } else {
        buckets.set(bucketTs, {
          ts: bucketTs,
          sum: clamp(Number(entry.score) || 0, 0, 100),
          count: 1
        });
      }
    });

    return Array.from(buckets.values())
      .sort(function (a, b) { return a.ts - b.ts; })
      .map(function (bucket) {
        return {
          ts: bucket.ts,
          score: Math.round(bucket.sum / bucket.count),
          count: bucket.count
        };
      });
  }

  function formatChartTickLabel(ts, granularity) {
    var dt = new Date(ts);
    var opts;
    if (granularity === "day") {
      opts = { month: "short", day: "numeric" };
    } else if (granularity === "week") {
      opts = { month: "short", day: "numeric" };
    } else {
      opts = { month: "short", year: "2-digit" };
    }
    return dt.toLocaleDateString(undefined, opts);
  }

  function drawScoreSeries(ctx, pad, w, h, series, color, minTs, maxTs) {
    if (!series.length) {
      return;
    }
    var span = Math.max(1, maxTs - minTs);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach(function (point, idx) {
      var x = pad.left + ((point.ts - minTs) / span) * w;
      var y = pad.top + (1 - clamp(point.score, 0, 100) / 100) * h;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    if (series.length > 1) {
      ctx.stroke();
    }

    ctx.fillStyle = color;
    series.forEach(function (point) {
      var x = pad.left + ((point.ts - minTs) / span) * w;
      var y = pad.top + (1 - clamp(point.score, 0, 100) / 100) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawChart(attempts, drillLogs) {
    var canvas = els.progressChart;
    if (!canvas) {
      return null;
    }

    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.width;
    canvas.width = Math.max(320, Math.floor(parentWidth - 10));
    canvas.height = 260;

    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pad = { left: 40, right: 16, top: 20, bottom: 42 };
    var w = canvas.width - pad.left - pad.right;
    var h = canvas.height - pad.top - pad.bottom;

    var quizRaw = attempts.map(function (entry) {
      return {
        timestamp: entry.timestamp,
        score: clamp(Number(entry.score) || 0, 0, 100)
      };
    }).filter(function (entry) {
      return parseTimestampMs(entry.timestamp) != null;
    });
    var drillRaw = drillLogs.map(function (entry) {
      return {
        timestamp: entry.timestamp,
        score: clamp(Number(entry.score) || 0, 0, 100)
      };
    }).filter(function (entry) {
      return parseTimestampMs(entry.timestamp) != null;
    });

    var allRaw = quizRaw.concat(drillRaw);
    if (!allRaw.length) {
      ctx.fillStyle = "rgba(120, 140, 170, 0.9)";
      ctx.font = "14px sans-serif";
      ctx.fillText("No activity recorded yet.", pad.left + 12, pad.top + h / 2);
      return {
        hasData: false,
        rangeLabel: formatRangeLabel(appState.progressPrefs.range),
        granularity: "day",
        quizPoints: 0,
        drillPoints: 0
      };
    }

    var allTs = allRaw.map(function (entry) { return parseTimestampMs(entry.timestamp) || 0; });
    var minAllTs = Math.min.apply(null, allTs);
    var maxAllTs = Math.max.apply(null, allTs);
    var nowMs = Date.now();
    var rangeDays = parseRangeDays(appState.progressPrefs.range);
    var windowEnd = rangeDays == null ? maxAllTs : nowMs;
    var windowStart = rangeDays == null ? minAllTs : windowEnd - rangeDays * 86400000;
    var granularity = resolveChartGranularity(
      appState.progressPrefs.granularity,
      appState.progressPrefs.range,
      windowStart,
      windowEnd
    );
    var quizSeries = aggregateSeriesByTime(quizRaw, granularity, windowStart);
    var drillSeries = aggregateSeriesByTime(drillRaw, granularity, windowStart);

    ctx.strokeStyle = "rgba(120, 140, 170, 0.45)";
    ctx.lineWidth = 1;
    for (var y = 0; y <= 5; y += 1) {
      var yy = pad.top + (h * y) / 5;
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(canvas.width - pad.right, yy);
      ctx.stroke();

      var labelVal = 100 - y * 20;
      ctx.fillStyle = "rgba(120, 140, 170, 0.92)";
      ctx.font = "11px sans-serif";
      ctx.fillText(String(labelVal), 8, yy + 4);
    }
    ctx.fillStyle = "rgba(120, 140, 170, 0.96)";
    ctx.font = "11px sans-serif";
    ctx.fillText("Score (%)", pad.left, 13);

    if (!quizSeries.length && !drillSeries.length) {
      ctx.fillStyle = "rgba(120, 140, 170, 0.9)";
      ctx.font = "14px sans-serif";
      ctx.fillText("No activity in selected window.", pad.left + 12, pad.top + h / 2);
      return {
        hasData: true,
        rangeLabel: formatRangeLabel(appState.progressPrefs.range),
        granularity: granularity,
        quizPoints: 0,
        drillPoints: 0
      };
    }

    var plotMinTs = rangeDays == null ? minAllTs : windowStart;
    var plotMaxTs = rangeDays == null ? maxAllTs : windowEnd;
    if (plotMaxTs <= plotMinTs) {
      plotMaxTs = plotMinTs + 86400000;
    }

    var xTicks = 5;
    for (var tick = 0; tick <= xTicks; tick += 1) {
      var ratio = tick / xTicks;
      var xx = pad.left + ratio * w;
      var tickTs = plotMinTs + ratio * (plotMaxTs - plotMinTs);
      ctx.strokeStyle = "rgba(120, 140, 170, 0.2)";
      ctx.beginPath();
      ctx.moveTo(xx, pad.top);
      ctx.lineTo(xx, pad.top + h);
      ctx.stroke();
      var tickLabel = formatChartTickLabel(tickTs, granularity);
      ctx.fillStyle = "rgba(120, 140, 170, 0.92)";
      ctx.font = "11px sans-serif";
      var textWidth = ctx.measureText(tickLabel).width;
      ctx.fillText(tickLabel, clamp(xx - textWidth / 2, pad.left, pad.left + w - textWidth), pad.top + h + 16);
    }
    ctx.fillStyle = "rgba(120, 140, 170, 0.96)";
    ctx.font = "11px sans-serif";
    ctx.fillText("Time", canvas.width - pad.right - 28, canvas.height - 26);

    drawScoreSeries(ctx, pad, w, h, quizSeries, "#2f8cff", plotMinTs, plotMaxTs);
    drawScoreSeries(ctx, pad, w, h, drillSeries, "#8c5cff", plotMinTs, plotMaxTs);

    ctx.font = "12px sans-serif";
    var legendY = canvas.height - 10;
    var legendX = pad.left;

    if (quizSeries.length) {
      ctx.fillStyle = "#2f8cff";
      ctx.beginPath();
      ctx.rect(legendX, legendY - 9, 10, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(100, 120, 150, 0.95)";
      ctx.fillText("Quiz", legendX + 15, legendY);
      legendX += 62;
    }

    if (drillSeries.length) {
      ctx.fillStyle = "#8c5cff";
      ctx.beginPath();
      ctx.rect(legendX, legendY - 9, 10, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(100, 120, 150, 0.95)";
      ctx.fillText("Cognitive", legendX + 15, legendY);
    }

    return {
      hasData: true,
      rangeLabel: formatRangeLabel(appState.progressPrefs.range),
      granularity: granularity,
      quizPoints: quizSeries.reduce(function (sum, point) { return sum + (point.count || 0); }, 0),
      drillPoints: drillSeries.reduce(function (sum, point) { return sum + (point.count || 0); }, 0)
    };
  }

  function formatAttemptDate(iso) {
    var dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) {
      return "-";
    }
    return dt.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatQuizModeLabel(mode) {
    if (mode === "random-all") {
      return "quiz:random-all";
    }
    if (mode === "adaptive-weak") {
      return "quiz:adaptive";
    }
    if (mode === "random-topic") {
      return "quiz:random-topic";
    }
    if (mode === "series-topic") {
      return "quiz:series-topic";
    }
    return String(mode || "quiz");
  }

  function renderTopicMastery(topicStats) {
    if (!els.topicMasteryList) {
      return;
    }
    els.topicMasteryList.innerHTML = "";
    if (!topicStats.length) {
      var empty = document.createElement("p");
      empty.className = "topic-mastery-empty";
      empty.textContent = "No mastery data available yet.";
      els.topicMasteryList.appendChild(empty);
      return;
    }

    topicStats.forEach(function (topic) {
      var item = document.createElement("article");
      item.className = "topic-mastery-item";

      var head = document.createElement("div");
      head.className = "topic-mastery-head";

      var title = document.createElement("span");
      title.className = "topic-mastery-title";
      title.textContent = topic.topicName;

      var metrics = document.createElement("span");
      metrics.className = "topic-mastery-metrics";
      metrics.textContent = topic.mastery + "% mastery | " + topic.coverage + "% coverage";

      head.appendChild(title);
      head.appendChild(metrics);
      item.appendChild(head);

      var bar = document.createElement("div");
      bar.className = "topic-mastery-bar";
      var fill = document.createElement("span");
      fill.className = "topic-mastery-fill";
      fill.style.width = clamp(topic.mastery, 0, 100) + "%";
      bar.appendChild(fill);
      item.appendChild(bar);

      var meta = document.createElement("div");
      meta.className = "topic-mastery-meta";
      var accuracyText = topic.rawAccuracy == null ? "No answer-level accuracy yet." : (topic.rawAccuracy + "% answer accuracy.");
      meta.textContent = topic.reviewNeeded + " cards need review out of " + topic.totalCards + ". " + accuracyText;
      item.appendChild(meta);

      els.topicMasteryList.appendChild(item);
    });
  }

  function renderProgress() {
    refreshQuestionStatsFromAttempts();

    var attempts = appState.attempts;
    var drillLogs = Array.isArray(appState.cognitive.drillLogs) ? appState.cognitive.drillLogs : [];
    var topicMastery = computeTopicMasteryStats();
    var totalCards = appState.allCards.length;
    var seenCards = topicMastery.reduce(function (sum, topic) { return sum + topic.seenCards; }, 0);
    var reviewCards = topicMastery.reduce(function (sum, topic) { return sum + topic.reviewNeeded; }, 0);
    var total = attempts.length;
    var avg = total
      ? Math.round(attempts.reduce(function (sum, a) { return sum + (Number(a.score) || 0); }, 0) / total)
      : 0;
    var best = total
      ? Math.max.apply(null, attempts.map(function (a) { return Number(a.score) || 0; }))
      : 0;
    var totalQuestions = attempts.reduce(function (sum, a) { return sum + (Number(a.total) || 0); }, 0);

    els.progressAverage.textContent = avg + "%";
    els.progressBest.textContent = best + "%";
    els.progressQuestions.textContent = String(totalQuestions);
    els.progressCognitiveCount.textContent = String(drillLogs.length);
    els.progressCognitiveAverage.textContent = drillLogs.length
      ? Math.round(drillLogs.reduce(function (sum, entry) { return sum + (Number(entry.score) || 0); }, 0) / drillLogs.length) + "%"
      : "0%";
    if (els.progressMasteryCoverage) {
      els.progressMasteryCoverage.textContent = totalCards
        ? Math.round((seenCards / totalCards) * 100) + "%"
        : "0%";
    }
    if (els.progressNeedsReview) {
      els.progressNeedsReview.textContent = String(reviewCards);
    }

    var lastQuizTs = getLatestTimestamp(attempts);
    var lastDrillTs = getLatestTimestamp(drillLogs);
    var lastAnyTs = Math.max(lastQuizTs || 0, lastDrillTs || 0);
    els.progressLast.textContent = lastAnyTs ? formatAttemptDate(new Date(lastAnyTs).toISOString()) : "Never";

    var chartMeta = drawChart(attempts, drillLogs);
    if (els.progressSummary) {
      if (!chartMeta || !chartMeta.hasData) {
        els.progressSummary.textContent = "Chart tracks quiz scores (blue) and cognitive drill scores (purple).";
      } else {
        var granularityLabel = chartMeta.granularity.charAt(0).toUpperCase() + chartMeta.granularity.slice(1);
        els.progressSummary.textContent =
          chartMeta.rangeLabel +
          " | " +
          granularityLabel +
          " trend | " +
          chartMeta.quizPoints +
          " quiz entries + " +
          chartMeta.drillPoints +
          " cognitive entries. Mastery view is derived from answer-level quiz logs.";
      }
    }

    renderTopicMastery(topicMastery);
    if (els.masteryFocus) {
      if (!topicMastery.length || topicMastery[0].seenCards === 0) {
        els.masteryFocus.textContent =
          "Take one full quiz first to unlock stronger adaptive recommendations and mastery tracking.";
      } else {
        var focus = topicMastery[0];
        els.masteryFocus.textContent =
          "Focus next on " + focus.topicName + ": " + focus.mastery + "% mastery, " +
          focus.reviewNeeded + " cards still need review.";
      }
    }
    renderQuizRecommendation();

    els.historyBody.innerHTML = "";
    var combinedAll = attempts.map(function (attempt) {
      return {
        timestamp: attempt.timestamp,
        mode: formatQuizModeLabel(attempt.mode),
        topicName: attempt.topicName,
        scoreText: attempt.score + "%",
        resultText: attempt.correct + " / " + attempt.total
      };
    }).concat(drillLogs.map(function (entry) {
      return {
        timestamp: entry.timestamp,
        mode: "drill:" + entry.type,
        topicName: "Cognitive",
        scoreText: (Number(entry.score) || 0) + "%",
        resultText: entry.detail || "-"
      };
    })).sort(function (a, b) {
      return (parseTimestampMs(b.timestamp) || 0) - (parseTimestampMs(a.timestamp) || 0);
    });

    var historyLimit = parseHistoryLimit(appState.progressPrefs.historyLimit);
    var combined = historyLimit == null ? combinedAll : combinedAll.slice(0, historyLimit);

    combined.forEach(function (row) {
      var tr = document.createElement("tr");
      var tds = [
        formatAttemptDate(row.timestamp),
        row.mode,
        row.topicName,
        row.scoreText,
        row.resultText
      ];
      tds.forEach(function (txt) {
        var td = document.createElement("td");
        td.textContent = txt;
        tr.appendChild(td);
      });
      els.historyBody.appendChild(tr);
    });

    if (els.historyOverview) {
      var earliestTs = combinedAll.length ? parseTimestampMs(combinedAll[combinedAll.length - 1].timestamp) : null;
      var latestTs = combinedAll.length ? parseTimestampMs(combinedAll[0].timestamp) : null;
      var windowText = (earliestTs && latestTs)
        ? (formatAttemptDate(new Date(earliestTs).toISOString()) + " -> " + formatAttemptDate(new Date(latestTs).toISOString()))
        : "No records yet";
      var shownLabel = historyLimit == null ? "all rows" : ("latest " + historyLimit + " rows");
      els.historyOverview.textContent =
        "Stored records: " +
        combinedAll.length +
        " total (" +
        attempts.length +
        " quiz + " +
        drillLogs.length +
        " drills). Showing " +
        shownLabel +
        ". Range: " +
        windowText +
        ".";
    }

    els.badgeRow.innerHTML = "";
    if (!appState.profile.badges.length) {
      var muted = document.createElement("span");
      muted.className = "badge-chip";
      muted.textContent = "No badges yet";
      els.badgeRow.appendChild(muted);
    } else {
      appState.profile.badges.forEach(function (badgeId) {
        var info = badgeInfoById(badgeId);
        if (!info) {
          return;
        }
        var chip = document.createElement("span");
        chip.className = "badge-chip";
        chip.textContent = info.icon + " " + info.label;
        els.badgeRow.appendChild(chip);
      });
    }
  }

  function setProgressSyncStatus(message, type) {
    if (!els.progressSyncStatus) {
      return;
    }
    var fallback = "Tip: all practice history is stored on this device. Export JSON on one device and Import + Merge on another to combine offline phone and desktop sessions.";
    els.progressSyncStatus.textContent = message || fallback;
    els.progressSyncStatus.classList.remove("success", "error");
    if (type) {
      els.progressSyncStatus.classList.add(type);
    }
  }

  function mergeProgressPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid JSON structure.");
    }

    var incomingAttempts = dedupeHistoryById(
      (Array.isArray(payload.attempts) ? payload.attempts : [])
        .map(normalizeAttemptEntry)
        .filter(Boolean)
    );

    var incomingCognitive = payload.cognitive && typeof payload.cognitive === "object" ? payload.cognitive : {};
    var incomingDrills = dedupeHistoryById(
      (Array.isArray(incomingCognitive.drillLogs) ? incomingCognitive.drillLogs : [])
        .map(normalizeDrillLogEntry)
        .filter(Boolean)
    );

    var incomingReactionRuns = Array.isArray(incomingCognitive.reactionRuns)
      ? incomingCognitive.reactionRuns.map(function (value) {
        return Math.round(Number(value) || 0);
      }).filter(function (value) {
        return Number.isFinite(value) && value >= REACTION_MIN_VALID_MS && value <= 3000;
      })
      : [];
    var incomingReactionAudit = Array.isArray(incomingCognitive.reactionAudit)
      ? incomingCognitive.reactionAudit.filter(function (entry) {
        return entry && typeof entry === "object";
      })
      : [];
    var incomingSpeedAudit = Array.isArray(incomingCognitive.speedAudit)
      ? incomingCognitive.speedAudit.filter(function (entry) {
        return entry && typeof entry === "object";
      })
      : [];
    var incomingSpeed2Audit = Array.isArray(incomingCognitive.speed2Audit)
      ? incomingCognitive.speed2Audit.filter(function (entry) {
        return entry && typeof entry === "object";
      })
      : [];

    var attemptsBefore = appState.attempts.length;
    var drillsBefore = appState.cognitive.drillLogs.length;

    appState.attempts = dedupeHistoryById(appState.attempts.concat(incomingAttempts));
    appState.cognitive.drillLogs = dedupeHistoryById(appState.cognitive.drillLogs.concat(incomingDrills));
    appState.cognitive.reactionRuns = appState.cognitive.reactionRuns.concat(incomingReactionRuns).filter(function (value) {
      return Number.isFinite(value) && value >= REACTION_MIN_VALID_MS && value <= 3000;
    });
    appState.cognitive.reactionAudit = appState.cognitive.reactionAudit.concat(incomingReactionAudit).slice(-200);
    appState.cognitive.speedAudit = appState.cognitive.speedAudit.concat(incomingSpeedAudit).slice(-200);
    appState.cognitive.speed2Audit = appState.cognitive.speed2Audit.concat(incomingSpeed2Audit).slice(-200);

    appState.cognitive.digitLevel = Math.max(appState.cognitive.digitLevel, Number(incomingCognitive.digitLevel) || 0);
    appState.cognitive.digitBest = Math.max(appState.cognitive.digitBest, Number(incomingCognitive.digitBest) || 0, appState.cognitive.digitLevel);
    appState.cognitive.visualLevel = clamp(
      Math.max(
        appState.cognitive.visualLevel,
        Number(incomingCognitive.visualLevel) || 0,
        Number(incomingCognitive.visualTiles) || 0
      ),
      5,
      18
    );
    appState.cognitive.visualBest = clamp(
      Math.max(appState.cognitive.visualBest, Number(incomingCognitive.visualBest) || 0, appState.cognitive.visualLevel),
      5,
      18
    );
    appState.cognitive.rmsLevel = Math.max(appState.cognitive.rmsLevel, Number(incomingCognitive.rmsLevel) || 0);
    appState.cognitive.rmsBest = Math.max(appState.cognitive.rmsBest, Number(incomingCognitive.rmsBest) || 0, appState.cognitive.rmsLevel);
    appState.cognitive.speedLevel = Math.max(appState.cognitive.speedLevel, Number(incomingCognitive.speedLevel) || 0);
    appState.cognitive.speedBest = Math.max(appState.cognitive.speedBest, Number(incomingCognitive.speedBest) || 0, appState.cognitive.speedLevel);
    appState.cognitive.speed2Level = Math.max(appState.cognitive.speed2Level, Number(incomingCognitive.speed2Level) || 0);
    appState.cognitive.speed2Best = Math.max(appState.cognitive.speed2Best, Number(incomingCognitive.speed2Best) || 0, appState.cognitive.speed2Level);
    appState.cognitive.rotationLevel = Math.max(appState.cognitive.rotationLevel, Number(incomingCognitive.rotationLevel) || 0);
    appState.cognitive.rotationBest = Math.max(appState.cognitive.rotationBest, Number(incomingCognitive.rotationBest) || 0, appState.cognitive.rotationLevel);
    appState.cognitive.mathLevel = Math.max(appState.cognitive.mathLevel, Number(incomingCognitive.mathLevel) || 0);
    appState.cognitive.mathBest = Math.max(appState.cognitive.mathBest, Number(incomingCognitive.mathBest) || 0, appState.cognitive.mathLevel);
    appState.cognitive.concentrationLevel = clamp(
      Math.max(appState.cognitive.concentrationLevel, Number(incomingCognitive.concentrationLevel) || 0),
      1,
      8
    );
    appState.cognitive.concentrationBest = Math.max(
      appState.cognitive.concentrationBest,
      clamp(Number(incomingCognitive.concentrationBest) || appState.cognitive.concentrationLevel, 1, 8),
      appState.cognitive.concentrationLevel
    );

    refreshQuestionStatsFromAttempts();
    recalculateProfileFromHistory();
    refreshBadges();
    persistState();
    renderProfile();
    renderProgress();

    return {
      addedAttempts: appState.attempts.length - attemptsBefore,
      addedDrills: appState.cognitive.drillLogs.length - drillsBefore
    };
  }

  function initProgressActions() {
    if (els.progressRange) {
      els.progressRange.value = appState.progressPrefs.range;
      els.progressRange.addEventListener("change", function () {
        appState.progressPrefs.range = sanitizeProgressRange(els.progressRange.value);
        persistState();
        renderProgress();
      });
    }

    if (els.progressGranularity) {
      els.progressGranularity.value = appState.progressPrefs.granularity;
      els.progressGranularity.addEventListener("change", function () {
        appState.progressPrefs.granularity = sanitizeProgressGranularity(els.progressGranularity.value);
        persistState();
        renderProgress();
      });
    }

    if (els.historyLimit) {
      els.historyLimit.value = sanitizeHistoryLimit(appState.progressPrefs.historyLimit);
      els.historyLimit.addEventListener("change", function () {
        appState.progressPrefs.historyLimit = sanitizeHistoryLimit(els.historyLimit.value);
        persistState();
        renderProgress();
      });
    }

    setProgressSyncStatus("");
    populateLeaderboardControls();
    setLeaderboardStatus("");
    renderLeaderboardList(normalizeLeaderboardRows(appState.leaderboardCache.rows));

    if (els.leaderboardSave) {
      els.leaderboardSave.addEventListener("click", function () {
        if (!canUseRemoteLeaderboard()) {
          setLeaderboardStatus("Sign in with a Supabase-backed account to save leaderboard settings.", "error");
          return;
        }
        var displayName = String((els.leaderboardDisplayName && els.leaderboardDisplayName.value) || "").trim().slice(0, 40);
        if (!displayName) {
          setLeaderboardStatus("Display name is required to save leaderboard settings.", "error");
          return;
        }
        appState.leaderboard.displayName = displayName;
        appState.leaderboard.optIn = Boolean(els.leaderboardOptIn && els.leaderboardOptIn.checked);
        persistState();
        syncLeaderboardNow("settings-save").then(function (ok) {
          if (ok) {
            refreshLeaderboardList();
          }
        });
      });
    }

    if (els.leaderboardRefresh) {
      els.leaderboardRefresh.addEventListener("click", function () {
        refreshLeaderboardList();
      });
    }

    els.exportHistory.addEventListener("click", function () {
      var payload = {
        exportedAt: new Date().toISOString(),
        installationId: appState.installationId,
        progressPrefs: appState.progressPrefs,
        profile: appState.profile,
        attempts: appState.attempts,
        cognitive: appState.cognitive,
        dataVersion: window.ASTRO_TRAINING_DATA && window.ASTRO_TRAINING_DATA.version
      };

      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "astronaut-training-progress.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setProgressSyncStatus("Export complete. Save this JSON and import it on your other device to merge progress.", "success");
    });

    if (els.importHistory && els.importHistoryFile) {
      els.importHistory.addEventListener("click", function () {
        els.importHistoryFile.click();
      });
      els.importHistoryFile.addEventListener("change", function (event) {
        var file = event.target.files && event.target.files[0];
        if (!file) {
          return;
        }
        file.text().then(function (text) {
          var payload = JSON.parse(text);
          var summary = mergeProgressPayload(payload);
          setProgressSyncStatus(
            "Merged " + summary.addedAttempts + " quiz attempt(s) and " + summary.addedDrills + " cognitive drill record(s).",
            "success"
          );
        }).catch(function (err) {
          console.error(err);
          setProgressSyncStatus("Import failed. Please use a valid astronaut-training progress JSON file.", "error");
        }).finally(function () {
          els.importHistoryFile.value = "";
        });
      });
    }

    els.clearHistory.addEventListener("click", function () {
      var confirmed = window.confirm("Clear all local training history and reset XP? This cannot be undone.");
      if (!confirmed) {
        return;
      }

      clearRmsTimer();
      clearSpeedTimer();
      clearSpeed2Timer();
      clearSpeed2PreviewTimer();
      clearDigitFeedback();
      if (appState.math.timer) {
        clearInterval(appState.math.timer);
      }
      if (appState.math.nextTimer) {
        clearTimeout(appState.math.nextTimer);
      }
      if (appState.memory.revealTimer) {
        clearTimeout(appState.memory.revealTimer);
      }
      clearConcentrationTimer();
      clearConcentrationRuleHideTimer();
      clearConcentrationRevealState();

      appState.profile = {
        xp: 0,
        streak: 0,
        quizCount: 0,
        lastPracticeDate: null,
        badges: []
      };
      appState.attempts = [];
      appState.questionStats = {};
      appState.session = {
        startedAt: Date.now(),
        lastBreakAt: Date.now(),
        drillsSinceBreak: 0,
        totalDrills: 0
      };
      appState.cognitive = {
        digitLevel: 4,
        digitBest: 4,
        visualLevel: 5,
        visualBest: 5,
        visualMistakes: 0,
        rmsLevel: 3,
        rmsBest: 3,
        rmsSpeedFactor: 1.2,
        speedLevel: 1,
        speedBest: 1,
        speed2Level: 1,
        speed2Best: 1,
        rotationLevel: 2,
        rotationBest: 2,
        mathLevel: 1,
        mathBest: 1,
        concentrationLevel: 1,
        concentrationBest: 1,
        reactionRuns: [],
        reactionAudit: [],
        speedAudit: [],
        speed2Audit: [],
        drillLogs: []
      };
      appState.digit = {
        current: "",
        revealTimer: null,
        feedbackTimer: null,
        startedAt: 0
      };
      appState.memory = {
        activePattern: [],
        picks: new Set(),
        revealLock: false,
        revealTimer: null,
        gridSize: 4,
        startedAt: 0
      };
      appState.reaction = {
        timer: null,
        waiting: false,
        ready: false,
        readyAt: 0,
        trialStartedAt: 0,
        interrupted: false,
        mode: "baseline",
        sessionRunning: false,
        sessionPaused: false,
        sessionIndex: 0,
        sessionRounds: REACTION_SESSION_ROUNDS,
        sessionPlan: [],
        sessionResults: [],
        currentStimulus: "none",
        awaitingSessionResponse: false
      };
      appState.rms = {
        sequence: [],
        target: "",
        index: 0,
        timer: null,
        running: false,
        readyForInput: false,
        startedAt: 0
      };
      appState.speed = {
        timer: null,
        target: "",
        options: [],
        correctIndices: [],
        selected: new Set(),
        deadline: 0,
        durationMs: 0,
        running: false,
        roundStartedAt: 0,
        interactionCount: 0,
        interrupted: false,
        submittedTrusted: true
      };
      appState.speed2 = {
        timer: null,
        previewTimer: null,
        challenge: null,
        previewing: false,
        presenting: false,
        paused: false,
        deadline: 0,
        remainingMs: 0,
        answerStartedAt: 0,
        inputKeyCount: 0,
        interrupted: false,
        checkTrusted: true,
        roundStartedAt: 0
      };
      appState.rotation = {
        scenario: null,
        answered: false,
        startedAt: 0
      };
      appState.math = {
        timer: null,
        nextTimer: null,
        active: false,
        endAt: 0,
        total: 0,
        correct: 0,
        question: null,
        recentTypes: [],
        startedAt: 0
      };
      appState.concentration = {
        running: false,
        timer: null,
        level: 1,
        roundSize: 30,
        timeoutMs: 4500,
        topRule: "color",
        bottomRule: "orientation",
        rulesConfigured: false,
        sequence: [],
        index: 0,
        correct: 0,
        wrong: 0,
        timeouts: 0,
        locked: false,
        paused: false,
        deadlineAt: 0,
        timeRemainingMs: 0,
        rulesMasked: false,
        ruleHideTimer: null,
        revealTop: false,
        revealBottom: false,
        revealTopTimer: null,
        revealBottomTimer: null,
        roundStartedAt: 0
      };

      resetReaction();
      clearMemoryPicks();
      els.memoryStatus.textContent = "Progress reset.";
      els.memoryStatus.className = "astro-status";
      createMemoryGrid(4);
      renderConcentrationMeta();
      els.concStatus.textContent = "Progress reset.";
      els.concStatus.className = "astro-status";

      persistState();
      renderProfile();
      renderProgress();
      renderReactionStatus();
      els.digitStatus.textContent = "Progress reset.";
      els.digitStatus.className = "astro-status";
      els.digitSequence.textContent = "";
      els.digitInput.value = "";
      els.digitInput.disabled = false;
      els.rmsStream.textContent = "-";
      els.rmsInput.value = "";
      els.rmsInput.disabled = false;
      els.rmsStatus.textContent = "Progress reset.";
      els.rmsStatus.className = "astro-status";
      renderRmsMeta();

      els.speedTarget.textContent = "-";
      els.speedTimer.textContent = "-";
      els.speedGrid.innerHTML = "";
      els.speedStatus.textContent = "Progress reset.";
      els.speedStatus.className = "astro-status";
      els.speedSubmit.disabled = true;
      resetSpeed2Round();
      els.speed2Status.textContent = "Progress reset.";
      els.speed2Status.className = "astro-status";

      els.rotPrompt.textContent = "Press New Scenario to begin.";
      els.rotOptions.innerHTML = "";
      els.rotStatus.textContent = "Progress reset.";
      els.rotStatus.className = "astro-status";

      els.mathTimer.textContent = "60.0s";
      els.mathQuestion.textContent = "Press Start Sprint.";
      els.mathOptions.innerHTML = "";
      els.mathStart.disabled = false;
      els.mathStop.disabled = true;
      els.mathStatus.textContent = "Progress reset.";
      els.mathStatus.className = "astro-status";
      updateSessionPacingNote("Session reset. Start a fresh focused block.");
      renderTimingQualitySummary();
      setProgressSyncStatus("");
    });
  }

  function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== "function") {
      return;
    }
    navigator.storage.persist().catch(function () {
      // Silent fallback for browsers that do not grant persistence.
    });
  }

  function initializeTrainingUI() {
    loadData();
    restoreState();
    requestPersistentStorage();
    ensureSessionState();

    initTabs();
    populateTopicInputs();
    renderFolders();

    appState.flashOrder = els.flashOrderSelect.value;
    prepareFlashDeck();

    initFlashcards();
    initQuiz();
    initCognitive();
    initProgressActions();

    refreshBadges();
    renderProfile();
    renderProgress();

    window.addEventListener("resize", function () {
      if (!document.getElementById("panel-progress").hidden) {
        drawChart(appState.attempts, appState.cognitive.drillLogs || []);
      }
    });
  }

  function init() {
    bindElements();
    initGate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
