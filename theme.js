/**
 * MockWeave UI theme (dark / light). Load before popup.js or devtools_panel.js.
 */
(function (global) {
  const STORAGE_KEY = "theme";

  let theme = "dark";
  let systemListener = null;

  function normalizeTheme(value) {
    return value === "light" ? "light" : "dark";
  }

  function getEffectiveTheme() {
    return normalizeTheme(theme);
  }

  function updateThemeButtons(root) {
    const scope = root || document;
    const effective = getEffectiveTheme();
    for (const btn of scope.querySelectorAll("[data-theme-pick]")) {
      const pick = btn.getAttribute("data-theme-pick");
      btn.classList.toggle("active", pick === effective);
      btn.setAttribute("aria-pressed", pick === effective ? "true" : "false");
    }
  }

  function apply(root) {
    document.documentElement.setAttribute("data-theme", getEffectiveTheme());
    updateThemeButtons(root);
  }

  function unwireSystemListener() {
    if (!systemListener) return;
    global.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", systemListener);
    systemListener = null;
  }

  async function init() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      theme = normalizeTheme(stored[STORAGE_KEY]);
    } catch {
      theme = "dark";
    }
    unwireSystemListener();
    apply();
  }

  async function setTheme(next) {
    theme = normalizeTheme(next);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: theme });
    } catch {
      /* ignore */
    }
    apply();
    global.dispatchEvent(new CustomEvent("mockweave-theme-change"));
  }

  function getTheme() {
    return theme;
  }

  function wireThemeSwitch(root) {
    const scope = root || document;
    for (const btn of scope.querySelectorAll("[data-theme-pick]")) {
      if (btn.dataset.themeWired) continue;
      btn.dataset.themeWired = "1";
      btn.addEventListener("click", () => {
        void setTheme(btn.getAttribute("data-theme-pick"));
      });
    }
    updateThemeButtons(scope);
  }

  global.MockWeaveTheme = { init, setTheme, apply, getTheme, wireThemeSwitch };
})(typeof globalThis !== "undefined" ? globalThis : window);
