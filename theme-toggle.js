(function () {
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

  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
    document.querySelectorAll(".theme-toggle").forEach(function (button) {
      setButtonVisual(button, false);
    });
  }

  function initializeButtons() {
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

      button.addEventListener("mouseenter", function () {
        setButtonVisual(button, true);
      });
      button.addEventListener("mouseleave", function () {
        setButtonVisual(button, false);
      });
      button.addEventListener("click", toggleTheme);

      setButtonVisual(button, false);
    });
  }

  initializeTheme();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeButtons);
  } else {
    initializeButtons();
  }

  window.toggleTheme = toggleTheme;
})();
