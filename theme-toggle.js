(function () {
  var MOBILE_BREAKPOINT = 760;
  var mobileTrackingBound = false;

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }

  function initializeTheme() {
    var savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  }

  function setButtonVisual(button, hovering) {
    var icon = button.querySelector(".theme-toggle-icon");
    var text = button.querySelector(".theme-toggle-text");
    if (!icon || !text) {
      return;
    }

    var dark = currentTheme() === "dark";
    text.textContent = dark ? "Light mode" : "Dark mode";

    if (hovering) {
      icon.textContent = dark ? "🌕" : "🌑";
    } else {
      icon.textContent = "◑";
    }
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: " + MOBILE_BREAKPOINT + "px)").matches;
  }

  function getNavToggle() {
    return document.querySelector(".site-nav .theme-toggle:not(.mobile-theme-toggle)");
  }

  function ensureMobileFloatingToggle() {
    var navToggle = getNavToggle();
    if (!navToggle) {
      return null;
    }

    var existing = document.querySelector(".mobile-theme-toggle");
    if (existing) {
      return existing;
    }

    var floating = document.createElement("button");
    floating.className = "theme-toggle mobile-theme-toggle";
    floating.setAttribute("type", "button");
    floating.setAttribute("aria-label", "Toggle theme");
    floating.setAttribute("title", "Toggle theme");
    floating.innerHTML = '<span class="theme-toggle-icon" aria-hidden="true">◑</span><span class="theme-toggle-text"></span>';
    document.body.appendChild(floating);
    return floating;
  }

  function syncMobileToggleVisibility() {
    var floating = document.querySelector(".mobile-theme-toggle");
    var nav = document.querySelector(".site-nav");
    var navToggle = getNavToggle();

    if (!floating || !nav || !navToggle) {
      return;
    }

    if (!isMobileViewport()) {
      floating.classList.remove("is-visible");
      return;
    }

    var navRect = nav.getBoundingClientRect();
    var toggleRect = navToggle.getBoundingClientRect();
    var navToggleVisible = toggleRect.left >= navRect.left + 4 && toggleRect.right <= navRect.right - 4;
    floating.classList.toggle("is-visible", !navToggleVisible);
  }

  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    document.querySelectorAll(".theme-toggle").forEach(function (button) {
      setButtonVisual(button, false);
    });
    syncMobileToggleVisibility();
  }

  function bindMobileTracking() {
    if (mobileTrackingBound) {
      return;
    }
    mobileTrackingBound = true;

    window.addEventListener("resize", syncMobileToggleVisibility);
    window.addEventListener("orientationchange", syncMobileToggleVisibility);

    var nav = document.querySelector(".site-nav");
    if (nav) {
      nav.addEventListener("scroll", syncMobileToggleVisibility, { passive: true });
    }
  }

  function initializeButtons() {
    ensureMobileFloatingToggle();

    var buttons = document.querySelectorAll(".theme-toggle");
    buttons.forEach(function (button) {
      if (!button.querySelector(".theme-toggle-icon") || !button.querySelector(".theme-toggle-text")) {
        button.innerHTML = '<span class="theme-toggle-icon" aria-hidden="true">◑</span><span class="theme-toggle-text"></span>';
      }

      button.setAttribute("type", "button");
      if (!button.hasAttribute("aria-label")) {
        button.setAttribute("aria-label", "Toggle theme");
      }
      button.setAttribute("title", "Toggle theme");

      if (button.dataset.themeToggleBound !== "1") {
        button.addEventListener("mouseenter", function () {
          setButtonVisual(button, true);
        });
        button.addEventListener("mouseleave", function () {
          setButtonVisual(button, false);
        });
        button.addEventListener("click", toggleTheme);
        button.dataset.themeToggleBound = "1";
      }

      setButtonVisual(button, false);
    });

    bindMobileTracking();
    syncMobileToggleVisibility();
  }

  initializeTheme();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeButtons);
  } else {
    initializeButtons();
  }

  window.toggleTheme = toggleTheme;
})();
