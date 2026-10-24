const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

export function prefersReduced() {
  return reduce.matches;
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function playPageEnter(root = document) {
  const nodes = [...root.querySelectorAll("[data-enter]")];
  if (!nodes.length) return;
  if (prefersReduced()) {
    nodes.forEach((el) => el.classList.add("is-entering"));
    return;
  }
  nodes.forEach((el, i) => {
    el.style.animationDelay = `${i * 80}ms`;
    el.classList.add("is-entering");
  });
}

export function initReveal(root = document) {
  const nodes = [...root.querySelectorAll("[data-reveal]")];
  if (!nodes.length) return;
  if (prefersReduced()) {
    nodes.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
  );
  nodes.forEach((el) => io.observe(el));
}

export function initNavScroll() {
  const nav = document.querySelector("[data-nav]");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function sameOrigin(href) {
  try {
    return new URL(href, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

export function initPageTransitions() {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.hasAttribute("download") || link.target === "_blank") return;
    if (link.dataset.noTransition != null) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    if (!sameOrigin(href)) return;
    const next = new URL(href, location.href);
    if (next.pathname === location.pathname && next.hash) return;
    if (prefersReduced()) return;
    event.preventDefault();
    document.body.classList.add("is-leaving");
    window.setTimeout(() => {
      location.href = next.href;
    }, 240);
  });
}

const focusStack = [];

function focusable(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => !el.hasAttribute("hidden") && el.getClientRects().length);
}

function trapKey(event, dialog) {
  if (event.key !== "Tab") return;
  const items = focusable(dialog);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openModal(id) {
  const backdrop = document.querySelector(`[data-modal="${id}"]`);
  if (!backdrop) return;
  const dialog = backdrop.querySelector(".modal, .sheet") ?? backdrop;
  backdrop.hidden = false;
  backdrop.classList.remove("is-leaving");
  document.body.style.overflow = "hidden";
  focusStack.push(document.activeElement);
  const items = focusable(dialog);
  (items[0] ?? dialog).focus();
  dialog.addEventListener("keydown", (dialog._trap = (e) => trapKey(e, dialog)));
}

export function closeModal(id) {
  const backdrop = document.querySelector(`[data-modal="${id}"]`);
  if (!backdrop || backdrop.hidden) return;
  const dialog = backdrop.querySelector(".modal, .sheet") ?? backdrop;
  const finish = () => {
    backdrop.hidden = true;
    backdrop.classList.remove("is-leaving");
    document.body.style.overflow = "";
    if (dialog._trap) dialog.removeEventListener("keydown", dialog._trap);
    const prev = focusStack.pop();
    if (prev && typeof prev.focus === "function") prev.focus();
  };
  if (prefersReduced()) {
    finish();
    return;
  }
  backdrop.classList.add("is-leaving");
  window.setTimeout(finish, 240);
}

export function initModals(root = document) {
  root.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open-modal]");
    if (opener) {
      openModal(opener.getAttribute("data-open-modal"));
      return;
    }
    const closer = event.target.closest("[data-close-modal]");
    if (closer) {
      closeModal(closer.getAttribute("data-close-modal") || closer.closest("[data-modal]")?.getAttribute("data-modal"));
      return;
    }
    const backdrop = event.target.closest("[data-modal]");
    if (backdrop && event.target === backdrop) closeModal(backdrop.getAttribute("data-modal"));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = [...document.querySelectorAll("[data-modal]:not([hidden])")].at(-1);
    if (open) closeModal(open.getAttribute("data-modal"));
  });
}

let toastHost;
let toastTimer = 0;
let toastRemaining = 4000;
let toastStarted = 0;

function ensureToastHost() {
  if (toastHost) return toastHost;
  toastHost = document.createElement("div");
  toastHost.className = "toast-host";
  toastHost.setAttribute("aria-live", "polite");
  toastHost.setAttribute("aria-relevant", "additions text");
  document.body.append(toastHost);
  return toastHost;
}

function dismissToast(node) {
  window.clearTimeout(toastTimer);
  node.classList.add("is-leaving");
  window.setTimeout(() => node.remove(), prefersReduced() ? 0 : 240);
}

export function toast(message, { timeout = 4000 } = {}) {
  const host = ensureToastHost();
  host.replaceChildren();
  const node = document.createElement("div");
  node.className = "toast glass";
  node.setAttribute("role", "status");
  node.textContent = message;
  host.append(node);
  toastRemaining = timeout;
  toastStarted = Date.now();
  const schedule = () => {
    toastTimer = window.setTimeout(() => dismissToast(node), toastRemaining);
  };
  schedule();
  node.addEventListener("mouseenter", () => {
    window.clearTimeout(toastTimer);
    toastRemaining -= Date.now() - toastStarted;
  });
  node.addEventListener("mouseleave", () => {
    toastStarted = Date.now();
    schedule();
  });
  return node;
}

function formatCount(value, decimals) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function runCount(el, from, to, ms) {
  const decimals = Number(el.dataset.decimals ?? (String(to).includes(".") ? 1 : 0));
  const suffix = el.dataset.suffix ?? "";
  const prefix = el.dataset.prefix ?? "";
  if (prefersReduced()) {
    el.textContent = prefix + formatCount(to, decimals) + suffix;
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = prefix + formatCount(from + (to - from) * easeOut(t), decimals) + suffix;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = prefix + formatCount(to, decimals) + suffix;
  };
  requestAnimationFrame(tick);
}

export function animateCount(el, { duration = 700 } = {}) {
  const to = Number(el.dataset.count ?? el.textContent);
  if (Number.isNaN(to)) return;
  el.dataset.countReady = "1";
  runCount(el, 0, to, duration);
}

export function updateCount(el, next) {
  const to = Number(next);
  el.dataset.count = String(to);
  if (!el.dataset.countReady) {
    animateCount(el);
    return;
  }
  const current = Number(String(el.textContent).replace(/[^\d.-]/g, "")) || 0;
  el.classList.remove("is-rolling");
  void el.offsetWidth;
  el.classList.add("is-rolling");
  runCount(el, current, to, 240);
}

export function initCountUps(root = document) {
  const nodes = [...root.querySelectorAll("[data-count]")];
  if (!nodes.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.4 }
  );
  nodes.forEach((el) => io.observe(el));
}

export function shake(el) {
  if (!el) return;
  el.classList.remove("is-invalid");
  void el.offsetWidth;
  el.classList.add("is-invalid");
  const msg = el.querySelector(".field-message");
  if (msg) msg.classList.add("is-on");
}

export function insertRow(el) {
  el.classList.add("row-enter");
}

export function removeRow(el) {
  return new Promise((resolve) => {
    el.classList.add("row-leave");
    const done = () => {
      el.remove();
      resolve();
    };
    if (prefersReduced()) {
      done();
      return;
    }
    window.setTimeout(done, 240);
  });
}

export function flip(container, mutate) {
  const children = [...container.children];
  const first = new Map(children.map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  if (prefersReduced()) return;
  [...container.children].forEach((el) => {
    const prev = first.get(el);
    const last = el.getBoundingClientRect();
    if (!prev) {
      insertRow(el);
      return;
    }
    const dx = prev.left - last.left;
    const dy = prev.top - last.top;
    if (!dx && !dy) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: 240,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  });
}

export function initMotion(root = document) {
  playPageEnter(root);
  initReveal(root);
  initNavScroll();
  initPageTransitions();
  initModals(root);
  initCountUps(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initMotion(), { once: true });
} else {
  initMotion();
}
