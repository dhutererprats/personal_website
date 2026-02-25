(function () {
  var STORE_KEYS = {
    attempts: "pilot_training_attempts_v1",
    profile: "pilot_training_profile_v1"
  };

  var els = {};
  var state = {
    chapters: [],
    allCards: [],
    currentChapterId: null,
    flashDeck: [],
    flashIndex: 0,
    flashOrder: "series",
    attempts: [],
    profile: {
      quizzes: 0,
      lastAt: null
    },
    quiz: {
      running: false,
      mode: "random-all",
      chapterId: null,
      questions: [],
      index: 0,
      selectedIndex: null,
      answered: false,
      records: [],
      autoNextTimer: null
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

  function extractFeatures(text) {
    var lower = String(text || "").toLowerCase();
    return {
      hasYear: /\b(19|20)\d{2}\b/.test(lower),
      hasEquation: /[=+\-*/^]/.test(lower),
      hasNumber: /\d/.test(lower),
      hasUnits: /\b(kt|knots|kts|ft|nm|gph|lbs|lb-in|inches|deg|hpa|inhg|%)\b/.test(lower),
      hasAcronym: /\b[A-Z]{2,6}\b/.test(String(text || "")),
      tokenSet: new Set(normalizeTokens(text)),
      wordCount: normalizeTokens(text).length
    };
  }

  function answerSimilarity(aText, bText) {
    var a = extractFeatures(aText);
    var b = extractFeatures(bText);
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
    if (a.hasAcronym === b.hasAcronym) {
      score += a.hasAcronym ? 3 : 1;
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

    var wd = Math.abs(a.wordCount - b.wordCount);
    if (wd <= 2) {
      score += 2;
    } else if (wd <= 5) {
      score += 1;
    }

    return score;
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
      // ignore private browsing storage errors
    }
  }

  function bindElements() {
    els.chapterGrid = byId("pilot-chapter-grid");
    els.flashChapter = byId("pilot-flash-chapter");
    els.flashOrder = byId("pilot-flash-order");
    els.flashCard = byId("pilot-flash-card");
    els.flashQ = byId("pilot-flash-q");
    els.flashA = byId("pilot-flash-a");
    els.flashMeta = byId("pilot-flash-meta");
    els.flashPrev = byId("pilot-flash-prev");
    els.flashFlip = byId("pilot-flash-flip");
    els.flashNext = byId("pilot-flash-next");
    els.flashRandom = byId("pilot-flash-random");

    els.quizMode = byId("pilot-quiz-mode");
    els.quizChapter = byId("pilot-quiz-chapter");
    els.quizCount = byId("pilot-quiz-count");
    els.quizInstant = byId("pilot-quiz-instant");
    els.quizStart = byId("pilot-quiz-start");
    els.quizLive = byId("pilot-quiz-live");
    els.quizTitle = byId("pilot-quiz-title");
    els.quizText = byId("pilot-quiz-text");
    els.quizOptions = byId("pilot-quiz-options");
    els.quizProgress = byId("pilot-quiz-progress");
    els.quizSubmit = byId("pilot-quiz-submit");
    els.quizNext = byId("pilot-quiz-next");
    els.quizResult = byId("pilot-quiz-result");
    els.quizScoreTitle = byId("pilot-quiz-score-title");
    els.quizScoreText = byId("pilot-quiz-score-text");
    els.quizRestart = byId("pilot-quiz-restart");
    els.quizReview = byId("pilot-quiz-review");

    els.statQuizzes = byId("pilot-stat-quizzes");
    els.statAvg = byId("pilot-stat-avg");
    els.statBest = byId("pilot-stat-best");
    els.statLast = byId("pilot-stat-last");
    els.chart = byId("pilot-chart");
    els.historyBody = byId("pilot-history-body");

    els.sources = byId("pilot-sources");
  }

  function loadData() {
    var data = window.PILOT_TRAINING_DATA;
    if (!data || !Array.isArray(data.chapters)) {
      throw new Error("Pilot training data unavailable.");
    }

    state.chapters = data.chapters
      .filter(function (chapter) {
        return chapter && chapter.id && chapter.name && Array.isArray(chapter.cards) && chapter.cards.length > 0;
      })
      .map(function (chapter) {
        return {
          id: chapter.id,
          name: chapter.name,
          cards: chapter.cards.map(function (card, idx) {
            return {
              id: card.id || chapter.id + "-" + String(idx + 1),
              q: String(card.q || "").trim(),
              a: String(card.a || "").trim(),
              chapterId: chapter.id,
              chapterName: chapter.name
            };
          }).filter(function (card) {
            return card.q.length > 0 && card.a.length > 0;
          })
        };
      });

    if (!state.chapters.length) {
      throw new Error("No pilot chapters found.");
    }

    state.allCards = state.chapters.reduce(function (acc, chapter) {
      return acc.concat(chapter.cards);
    }, []);

    state.currentChapterId = state.chapters[0].id;

    els.sources.innerHTML = "";
    (data.sources || []).forEach(function (src) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = src.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = src.label || src.url;
      li.appendChild(a);
      els.sources.appendChild(li);
    });
  }

  function restoreState() {
    var attempts = safeRead(STORE_KEYS.attempts, []);
    state.attempts = Array.isArray(attempts) ? attempts : [];

    var profile = safeRead(STORE_KEYS.profile, null);
    if (profile && typeof profile === "object") {
      state.profile.quizzes = Number(profile.quizzes) || 0;
      state.profile.lastAt = profile.lastAt || null;
    }
  }

  function persistState() {
    safeWrite(STORE_KEYS.attempts, state.attempts);
    safeWrite(STORE_KEYS.profile, state.profile);
  }

  function getCurrentChapter() {
    return state.chapters.find(function (chapter) {
      return chapter.id === state.currentChapterId;
    }) || state.chapters[0];
  }

  function populateInputs() {
    els.flashChapter.innerHTML = "";
    els.quizChapter.innerHTML = "";

    state.chapters.forEach(function (chapter) {
      var a = document.createElement("option");
      a.value = chapter.id;
      a.textContent = chapter.name;
      els.flashChapter.appendChild(a);

      var b = document.createElement("option");
      b.value = chapter.id;
      b.textContent = chapter.name;
      els.quizChapter.appendChild(b);
    });

    els.flashChapter.value = state.currentChapterId;
    els.quizChapter.value = state.currentChapterId;
  }

  function renderChapters() {
    els.chapterGrid.innerHTML = "";

    state.chapters.forEach(function (chapter) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "pilot-chapter-btn" + (chapter.id === state.currentChapterId ? " active" : "");
      button.innerHTML =
        '<span class="n">' + chapter.name + "</span>" +
        '<span class="m">' + chapter.cards.length + " cards</span>";
      button.addEventListener("click", function () {
        state.currentChapterId = chapter.id;
        els.flashChapter.value = chapter.id;
        els.quizChapter.value = chapter.id;
        prepareFlashDeck();
        renderChapters();
      });
      els.chapterGrid.appendChild(button);
    });
  }

  function prepareFlashDeck() {
    var chapter = getCurrentChapter();
    var cards = chapter.cards.slice();
    if (state.flashOrder === "random") {
      cards = shuffle(cards);
    }
    state.flashDeck = cards;
    state.flashIndex = 0;
    renderFlashCard();
  }

  function renderFlashCard() {
    if (!state.flashDeck.length) {
      els.flashQ.textContent = "No cards available.";
      els.flashA.textContent = "";
      els.flashMeta.textContent = "";
      return;
    }

    var card = state.flashDeck[state.flashIndex];
    var chapter = getCurrentChapter();
    els.flashQ.textContent = card.q;
    els.flashA.textContent = card.a;
    els.flashMeta.textContent = chapter.name + " | Card " + (state.flashIndex + 1) + " of " + state.flashDeck.length;
    els.flashCard.classList.remove("is-flipped");
  }

  function initFlashcards() {
    function flip() {
      els.flashCard.classList.toggle("is-flipped");
    }

    els.flashCard.addEventListener("click", flip);
    els.flashCard.addEventListener("keydown", function (event) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        flip();
      }
    });

    els.flashFlip.addEventListener("click", flip);

    els.flashChapter.addEventListener("change", function () {
      state.currentChapterId = els.flashChapter.value;
      els.quizChapter.value = state.currentChapterId;
      prepareFlashDeck();
      renderChapters();
    });

    els.flashOrder.addEventListener("change", function () {
      state.flashOrder = els.flashOrder.value;
      prepareFlashDeck();
    });

    els.flashPrev.addEventListener("click", function () {
      if (!state.flashDeck.length) {
        return;
      }
      state.flashIndex = (state.flashIndex - 1 + state.flashDeck.length) % state.flashDeck.length;
      renderFlashCard();
    });

    els.flashNext.addEventListener("click", function () {
      if (!state.flashDeck.length) {
        return;
      }
      state.flashIndex = (state.flashIndex + 1) % state.flashDeck.length;
      renderFlashCard();
    });

    els.flashRandom.addEventListener("click", function () {
      if (!state.flashDeck.length) {
        return;
      }
      state.flashIndex = Math.floor(Math.random() * state.flashDeck.length);
      renderFlashCard();
    });
  }

  function buildQuestion(card) {
    var sameChapter = state.allCards.filter(function (c) {
      return c.chapterId === card.chapterId && c.id !== card.id;
    });

    var global = state.allCards.filter(function (c) {
      return c.id !== card.id;
    });

    var pool = sameChapter.length >= 8
      ? sameChapter
      : sameChapter.concat(global.filter(function (c) { return c.chapterId !== card.chapterId; }));

    var uniquePool = uniqueBy(pool, function (c) { return c.a; });
    var ranked = uniquePool.map(function (candidate) {
      var base = candidate.chapterId === card.chapterId ? 6 : 0;
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
      var fallback = uniqueBy(global, function (c) { return c.a; }).filter(function (candidate) {
        return !distractorCards.some(function (d) { return d.id === candidate.id; });
      });
      distractorCards = distractorCards.concat(sample(fallback, 3 - distractorCards.length));
    }

    var options = shuffle([card.a].concat(distractorCards.map(function (d) { return d.a; }).slice(0, 3)));

    return {
      id: card.id,
      prompt: card.q,
      correctAnswer: card.a,
      options: options,
      chapterId: card.chapterId,
      chapterName: card.chapterName
    };
  }

  function setQuizModeUI() {
    els.quizChapter.disabled = els.quizMode.value === "random-all";
  }

  function buildQuizSet() {
    var mode = els.quizMode.value;
    var chapterId = els.quizChapter.value || state.currentChapterId;
    var count = clamp(Number(els.quizCount.value) || 20, 5, 100);

    var pool;
    if (mode === "random-all") {
      pool = state.allCards.slice();
    } else {
      pool = state.allCards.filter(function (card) {
        return card.chapterId === chapterId;
      });
    }

    if (!pool.length) {
      return null;
    }

    var chosen = mode === "series-chapter"
      ? pool.slice(0, Math.min(count, pool.length))
      : sample(pool, Math.min(count, pool.length));

    return {
      mode: mode,
      chapterId: chapterId,
      questions: chosen.map(buildQuestion)
    };
  }

  function startQuiz() {
    var setup = buildQuizSet();
    if (!setup || !setup.questions.length) {
      return;
    }

    if (state.quiz.autoNextTimer) {
      clearTimeout(state.quiz.autoNextTimer);
      state.quiz.autoNextTimer = null;
    }

    state.quiz.running = true;
    state.quiz.mode = setup.mode;
    state.quiz.chapterId = setup.chapterId;
    state.quiz.questions = setup.questions;
    state.quiz.index = 0;
    state.quiz.records = [];
    state.quiz.selectedIndex = null;
    state.quiz.answered = false;

    els.quizResult.hidden = true;
    els.quizLive.hidden = false;
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    var quiz = state.quiz;
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

    els.quizTitle.textContent = "Question " + (quiz.index + 1);
    els.quizText.textContent = question.prompt;
    els.quizProgress.textContent = "Question " + (quiz.index + 1) + " / " + quiz.questions.length;
    els.quizOptions.innerHTML = "";

    question.options.forEach(function (optionText, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pilot-option";
      btn.textContent = optionText;
      btn.addEventListener("click", function () {
        if (quiz.answered) {
          return;
        }
        quiz.selectedIndex = idx;
        Array.from(els.quizOptions.children).forEach(function (node, nodeIdx) {
          node.classList.toggle("selected", nodeIdx === idx);
        });

        if (els.quizInstant.checked) {
          submitAnswer();
          if (quiz.running) {
            quiz.autoNextTimer = setTimeout(function () {
              if (quiz.running && quiz.answered) {
                nextQuestion();
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

  function submitAnswer() {
    var quiz = state.quiz;
    if (!quiz.running || quiz.answered) {
      return;
    }

    if (quiz.selectedIndex == null) {
      els.quizProgress.textContent = "Select an option first.";
      return;
    }

    var question = quiz.questions[quiz.index];
    var selected = question.options[quiz.selectedIndex];
    var correct = selected === question.correctAnswer;

    quiz.answered = true;

    Array.from(els.quizOptions.children).forEach(function (node, idx) {
      node.disabled = true;
      var option = question.options[idx];
      if (option === question.correctAnswer) {
        node.classList.add("correct");
      }
      if (idx === quiz.selectedIndex && option !== question.correctAnswer) {
        node.classList.add("wrong");
      }
    });

    quiz.records.push({
      prompt: question.prompt,
      correct: correct,
      selected: selected,
      answer: question.correctAnswer,
      chapterName: question.chapterName
    });

    els.quizSubmit.disabled = true;
    els.quizNext.disabled = false;
    els.quizProgress.textContent = correct ? "Correct." : "Incorrect.";
  }

  function formatDate(iso) {
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

  function finishQuiz() {
    var quiz = state.quiz;
    if (quiz.autoNextTimer) {
      clearTimeout(quiz.autoNextTimer);
      quiz.autoNextTimer = null;
    }

    var total = quiz.records.length;
    var correct = quiz.records.filter(function (row) { return row.correct; }).length;
    var score = total ? Math.round((correct / total) * 100) : 0;

    var chapterName;
    if (quiz.mode === "random-all") {
      chapterName = "All chapters";
    } else {
      var chapter = state.chapters.find(function (c) { return c.id === quiz.chapterId; });
      chapterName = chapter ? chapter.name : "Chapter";
    }

    state.attempts.push({
      timestamp: new Date().toISOString(),
      mode: quiz.mode,
      chapterName: chapterName,
      score: score,
      correct: correct,
      total: total
    });
    state.attempts = state.attempts.slice(-300);
    state.profile.quizzes += 1;
    state.profile.lastAt = new Date().toISOString();
    persistState();

    state.quiz.running = false;
    els.quizLive.hidden = true;
    els.quizResult.hidden = false;

    els.quizScoreTitle.textContent = "Score: " + score + "%";
    els.quizScoreText.textContent = correct + " / " + total + " correct";

    els.quizReview.innerHTML = "";
    quiz.records.forEach(function (row) {
      var li = document.createElement("li");
      li.textContent = row.correct ? "Correct: " + row.prompt : "Review: " + row.prompt + " | " + row.answer;
      els.quizReview.appendChild(li);
    });

    renderProgress();
  }

  function nextQuestion() {
    var quiz = state.quiz;
    if (!quiz.running) {
      return;
    }

    if (quiz.autoNextTimer) {
      clearTimeout(quiz.autoNextTimer);
      quiz.autoNextTimer = null;
    }

    if (quiz.index < quiz.questions.length - 1) {
      quiz.index += 1;
      renderQuizQuestion();
    } else {
      finishQuiz();
    }
  }

  function initQuiz() {
    setQuizModeUI();

    els.quizMode.addEventListener("change", setQuizModeUI);

    els.quizStart.addEventListener("click", startQuiz);
    els.quizSubmit.addEventListener("click", submitAnswer);
    els.quizNext.addEventListener("click", nextQuestion);
    els.quizRestart.addEventListener("click", function () {
      els.quizResult.hidden = true;
      startQuiz();
    });
  }

  function drawChart() {
    var canvas = els.chart;
    if (!canvas) {
      return;
    }

    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.width;
    canvas.width = Math.max(320, Math.floor(parentWidth - 10));
    canvas.height = 250;

    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var pad = { left: 40, right: 16, top: 18, bottom: 30 };
    var w = canvas.width - pad.left - pad.right;
    var h = canvas.height - pad.top - pad.bottom;

    ctx.strokeStyle = "rgba(120,140,170,0.45)";
    ctx.lineWidth = 1;
    for (var y = 0; y <= 5; y += 1) {
      var yy = pad.top + (h * y) / 5;
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(canvas.width - pad.right, yy);
      ctx.stroke();

      ctx.fillStyle = "rgba(120,140,170,0.95)";
      ctx.font = "11px sans-serif";
      ctx.fillText(String(100 - y * 20), 8, yy + 4);
    }

    var attempts = state.attempts.slice(-40);
    if (!attempts.length) {
      ctx.fillStyle = "rgba(120,140,170,0.9)";
      ctx.font = "14px sans-serif";
      ctx.fillText("No pilot quiz attempts yet.", pad.left + 10, pad.top + h / 2);
      return;
    }

    var step = attempts.length > 1 ? w / (attempts.length - 1) : 0;
    ctx.strokeStyle = "#2f8cff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    attempts.forEach(function (attempt, idx) {
      var x = pad.left + idx * step;
      var y = pad.top + (1 - clamp(Number(attempt.score) || 0, 0, 100) / 100) * h;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = "#2f8cff";
    attempts.forEach(function (attempt, idx) {
      var x = pad.left + idx * step;
      var y = pad.top + (1 - clamp(Number(attempt.score) || 0, 0, 100) / 100) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderProgress() {
    var attempts = state.attempts;
    var count = attempts.length;
    var avg = count
      ? Math.round(attempts.reduce(function (sum, a) { return sum + (Number(a.score) || 0); }, 0) / count)
      : 0;
    var best = count
      ? Math.max.apply(null, attempts.map(function (a) { return Number(a.score) || 0; }))
      : 0;

    els.statQuizzes.textContent = String(state.profile.quizzes);
    els.statAvg.textContent = avg + "%";
    els.statBest.textContent = best + "%";
    els.statLast.textContent = state.profile.lastAt ? formatDate(state.profile.lastAt) : "Never";

    drawChart();

    els.historyBody.innerHTML = "";
    attempts.slice().reverse().slice(0, 40).forEach(function (attempt) {
      var tr = document.createElement("tr");
      var cols = [
        formatDate(attempt.timestamp),
        attempt.mode,
        attempt.chapterName,
        attempt.score + "%",
        attempt.correct + " / " + attempt.total
      ];
      cols.forEach(function (val) {
        var td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });
      els.historyBody.appendChild(tr);
    });
  }

  function init() {
    bindElements();
    loadData();
    restoreState();

    populateInputs();
    renderChapters();
    state.flashOrder = els.flashOrder.value;
    prepareFlashDeck();

    initFlashcards();
    initQuiz();
    renderProgress();

    window.addEventListener("resize", drawChart);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
