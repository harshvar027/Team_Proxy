import { STRINGS } from "./strings.js";

const KEY = "baari.lang";
const SUPPORTED = ["en", "hi", "mr"];

function readStored() {
  try {
    const val = localStorage.getItem(KEY);
    if (SUPPORTED.includes(val)) return val;
  } catch {
    /* ignore */
  }
  return "en";
}

let currentLang = readStored();

export function getLanguage() {
  return currentLang;
}

export function t(path, params = {}) {
  const read = (lang) => {
    let val = STRINGS[lang];
    for (const part of path.split(".")) {
      if (val && part in val) val = val[part];
      else return null;
    }
    return val;
  };
  let val = read(currentLang);
  if (val == null) val = read("en");
  if (typeof val === "string") {
    return val.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
  }
  return val ?? path;
}

export function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  currentLang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute("lang", lang);
  applyTranslations();
  syncLanguageUI();
  window.dispatchEvent(new CustomEvent("languagechange", { detail: { language: lang } }));
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
}

function syncLanguageUI() {
  document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
    const on = btn.getAttribute("data-lang-btn") === currentLang;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

export function initI18n() {
  document.documentElement.setAttribute("lang", currentLang);
  applyTranslations();
  syncLanguageUI();
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-lang-btn]");
    if (btn) setLanguage(btn.getAttribute("data-lang-btn"));
  });
}

initI18n();
