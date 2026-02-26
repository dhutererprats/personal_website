(function () {
  var PASSCODE = "astroD";
  var EMAIL_REPORTS_ENABLED = false;

  var STORE_KEYS = {
    unlocked: "astro_training_unlocked_v1",
    profile: "astro_training_profile_v1",
    attempts: "astro_training_attempts_v1",
    cognitive: "astro_training_cognitive_v1"
  };

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
    attempts: [],
    cognitive: {
      digitLevel: 4,
      digitBest: 4,
      visualLevel: 3,
      visualBest: 3,
      rmsLevel: 3,
      rmsBest: 3,
      rmsSpeedFactor: 1.2,
      speedLevel: 1,
      speedBest: 1,
      rotationLevel: 2,
      rotationBest: 2,
      mathLevel: 1,
      mathBest: 1,
      reactionRuns: [],
      drillLogs: []
    },
    digit: {
      current: "",
      revealTimer: null
    },
    memory: {
      activePattern: [],
      picks: new Set(),
      revealLock: false
    },
    reaction: {
      timer: null,
      waiting: false,
      ready: false,
      readyAt: 0
    },
    rms: {
      sequence: [],
      target: "",
      index: 0,
      timer: null,
      running: false,
      readyForInput: false
    },
    speed: {
      timer: null,
      target: "",
      options: [],
      correctIndices: [],
      selected: new Set(),
      deadline: 0,
      durationMs: 0,
      running: false
    },
    rotation: {
      scenario: null,
      answered: false
    },
    math: {
      timer: null,
      nextTimer: null,
      active: false,
      endAt: 0,
      total: 0,
      correct: 0,
      question: null,
      recentTypes: []
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

  function bindElements() {
    els.gate = byId("training-gate");
    els.app = byId("training-app");
    els.gateForm = byId("gate-form");
    els.gatePassword = byId("gate-password");
    els.gateStatus = byId("gate-status");
    els.gateClear = byId("gate-clear");

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
    els.quizSubmit = byId("quiz-submit");
    els.quizNext = byId("quiz-next");
    els.quizResult = byId("quiz-result");
    els.quizScoreTitle = byId("quiz-score-title");
    els.quizScoreText = byId("quiz-score-text");
    els.quizRestart = byId("quiz-restart");
    els.quizReview = byId("quiz-review");

    els.digitSequence = byId("digit-sequence");
    els.digitInput = byId("digit-input");
    els.digitStart = byId("digit-start");
    els.digitCheck = byId("digit-check");
    els.digitStatus = byId("digit-status");

    els.memoryGrid = byId("memory-grid");
    els.memoryShow = byId("memory-show");
    els.memorySubmit = byId("memory-submit");
    els.memoryReset = byId("memory-reset");
    els.memoryStatus = byId("memory-status");

    els.reactionTarget = byId("reaction-target");
    els.reactionStart = byId("reaction-start");
    els.reactionReset = byId("reaction-reset");
    els.reactionStatus = byId("reaction-status");

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

    els.progressAverage = byId("progress-average");
    els.progressBest = byId("progress-best");
    els.progressQuestions = byId("progress-questions");
    els.progressLast = byId("progress-last");
    els.progressCognitiveCount = byId("progress-cognitive-count");
    els.progressCognitiveAverage = byId("progress-cognitive-average");
    els.progressChart = byId("progress-chart");
    els.badgeRow = byId("badge-row");
    els.historyBody = byId("history-body");
    els.exportHistory = byId("export-history");
    els.clearHistory = byId("clear-history");

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
    var profileRaw = safeRead(STORE_KEYS.profile, null);
    if (profileRaw && typeof profileRaw === "object") {
      appState.profile.xp = Number(profileRaw.xp) || 0;
      appState.profile.streak = Number(profileRaw.streak) || 0;
      appState.profile.quizCount = Number(profileRaw.quizCount) || 0;
      appState.profile.lastPracticeDate = profileRaw.lastPracticeDate || null;
      appState.profile.badges = Array.isArray(profileRaw.badges) ? profileRaw.badges : [];
    }

    var attemptsRaw = safeRead(STORE_KEYS.attempts, []);
    appState.attempts = Array.isArray(attemptsRaw) ? attemptsRaw : [];

    var cogRaw = safeRead(STORE_KEYS.cognitive, null);
    if (cogRaw && typeof cogRaw === "object") {
      appState.cognitive.digitLevel = Number(cogRaw.digitLevel) || 4;
      appState.cognitive.digitBest = Number(cogRaw.digitBest) || appState.cognitive.digitLevel;
      appState.cognitive.visualLevel = Number(cogRaw.visualLevel) || 3;
      appState.cognitive.visualBest = Number(cogRaw.visualBest) || appState.cognitive.visualLevel;
      appState.cognitive.rmsLevel = Number(cogRaw.rmsLevel) || 3;
      appState.cognitive.rmsBest = Number(cogRaw.rmsBest) || appState.cognitive.rmsLevel;
      appState.cognitive.rmsSpeedFactor = normalizeRmsSpeedFactor(cogRaw.rmsSpeedFactor);
      appState.cognitive.speedLevel = Number(cogRaw.speedLevel) || 1;
      appState.cognitive.speedBest = Number(cogRaw.speedBest) || appState.cognitive.speedLevel;
      appState.cognitive.rotationLevel = Number(cogRaw.rotationLevel) || 2;
      appState.cognitive.rotationBest = Number(cogRaw.rotationBest) || appState.cognitive.rotationLevel;
      appState.cognitive.mathLevel = Number(cogRaw.mathLevel) || 1;
      appState.cognitive.mathBest = Number(cogRaw.mathBest) || appState.cognitive.mathLevel;
      appState.cognitive.reactionRuns = Array.isArray(cogRaw.reactionRuns) ? cogRaw.reactionRuns.slice(-20) : [];
      appState.cognitive.drillLogs = Array.isArray(cogRaw.drillLogs) ? cogRaw.drillLogs.slice(-400) : [];
    }
  }

  function persistState() {
    safeWrite(STORE_KEYS.profile, appState.profile);
    safeWrite(STORE_KEYS.attempts, appState.attempts);
    safeWrite(STORE_KEYS.cognitive, appState.cognitive);
  }

  function showGateStatus(message, type) {
    els.gateStatus.textContent = message || "";
    els.gateStatus.classList.remove("error", "success");
    if (type) {
      els.gateStatus.classList.add(type);
    }
  }

  function unlockApp() {
    sessionStorage.setItem(STORE_KEYS.unlocked, "1");
    els.gate.hidden = true;
    els.app.hidden = false;
    try {
      initializeTrainingUI();
    } catch (err) {
      console.error(err);
      sessionStorage.removeItem(STORE_KEYS.unlocked);
      els.app.hidden = true;
      els.gate.hidden = false;
      showGateStatus("Unable to initialize training app.", "error");
    }
  }

  function initGate() {
    var alreadyUnlocked = sessionStorage.getItem(STORE_KEYS.unlocked) === "1";
    if (alreadyUnlocked) {
      unlockApp();
      return;
    }

    els.gateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var inputValue = String(els.gatePassword.value || "").trim();
      if (inputValue === PASSCODE) {
        showGateStatus("Access granted.", "success");
        unlockApp();
      } else {
        showGateStatus("Passcode incorrect.", "error");
      }
    });

    els.gateClear.addEventListener("click", function () {
      els.gatePassword.value = "";
      showGateStatus("");
      els.gatePassword.focus();
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
    els.quizTopic.disabled = mode === "random-all";
  }

  function buildQuestion(card, mode) {
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
    var mode = els.quizMode.value;
    var count = clamp(Number(els.quizCount.value) || 20, 5, 100);
    var selectedTopicId = els.quizTopic.value || appState.currentTopicId;

    var pool = [];
    if (mode === "random-all") {
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
      question: question.prompt,
      topicName: question.topicName,
      selected: selectedAnswer,
      correctAnswer: question.correctAnswer,
      correct: correct
    });

    els.quizSubmit.disabled = true;
    els.quizNext.disabled = false;
    els.quizProgress.textContent = correct ? "Correct." : "Incorrect.";
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

  function xpFromCognitiveScore(score) {
    return clamp(Math.round(score / 7), 3, 14);
  }

  function logCognitiveActivity(type, score, detail) {
    var boundedScore = clamp(Math.round(score), 0, 100);
    var xpEarned = xpFromCognitiveScore(boundedScore);
    var entry = {
      timestamp: new Date().toISOString(),
      type: type,
      score: boundedScore,
      detail: detail || "",
      xpEarned: xpEarned
    };

    appState.cognitive.drillLogs.push(entry);
    appState.cognitive.drillLogs = appState.cognitive.drillLogs.slice(-400);
    appState.profile.xp += xpEarned;
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
      timestamp: new Date().toISOString(),
      mode: modeLabel,
      topicId: quiz.mode === "random-all" ? "all" : quiz.topicId,
      topicName: quiz.mode === "random-all"
        ? "All topics"
        : (appState.topics.find(function (topic) { return topic.id === quiz.topicId; }) || { name: "Unknown" }).name,
      total: total,
      correct: correct,
      score: score,
      xpEarned: xpEarned
    };

    appState.attempts.push(attempt);
    appState.attempts = appState.attempts.slice(-250);

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

  function startDigitRound() {
    if (appState.digit.revealTimer) {
      clearTimeout(appState.digit.revealTimer);
      appState.digit.revealTimer = null;
    }

    var level = clamp(appState.cognitive.digitLevel, 3, 14);
    var seq = generateDigits(level);
    appState.digit.current = seq;

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
    var guess = String(els.digitInput.value || "").replace(/\s+/g, "");
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

    var score;
    var logEntry;
    if (guess === appState.digit.current) {
      appState.cognitive.digitLevel = clamp(appState.cognitive.digitLevel + 1, 3, 14);
      appState.cognitive.digitBest = Math.max(appState.cognitive.digitBest, appState.cognitive.digitLevel);
      score = clamp(58 + priorLevel * 4, 40, 100);
      logEntry = logCognitiveActivity("digit-span", score, "correct");
      els.digitStatus.textContent = "Correct. Next level: " + appState.cognitive.digitLevel + " | +" + logEntry.xpEarned + " XP";
      els.digitStatus.className = "astro-status success";
    } else {
      appState.cognitive.digitLevel = clamp(appState.cognitive.digitLevel - 1, 3, 14);
      score = clamp(34 + priorLevel * 3, 20, 90);
      logEntry = logCognitiveActivity("digit-span", score, "incorrect");
      els.digitStatus.textContent = "Not quite. Correct sequence: " + appState.digit.current + " | +" + logEntry.xpEarned + " XP";
      els.digitStatus.className = "astro-status error";
    }
  }

  function createMemoryGrid() {
    els.memoryGrid.innerHTML = "";
    for (var i = 0; i < 16; i += 1) {
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
    clearMemoryPicks();
    appState.memory.revealLock = true;

    var level = clamp(appState.cognitive.visualLevel, 3, 10);
    var allIndices = Array.from({ length: 16 }, function (_, idx) { return idx; });
    appState.memory.activePattern = sample(allIndices, level).sort(function (a, b) { return a - b; });

    Array.from(els.memoryGrid.children).forEach(function (cell) {
      var idx = Number(cell.dataset.index);
      if (appState.memory.activePattern.includes(idx)) {
        cell.classList.add("active");
      }
    });

    els.memoryStatus.textContent = "Memorize highlighted tiles.";
    els.memoryStatus.className = "astro-status";

    setTimeout(function () {
      Array.from(els.memoryGrid.children).forEach(function (cell) {
        cell.classList.remove("active");
      });
      appState.memory.revealLock = false;
      els.memoryStatus.textContent = "Now reproduce the pattern and press Submit Pattern.";
    }, 1300 + level * 110);
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

    var priorLevel = clamp(appState.cognitive.visualLevel, 3, 10);
    var picked = Array.from(appState.memory.picks).sort(function (a, b) { return a - b; });
    var target = appState.memory.activePattern;
    var ok = picked.length === target.length && picked.every(function (val, idx) {
      return val === target[idx];
    });

    var score;
    var logEntry;
    if (ok) {
      appState.cognitive.visualLevel = clamp(appState.cognitive.visualLevel + 1, 3, 10);
      appState.cognitive.visualBest = Math.max(appState.cognitive.visualBest, appState.cognitive.visualLevel);
      score = clamp(60 + priorLevel * 5, 40, 100);
      logEntry = logCognitiveActivity("visual-pattern", score, "correct");
      els.memoryStatus.textContent = "Correct. Next level: " + appState.cognitive.visualLevel + " | +" + logEntry.xpEarned + " XP";
      els.memoryStatus.className = "astro-status success";
    } else {
      appState.cognitive.visualLevel = clamp(appState.cognitive.visualLevel - 1, 3, 10);
      score = clamp(30 + priorLevel * 4, 20, 90);
      logEntry = logCognitiveActivity("visual-pattern", score, "incorrect");
      els.memoryStatus.textContent = "Not exact. Target was " + target.length + " tiles. | +" + logEntry.xpEarned + " XP";
      els.memoryStatus.className = "astro-status error";
    }
  }

  function setReactionState(label, className) {
    els.reactionTarget.textContent = label;
    els.reactionTarget.className = "reaction-target" + (className ? " " + className : "");
  }

  function resetReaction() {
    if (appState.reaction.timer) {
      clearTimeout(appState.reaction.timer);
      appState.reaction.timer = null;
    }
    appState.reaction.waiting = false;
    appState.reaction.ready = false;
    appState.reaction.readyAt = 0;
    setReactionState("Press Start", "");
    renderReactionStatus();
  }

  function renderReactionStatus() {
    var runs = appState.cognitive.reactionRuns;
    if (!runs.length) {
      els.reactionStatus.textContent = "No trials yet.";
      els.reactionStatus.className = "astro-status";
      return;
    }

    var avg = Math.round(runs.reduce(function (sum, val) { return sum + val; }, 0) / runs.length);
    var best = Math.min.apply(null, runs);
    els.reactionStatus.textContent = "Average: " + avg + " ms | Best: " + best + " ms";
    els.reactionStatus.className = "astro-status";
  }

  function startReactionTrial() {
    if (appState.reaction.waiting || appState.reaction.ready) {
      return;
    }

    appState.reaction.waiting = true;
    setReactionState("Wait for green...", "waiting");

    var delay = 1100 + Math.random() * 2500;
    appState.reaction.timer = setTimeout(function () {
      appState.reaction.waiting = false;
      setReactionState("CLICK NOW", "ready");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          appState.reaction.ready = true;
          appState.reaction.readyAt = performance.now();
        });
      });
    }, delay);
  }

  function handleReactionClick(event) {
    if (appState.reaction.waiting) {
      if (appState.reaction.timer) {
        clearTimeout(appState.reaction.timer);
        appState.reaction.timer = null;
      }
      appState.reaction.waiting = false;
      setReactionState("Too early", "too-soon");
      els.reactionStatus.textContent = "False start. Wait for green next run.";
      els.reactionStatus.className = "astro-status error";
      return;
    }

    if (!appState.reaction.ready) {
      return;
    }

    var clickTs = event && typeof event.timeStamp === "number" ? event.timeStamp : performance.now();
    var elapsed = Math.max(80, Math.round(clickTs - appState.reaction.readyAt) - 15);
    appState.reaction.ready = false;
    setReactionState(elapsed + " ms", "");

    appState.cognitive.reactionRuns.push(elapsed);
    appState.cognitive.reactionRuns = appState.cognitive.reactionRuns.slice(-20);
    var score = clamp(Math.round(100 - (elapsed - 180) / 6), 15, 100);
    var logEntry = logCognitiveActivity("reaction-time", score, elapsed + "ms");
    renderReactionStatus();
    els.reactionStatus.textContent = els.reactionStatus.textContent + " | Last: " + elapsed + " ms | +" + logEntry.xpEarned + " XP";
    els.reactionStatus.className = "astro-status success";
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
      logEntry = logCognitiveActivity("running-memory-span", score, "exact");
      els.rmsStatus.textContent = "Correct. Next level: " + appState.cognitive.rmsLevel + " | +" + logEntry.xpEarned + " XP";
      els.rmsStatus.className = "astro-status success";
    } else {
      appState.cognitive.rmsLevel = clamp(appState.cognitive.rmsLevel - 1, 3, 10);
      score = clamp(25 + Math.round(hitRatio * 45) + priorLevel * 2, 15, 90);
      logEntry = logCognitiveActivity("running-memory-span", score, "partial");
      els.rmsStatus.textContent = "Not exact. Target: " + target + " | Hits: " + positionalHits + "/" + target.length + " | +" + logEntry.xpEarned + " XP";
      els.rmsStatus.className = "astro-status error";
    }

    appState.rms.readyForInput = false;
    appState.rms.target = "";
    renderRmsMeta();
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
      btn.addEventListener("click", function () {
        if (!appState.speed.running) {
          return;
        }
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

    var priorLevel = clamp(appState.cognitive.speedLevel, 1, 8);
    if (exact) {
      appState.cognitive.speedLevel = clamp(appState.cognitive.speedLevel + 1, 1, 8);
      appState.cognitive.speedBest = Math.max(appState.cognitive.speedBest, appState.cognitive.speedLevel);
    } else if (f1 < 0.6) {
      appState.cognitive.speedLevel = clamp(appState.cognitive.speedLevel - 1, 1, 8);
    }

    var score = clamp(Math.round(f1 * 85 + (remainingMs / appState.speed.durationMs) * 15 + (exact ? 8 : 0)), 10, 100);
    var detail = "hits " + truePos + "/" + correct.length + ", false " + falsePos;
    var logEntry = logCognitiveActivity("perceptual-speed", score, detail);
    els.speedSubmit.disabled = true;

    if (exact) {
      els.speedStatus.textContent = "Excellent scan. Level " + appState.cognitive.speedLevel + " | +" + logEntry.xpEarned + " XP";
      els.speedStatus.className = "astro-status success";
    } else {
      els.speedStatus.textContent =
        (timedOut ? "Time expired. " : "Submitted. ") +
        "Accuracy: " + Math.round(f1 * 100) + "% | Level " + appState.cognitive.speedLevel + " | +" + logEntry.xpEarned + " XP";
      els.speedStatus.className = "astro-status error";
    }
  }

  function submitSpeedRound() {
    finalizeSpeedRound(false);
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

    var logEntry = logCognitiveActivity("spatial-rotation", score, isCorrect ? "correct" : "incorrect");
    if (isCorrect) {
      els.rotStatus.textContent = "Correct. Level " + appState.cognitive.rotationLevel + " | +" + logEntry.xpEarned + " XP";
      els.rotStatus.className = "astro-status success";
    } else {
      els.rotStatus.textContent = "Not quite. Correct: " + correct.label + " | Level " + appState.cognitive.rotationLevel + " | +" + logEntry.xpEarned + " XP";
      els.rotStatus.className = "astro-status error";
    }
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
    var logEntry = logCognitiveActivity("math-physics-sprint", score, detail);
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
    els.digitStart.addEventListener("click", startDigitRound);
    els.digitCheck.addEventListener("click", checkDigitRound);
    els.digitInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        checkDigitRound();
      }
    });

    createMemoryGrid();
    els.memoryShow.addEventListener("click", showMemoryPattern);
    els.memorySubmit.addEventListener("click", submitMemoryPattern);
    els.memoryReset.addEventListener("click", function () {
      clearMemoryPicks();
      els.memoryStatus.textContent = "Selections reset.";
      els.memoryStatus.className = "astro-status";
    });

    els.reactionStart.addEventListener("click", startReactionTrial);
    els.reactionReset.addEventListener("click", resetReaction);
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

    els.rotStart.addEventListener("click", startRotationScenario);

    els.mathStart.addEventListener("click", startMathSprint);
    els.mathStop.addEventListener("click", function () {
      finishMathSprint("manual");
    });
    els.mathStop.disabled = true;

    renderReactionStatus();
  }

  function renderProfile() {
    var level = Math.floor(appState.profile.xp / 500) + 1;
    els.profileLevel.textContent = "Lv. " + level;
    els.profileXp.textContent = String(appState.profile.xp);
    els.profileStreak.textContent = appState.profile.streak + " day" + (appState.profile.streak === 1 ? "" : "s");
    els.profileQuizCount.textContent = String(appState.profile.quizCount);
  }

  function drawScoreSeries(ctx, pad, w, h, series, color) {
    if (!series.length) {
      return;
    }
    var step = series.length > 1 ? w / (series.length - 1) : 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach(function (point, idx) {
      var x = pad.left + idx * step;
      var y = pad.top + (1 - clamp(point.score, 0, 100) / 100) * h;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = color;
    series.forEach(function (point, idx) {
      var x = pad.left + idx * step;
      var y = pad.top + (1 - clamp(point.score, 0, 100) / 100) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawChart(attempts, drillLogs) {
    var canvas = els.progressChart;
    if (!canvas) {
      return;
    }

    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.width;
    canvas.width = Math.max(320, Math.floor(parentWidth - 10));
    canvas.height = 260;

    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pad = { left: 40, right: 16, top: 20, bottom: 34 };
    var w = canvas.width - pad.left - pad.right;
    var h = canvas.height - pad.top - pad.bottom;

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

    var quizSeries = attempts.slice(-40).map(function (attempt) {
      return { score: Number(attempt.score) || 0 };
    });
    var drillSeries = drillLogs.slice(-40).map(function (entry) {
      return { score: Number(entry.score) || 0 };
    });

    if (!quizSeries.length && !drillSeries.length) {
      ctx.fillStyle = "rgba(120, 140, 170, 0.9)";
      ctx.font = "14px sans-serif";
      ctx.fillText("No activity recorded yet.", pad.left + 12, pad.top + h / 2);
      return;
    }

    drawScoreSeries(ctx, pad, w, h, quizSeries, "#2f8cff");
    drawScoreSeries(ctx, pad, w, h, drillSeries, "#8c5cff");

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

  function renderProgress() {
    var attempts = appState.attempts;
    var drillLogs = Array.isArray(appState.cognitive.drillLogs) ? appState.cognitive.drillLogs : [];
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

    var lastQuizTs = getLatestTimestamp(attempts);
    var lastDrillTs = getLatestTimestamp(drillLogs);
    var lastAnyTs = Math.max(lastQuizTs || 0, lastDrillTs || 0);
    els.progressLast.textContent = lastAnyTs ? formatAttemptDate(new Date(lastAnyTs).toISOString()) : "Never";

    drawChart(attempts, drillLogs);

    els.historyBody.innerHTML = "";
    var combined = attempts.map(function (attempt) {
      return {
        timestamp: attempt.timestamp,
        mode: attempt.mode,
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
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }).slice(0, 40);

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

  function initProgressActions() {
    els.exportHistory.addEventListener("click", function () {
      var payload = {
        exportedAt: new Date().toISOString(),
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
    });

    els.clearHistory.addEventListener("click", function () {
      var confirmed = window.confirm("Clear all local training history and reset XP? This cannot be undone.");
      if (!confirmed) {
        return;
      }

      clearRmsTimer();
      clearSpeedTimer();
      if (appState.math.timer) {
        clearInterval(appState.math.timer);
      }
      if (appState.math.nextTimer) {
        clearTimeout(appState.math.nextTimer);
      }

      appState.profile = {
        xp: 0,
        streak: 0,
        quizCount: 0,
        lastPracticeDate: null,
        badges: []
      };
      appState.attempts = [];
      appState.cognitive = {
        digitLevel: 4,
        digitBest: 4,
        visualLevel: 3,
        visualBest: 3,
        rmsLevel: 3,
        rmsBest: 3,
        rmsSpeedFactor: 1.2,
        speedLevel: 1,
        speedBest: 1,
        rotationLevel: 2,
        rotationBest: 2,
        mathLevel: 1,
        mathBest: 1,
        reactionRuns: [],
        drillLogs: []
      };
      appState.rms = {
        sequence: [],
        target: "",
        index: 0,
        timer: null,
        running: false,
        readyForInput: false
      };
      appState.speed = {
        timer: null,
        target: "",
        options: [],
        correctIndices: [],
        selected: new Set(),
        deadline: 0,
        durationMs: 0,
        running: false
      };
      appState.rotation = {
        scenario: null,
        answered: false
      };
      appState.math = {
        timer: null,
        nextTimer: null,
        active: false,
        endAt: 0,
        total: 0,
        correct: 0,
        question: null,
        recentTypes: []
      };

      resetReaction();
      clearMemoryPicks();
      els.memoryStatus.textContent = "Progress reset.";
      els.memoryStatus.className = "astro-status";

      persistState();
      renderProfile();
      renderProgress();
      renderReactionStatus();
      els.digitStatus.textContent = "Progress reset.";
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
    });
  }

  function initializeTrainingUI() {
    loadData();
    restoreState();

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
