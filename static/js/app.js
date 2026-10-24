/**
 * Baari — static/js/app.js
 * SPA routing, CSRF management, Web Audio chime synthesizer,
 * Speech synthesis, auth session state, and global utilities.
 */

// Global App State
window.BaariApp = {
  csrfToken: "",
  currentUser: null,
  activeView: "patient",
  audioCtx: null,

  // Initialize
  init() {
    this.setupRouter();
    this.setupTheme();
    this.checkSession();

    // Language dropdown listener
    const langSelect = document.getElementById("lang-select");
    if (langSelect) {
      langSelect.value = currentLang;
      langSelect.addEventListener("change", (e) => {
        setLanguage(e.target.value);
        if (window.BaariPatient) window.BaariPatient.onLangChange();
        if (window.BaariStaff) window.BaariStaff.refreshQueue();
      });
    }

    updatePageTranslations();
  },

  // ── Theme / Accessibility ───────────────────────────────────────────────
  setupTheme() {
    const isHc = localStorage.getItem("baari_hc") === "true";
    if (isHc) document.body.classList.add("high-contrast");

    const hcToggle = document.getElementById("toggle-hc");
    if (hcToggle) {
      hcToggle.addEventListener("click", () => {
        document.body.classList.toggle("high-contrast");
        localStorage.setItem("baari_hc", document.body.classList.contains("high-contrast"));
      });
    }

    const themeToggle = document.getElementById("toggle-theme");
    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("light-theme");
      });
    }
  },

  // ── Router ──────────────────────────────────────────────────────────────
  setupRouter() {
    const tabs = document.querySelectorAll(".tab-btn[data-view]");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        this.navigateTo(view);
      });
    });

    // Handle hash change
    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.replace("#", "") || "patient";
      this.navigateTo(hash, false);
    });

    // Initial route
    const initial = window.location.hash.replace("#", "") || "patient";
    this.navigateTo(initial, false);
  },

  navigateTo(viewName, updateHash = true) {
    this.activeView = viewName;
    if (updateHash) {
      window.location.hash = viewName;
    }

    // Toggle active tab button
    document.querySelectorAll(".tab-btn[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
    });

    // Toggle view section
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.remove("active");
    });

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) {
      activeSec.classList.add("active");
    }

    // Trigger lifecycle view hooks
    if (viewName === "patient" && window.BaariPatient) {
      window.BaariPatient.init();
    } else if (viewName === "staff" && window.BaariStaff) {
      window.BaariStaff.init();
    } else if (viewName === "simulation" && window.BaariSimulation) {
      window.BaariSimulation.init();
    } else if (viewName === "admin" && window.BaariAdmin) {
      window.BaariAdmin.init();
    }
  },

  // ── API Fetch Wrapper (Auto CSRF & Error Handling) ───────────────────────
  async fetchApi(url, options = {}) {
    options.headers = options.headers || {};

    // Attach CSRF token on mutating requests
    const method = (options.method || "GET").toUpperCase();
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      if (this.csrfToken) {
        options.headers["X-CSRF-Token"] = this.csrfToken;
      }
    }

    if (!options.headers["Content-Type"] && !(options.body instanceof FormData)) {
      options.headers["Content-Type"] = "application/json";
    }

    options.credentials = "same-origin";

    try {
      const res = await fetch(url, options);

      // Check for updated CSRF header
      const newCsrf = res.headers.get("X-CSRF-Token");
      if (newCsrf) {
        this.csrfToken = newCsrf;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || `Server error (${res.status})`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  // ── Session State Check ─────────────────────────────────────────────────
  async checkSession() {
    try {
      const me = await this.fetchApi("/api/me");
      this.currentUser = me;
      this.renderUserHeader();
    } catch (err) {
      this.currentUser = null;
      this.renderUserHeader();
    }
  },

  renderUserHeader() {
    const userContainer = document.getElementById("header-user-status");
    if (!userContainer) return;

    if (this.currentUser) {
      const roleBadge = this.currentUser.role === "admin" ? "badge-priority" : "badge-normal";
      const deptInfo = this.currentUser.department_name ? ` (${this.currentUser.department_name})` : "";
      userContainer.innerHTML = `
        <span class="badge ${roleBadge}">
          👤 ${this.currentUser.username}${deptInfo}
        </span>
        <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="BaariApp.logout()">
          ${t("nav_logout")}
        </button>
      `;
    } else {
      userContainer.innerHTML = `
        <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="BaariApp.openLoginModal()">
          ${t("nav_login")}
        </button>
      `;
    }
  },

  openLoginModal(prefillUser = "", prefillPass = "") {
    const modal = document.getElementById("login-modal");
    if (!modal) return;
    if (prefillUser) document.getElementById("login-username").value = prefillUser;
    if (prefillPass) document.getElementById("login-password").value = prefillPass;
    modal.showModal();
  },

  closeLoginModal() {
    const modal = document.getElementById("login-modal");
    if (modal) modal.close();
  },

  async handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById("login-username").value.trim();
    const p = document.getElementById("login-password").value;

    try {
      const res = await this.fetchApi("/api/login", {
        method: "POST",
        body: JSON.stringify({ username: u, password: p }),
      });
      this.showToast(res.message, "success");
      this.closeLoginModal();
      await this.checkSession();

      // Redirect staff directly to staff console, admin to admin view
      if (res.role === "admin") {
        this.navigateTo("admin");
      } else {
        this.navigateTo("staff");
      }
    } catch (err) {
      this.showToast(err.message, "error");
    }
  },

  async logout() {
    try {
      await this.fetchApi("/api/logout", { method: "POST" });
      this.currentUser = null;
      this.renderUserHeader();
      this.showToast("Logged out successfully", "info");
      this.navigateTo("patient");
    } catch (err) {
      this.showToast("Logout failed", "error");
    }
  },

  // ── Web Audio Chime Synthesizer (Zero External MP3 Assets) ──────────────
  playAnnouncementChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();

      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // Two-tone airport / hospital chime (F5 -> A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(698.46, now); // F5
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.0, now + 0.3); // A5
      gain2.gain.setValueAtTime(0.18, now + 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.3);
      osc2.stop(now + 1.2);
    } catch (e) {
      console.warn("Could not play audio chime:", e);
    }
  },

  // ── Speech Synthesis (TTS Announcement) ──────────────────────────────────
  speak(text, lang = "hi-IN") {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    utter.pitch = 1.0;

    // Pick appropriate voice tag
    if (lang.startsWith("mr")) {
      utter.lang = "mr-IN";
    } else if (lang.startsWith("hi")) {
      utter.lang = "hi-IN";
    } else {
      utter.lang = "en-IN";
    }

    window.speechSynthesis.speak(utter);
  },

  // ── Toast Notifications ─────────────────────────────────────────────────
  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },
};

// Auto-run on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.BaariApp.init();
});
