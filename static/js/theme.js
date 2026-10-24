const KEY = "baari.theme";

function readStored() {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* private mode */
  }
  return null;
}

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getTheme() {
  return readStored() ?? systemTheme();
}

function syncMeta(theme) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.getAttribute("media");
    if (!scheme) meta.setAttribute("content", theme === "dark" ? "#000000" : "#fbfbfd");
  });
}

function syncToggleUI() {
  const dark = getTheme() === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.setAttribute("aria-label", dark ? "Switch to light appearance" : "Switch to dark appearance");
  });
}

export function setTheme(mode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  } else {
    root.setAttribute("data-theme", mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
  }
  syncMeta(getTheme());
  syncToggleUI();
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function initTheme() {
  const stored = readStored();
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  syncMeta(getTheme());
  syncToggleUI();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!readStored()) {
      syncMeta(getTheme());
      syncToggleUI();
    }
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-theme-toggle]")) toggleTheme();
  });
}

initTheme();
