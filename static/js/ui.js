import { toast, openModal, closeModal, shake, updateCount, insertRow, flip, removeRow } from "./motion.js";

export { toast, openModal, closeModal, shake, updateCount, insertRow, flip, removeRow };

export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function icon(name, extraClass = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `icon ${extraClass}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

export function text(value) {
  return document.createTextNode(value == null ? "" : String(value));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val == null || val === false) continue;
    if (key === "class") node.className = val;
    else if (key === "dataset") Object.assign(node.dataset, val);
    else if (key.startsWith("on") && typeof val === "function") node.addEventListener(key.slice(2), val);
    else if (key === "text") node.textContent = val;
    else node.setAttribute(key, val === true ? "" : String(val));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(typeof child === "string" ? text(child) : child);
  }
  return node;
}

export function setLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.setAttribute("aria-busy", isLoading ? "true" : "false");
  btn.classList.toggle("is-loading", isLoading);
}

export function setFieldError(field, message) {
  if (!field) return;
  const msg = field.querySelector(".field-message");
  if (msg) {
    msg.textContent = message || "";
    msg.classList.toggle("is-on", Boolean(message));
  }
  if (message) shake(field);
  else field.classList.remove("is-invalid");
}

export function passwordStrength(value) {
  const checks = {
    length: value.length >= 8,
    number: /\d/.test(value),
    upper: /[A-Z]/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const rank = score <= 1 ? "weak" : score === 2 || score === 3 ? "medium" : "strong";
  return { checks, score, rank };
}

export async function copyText(value, ok = "Copied") {
  try {
    await navigator.clipboard.writeText(value);
    toast(ok);
    return true;
  } catch {
    toast("Could not copy");
    return false;
  }
}

export function formatTime(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? "");
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? "");
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
}

export function skeletonBlock(count = 3) {
  const wrap = el("div", { class: "stack" });
  for (let i = 0; i < count; i += 1) {
    wrap.append(el("div", { class: "skeleton", style: `height:${i === 0 ? 48 : 16}px` }));
  }
  return wrap;
}

export function emptyState({ iconName = "empty", title, action } = {}) {
  const box = el("div", { class: "empty-state" }, [icon(iconName)]);
  box.append(el("p", { class: "empty-state-text", text: title || "Nothing here yet." }));
  if (action) box.append(action);
  return box;
}

export function bindTabs(root = document) {
  root.querySelectorAll("[data-tabs]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-tab]");
      if (!btn) return;
      const id = btn.getAttribute("data-tab");
      group.querySelectorAll("[data-tab]").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      const scope = group.closest("[data-tab-scope]") || document;
      scope.querySelectorAll("[data-tab-panel]").forEach((panel) => {
        panel.hidden = panel.getAttribute("data-tab-panel") !== id;
      });
    });
  });
}

export function bindAccountMenu(root = document) {
  root.querySelectorAll("[data-account]").forEach((wrap) => {
    const btn = wrap.querySelector("[data-account-toggle]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const open = wrap.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) {
        wrap.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  });
}

export function bindSidebar() {
  const side = document.querySelector("[data-sidebar]");
  const toggle = document.querySelector("[data-sidebar-toggle]");
  const scrim = document.querySelector("[data-sidebar-scrim]");
  if (!side || !toggle) return;
  const setOpen = (open) => {
    side.classList.toggle("is-open", open);
    if (scrim) scrim.classList.toggle("is-on", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };
  toggle.addEventListener("click", () => setOpen(!side.classList.contains("is-open")));
  scrim?.addEventListener("click", () => setOpen(false));
}

export function svgLineChart(svg, series, { alt } = {}) {
  const w = 640;
  const h = 240;
  const pad = 28;
  const values = series.flatMap((s) => s.values);
  const max = Math.max(1, ...values);
  const n = series[0].values.length;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, n - 1);
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("role", "img");
  if (alt) svg.setAttribute("aria-label", alt);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  for (let g = 0; g < 4; g += 1) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const yy = pad + ((h - pad * 2) * g) / 3;
    line.setAttribute("x1", String(pad));
    line.setAttribute("x2", String(w - pad));
    line.setAttribute("y1", String(yy));
    line.setAttribute("y2", String(yy));
    line.setAttribute("class", "chart-grid");
    svg.append(line);
  }
  series.forEach((s, idx) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", path(s.values));
    p.setAttribute("class", idx === 0 ? "chart-path chart-draw" : "chart-path-alt chart-draw");
    svg.append(p);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bindTabs();
    bindAccountMenu();
    bindSidebar();
  }, { once: true });
} else {
  bindTabs();
  bindAccountMenu();
  bindSidebar();
}
