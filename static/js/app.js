/**
 * Baari — static/js/app.js
 * SPA routing, CSRF management, Web Audio chime synthesizer,
 * High-Fidelity Neural TTS player via /api/voice/tts,
 * Theme persistence (Dark/Light/High Contrast), floating particles,
 * and global app utilities.
 */

window.BaariApp = {
  csrfToken: "",
  currentUser: null,
  activeView: "patient",
  audioCtx: null,
  activeAudio: null,

  init() {
    this.setupRouter();
    this.setupTheme();
    this.setupParticles();
    this.checkSession();
    this.setupVoiceTester();
    this.handleUrlParams();

    const langSelect = document.getElementById("lang-select");
    if (langSelect) {
      langSelect.value = currentLang;
      langSelect.addEventListener("change", (e) => {
        setLanguage(e.target.value);
        if (window.BaariPatient) window.BaariPatient.onLangChange();
        if (window.BaariStaff) window.BaariStaff.refreshQueue();
        if (window.BaariDisplay) window.BaariDisplay.render();
      });
    }

    updatePageTranslations();

    // Pre-load speech synthesis voices as secondary fallback
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  },

  // ── URL Parameters (QR scan auto-redirect) ──────────────────────────────
  handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("qr") || params.get("hospital") || params.get("code")) {
      this.navigateTo("patient");
      setTimeout(() => {
        if (window.BaariPatient && window.BaariPatient.switchSubTab) {
          window.BaariPatient.switchSubTab("qr-scan");
          const hospName = params.get("hospital") || "District Civil Hospital";
          const hospCode = params.get("code") || "BAARI-GH-001";
          const deptId = params.get("dept");
          window.BaariPatient.applyScannedHospital(hospName, hospCode, deptId);
        }
      }, 200);
    }
  },

  // ── Theme / Accessibility ───────────────────────────────────────────────
  setupTheme() {
    const savedTheme = localStorage.getItem("baari_theme");
    if (savedTheme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }

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
        const isLight = document.body.classList.contains("light-theme");
        localStorage.setItem("baari_theme", isLight ? "light" : "dark");
        this.updateThemeIcon();
      });
      this.updateThemeIcon();
    }
  },

  updateThemeIcon() {
    const themeToggle = document.getElementById("toggle-theme");
    if (!themeToggle) return;
    const isLight = document.body.classList.contains("light-theme");
    themeToggle.textContent = isLight ? "☀️" : "🌙";
    themeToggle.title = isLight ? "Switch to Dark Mode" : "Switch to Light Mode";
  },

  // ── Floating Particles ──────────────────────────────────────────────────
  setupParticles() {
    const container = document.getElementById("particles-container");
    if (!container) return;
    container.innerHTML = "";

    for (let i = 0; i < 24; i++) {
      const particle = document.createElement("div");
      particle.className = "particle";
      particle.style.left = `${Math.random() * 100}vw`;
      particle.style.animationDelay = `${Math.random() * 15}s`;
      particle.style.animationDuration = `${12 + Math.random() * 18}s`;
      particle.style.opacity = `${0.08 + Math.random() * 0.25}`;
      const size = 1.5 + Math.random() * 3.5;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      container.appendChild(particle);
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

    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.replace("#", "") || "patient";
      this.navigateTo(hash, false);
    });

    const initial = window.location.hash.replace("#", "") || "patient";
    this.navigateTo(initial, false);
  },

  navigateTo(viewName, updateHash = true) {
    this.activeView = viewName;
    if (updateHash) {
      window.location.hash = viewName;
    }

    document.querySelectorAll(".tab-btn[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
    });

    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.remove("active");
    });

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) {
      activeSec.classList.add("active");
    }

    // Trigger sub-view initialization
    if (viewName === "patient" && window.BaariPatient) {
      window.BaariPatient.init();
    } else if (viewName === "staff" && window.BaariStaff) {
      window.BaariStaff.init();
    } else if (viewName === "display" && window.BaariDisplay) {
      window.BaariDisplay.init();
    } else if (viewName === "qrhub" && window.BaariQRHub) {
      window.BaariQRHub.init();
    } else if (viewName === "simulation" && window.BaariSimulation) {
      window.BaariSimulation.init();
    } else if (viewName === "admin" && window.BaariAdmin) {
      window.BaariAdmin.init();
    }
  },

  // ── API Fetch Wrapper ───────────────────────────────────────────────────
  async fetchApi(url, options = {}) {
    options.headers = options.headers || {};

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

  // ── Session State ───────────────────────────────────────────────────────
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
        <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="BaariApp.logout()">
          ${t("nav_logout")}
        </button>
      `;
    } else {
      userContainer.innerHTML = `
        <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="BaariApp.openLoginModal()">
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

  // ── Web Audio Chimes ────────────────────────────────────────────────────
  playAnnouncementChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();

      const ctx = this.audioCtx;
      const now = ctx.currentTime;

      // Hospital airport announcement chime: 3 harmonious tones (F5 -> A5 -> C6)
      const notes = [698.46, 880.00, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.22);
        gain.gain.setValueAtTime(0.18, now + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.22 + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.22);
        osc.stop(now + i * 0.22 + 0.65);
      });
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  },

  playScanBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();

      const ctx = this.audioCtx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1760, now); // High A6 positive confirmation beep
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  },

  // ── High-Fidelity Neural Speech Synthesis (TTS) ──────────────────────────
  async speak(text, lang = "hi") {
    if (!text || !text.trim()) return;

    // Show floating audio visualizer
    this.showAudioVisualizer(text);

    // Play chime sound first
    this.playAnnouncementChime();

    // Map language code
    let langKey = "hi";
    if (typeof lang === "string") {
      if (lang.startsWith("mr")) langKey = "mr";
      else if (lang.startsWith("en")) langKey = "en";
      else langKey = "hi";
    }

    // Stop any existing playing audio
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch (e) {}
    }

    // Slight delay after chime before speech begins
    await new Promise((r) => setTimeout(r, 650));

    try {
      const ttsUrl = `/api/voice/tts?text=${encodeURIComponent(text.trim())}&language=${langKey}`;
      const audio = new Audio(ttsUrl);
      this.activeAudio = audio;

      audio.onended = () => {
        this.hideAudioVisualizer();
      };
      audio.onerror = () => {
        console.warn("Neural audio streaming failed, falling back to Web Speech API.");
        this.speakFallback(text, langKey);
      };

      await audio.play();
    } catch (err) {
      console.warn("Audio play blocked or offline, using Web Speech API fallback:", err);
      this.speakFallback(text, langKey);
    }
  },

  speakFallback(text, langKey) {
    if (!("speechSynthesis" in window)) {
      this.hideAudioVisualizer();
      return;
    }
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.92;
    utter.pitch = 1.05;
    utter.volume = 1.0;

    let targetLang = "hi-IN";
    if (langKey === "mr") targetLang = "mr-IN";
    else if (langKey === "en") targetLang = "en-IN";
    utter.lang = targetLang;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      let bestVoice = voices.find((v) => v.lang === targetLang && (v.name.includes("Google") || v.name.includes("Natural")));
      if (!bestVoice) bestVoice = voices.find((v) => v.lang === targetLang);
      if (!bestVoice) bestVoice = voices.find((v) => v.lang.startsWith(targetLang.split("-")[0]));
      if (bestVoice) utter.voice = bestVoice;
    }

    utter.onend = () => this.hideAudioVisualizer();
    utter.onerror = () => this.hideAudioVisualizer();

    window.speechSynthesis.speak(utter);
  },

  showAudioVisualizer(text) {
    let viz = document.getElementById("audio-visualizer-badge");
    if (!viz) {
      viz = document.createElement("div");
      viz.id = "audio-visualizer-badge";
      viz.className = "audio-visualizer-badge";
      document.body.appendChild(viz);
    }

    viz.innerHTML = `
      <div class="audio-waves">
        <span class="bar bar-1"></span>
        <span class="bar bar-2"></span>
        <span class="bar bar-3"></span>
        <span class="bar bar-4"></span>
      </div>
      <div class="audio-text-preview">
        <strong style="color:var(--color-primary-light,#818cf8);">🔊 Neural Voice:</strong>
        <span style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block; vertical-align:bottom; margin-left:4px;">
          ${text}
        </span>
      </div>
      <button class="audio-stop-btn" onclick="BaariApp.stopSpeaking()" title="Stop Audio">✕</button>
    `;
    viz.classList.add("visible");
  },

  hideAudioVisualizer() {
    const viz = document.getElementById("audio-visualizer-badge");
    if (viz) viz.classList.remove("visible");
  },

  stopSpeaking() {
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
      } catch (e) {}
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.hideAudioVisualizer();
  },

  setupVoiceTester() {
    // Allows testing speech easily
    window.testBaariSpeech = (lang = "hi") => {
      let sample = "नमस्ते, आपका टोकन नंबर G-04 है। कृपया केबिन नंबर 2 में जाएं।";
      if (lang === "en") sample = "Hello! Token number G-04, please proceed to Doctor Cabin 2.";
      else if (lang === "mr") sample = "नमस्कार, आपला टोकन क्रमांक जी-०४ आहे. कृपया केबिन २ मध्ये जावे.";
      this.speak(sample, lang);
    };
  },

  // ── Toast Notifications ─────────────────────────────────────────────────
  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    toast.innerHTML = `<span style="font-weight:800;">${icons[type] || "ℹ"}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(40px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  },
};

// Auto-run on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.BaariApp.init();
});
