(function () {
  var queue = [];
  var queued = new WeakSet();
  var activeLoads = 0;
  var MAX_ACTIVE_LOADS = 2;
  var BACKGROUND_UPGRADE_DELAY = 1800;

  function connectionAllowsFullRes() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) {
      return true;
    }
    if (connection.saveData) {
      return false;
    }
    return !/^(slow-2g|2g)$/i.test(connection.effectiveType || "");
  }

  function markLoaded(target) {
    target.classList.add("is-hires");
    target.setAttribute("data-full-loaded", "true");
  }

  function loadFullImage(img, done) {
    var fullSrc = img.getAttribute("data-full-src");
    if (!fullSrc || img.getAttribute("data-full-loaded")) {
      done();
      return;
    }

    img.setAttribute("data-full-loaded", "loading");
    var preload = new Image();
    preload.decoding = "async";
    preload.onload = function () {
      img.src = fullSrc;
      markLoaded(img);
      done();
    };
    preload.onerror = function () {
      img.removeAttribute("data-full-loaded");
      done();
    };
    preload.src = fullSrc;
  }

  function loadFullBackground(el, done) {
    var fullBg = el.getAttribute("data-full-bg");
    if (!fullBg || el.getAttribute("data-full-loaded")) {
      done();
      return;
    }

    el.setAttribute("data-full-loaded", "loading");
    var preload = new Image();
    preload.decoding = "async";
    preload.onload = function () {
      el.style.setProperty("--progressive-bg", 'url("' + fullBg + '")');
      markLoaded(el);
      done();
    };
    preload.onerror = function () {
      el.removeAttribute("data-full-loaded");
      done();
    };
    preload.src = fullBg;
  }

  function processQueue() {
    while (activeLoads < MAX_ACTIVE_LOADS && queue.length) {
      var item = queue.shift();
      activeLoads += 1;
      item.loader(item.target, function () {
        activeLoads -= 1;
        processQueue();
      });
    }
  }

  function enqueue(target, loader, priority) {
    if (queued.has(target) || target.getAttribute("data-full-loaded")) {
      return;
    }
    queued.add(target);
    var item = { target: target, loader: loader };
    if (priority) {
      queue.unshift(item);
    } else {
      queue.push(item);
    }
    processQueue();
  }

  function scheduleBackgroundSweep(items) {
    var schedule = window.requestIdleCallback || function (callback) {
      return window.setTimeout(callback, BACKGROUND_UPGRADE_DELAY);
    };
    schedule(function () {
      window.setTimeout(function () {
        items.forEach(function (item) {
          enqueue(item.target, item.loader, false);
        });
      }, BACKGROUND_UPGRADE_DELAY);
    });
  }

  function initProgressiveImages() {
    var images = Array.prototype.slice.call(document.querySelectorAll("img[data-full-src]"));
    var backgrounds = Array.prototype.slice.call(document.querySelectorAll("[data-full-bg]"));
    var items = images.map(function (img) {
      return { target: img, loader: loadFullImage };
    }).concat(backgrounds.map(function (el) {
      return { target: el, loader: loadFullBackground };
    }));

    if (!items.length || !connectionAllowsFullRes()) {
      return;
    }

    images.forEach(function (img) {
      img.classList.add("progressive-image");
    });
    backgrounds.forEach(function (el) {
      el.classList.add("progressive-bg");
    });

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(
        function (entries, obs) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
              return;
            }
            var loader = entry.target.hasAttribute("data-full-bg") ? loadFullBackground : loadFullImage;
            enqueue(entry.target, loader, true);
            obs.unobserve(entry.target);
          });
        },
        { rootMargin: "480px 0px" }
      );

      items.forEach(function (item) {
        observer.observe(item.target);
      });
      scheduleBackgroundSweep(items);
      return;
    }

    scheduleBackgroundSweep(items);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProgressiveImages);
  } else {
    initProgressiveImages();
  }
})();
