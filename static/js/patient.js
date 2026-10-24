/**
 * Baari — static/js/patient.js
 * Patient Kiosk: Voice token request, typed form, PIN display,
 * travel time buffer calculator, and live queue status tracking.
 */

window.BaariPatient = {
  departments: [],
  selectedDeptId: null,
  recognition: null,
  isRecording: false,
  activeTrackedToken: null,
  pollTimer: null,
  travelMinutes: 15,

  init() {
    this.loadDepartments();
    this.setupSpeechRecognition();
    this.setupForm();
    this.setupTravelSlider();

    // Check if there is a recently saved token in localStorage
    const savedTokenId = localStorage.getItem("baari_last_token_id");
    if (savedTokenId && !this.activeTrackedToken) {
      this.pollTokenStatus(savedTokenId);
    }
  },

  onLangChange() {
    this.renderDepartments();
  },

  async loadDepartments() {
    try {
      const depts = await BaariApp.fetchApi("/api/patient/departments");
      this.departments = depts;
      this.renderDepartments();
    } catch (err) {
      BaariApp.showToast("Failed to load departments", "error");
    }
  },

  renderDepartments() {
    const container = document.getElementById("dept-cards-container");
    if (!container) return;

    if (!this.departments.length) {
      container.innerHTML = `<div style="color:var(--text-muted);">${t("loading")}</div>`;
      return;
    }

    // Default select first department if none selected
    if (!this.selectedDeptId && this.departments.length) {
      this.selectedDeptId = this.departments[0].id;
    }

    container.innerHTML = this.departments
      .map((d) => {
        const isSel = d.id === this.selectedDeptId ? "selected" : "";
        const localizedName = t(`dept_${d.code}`) !== `dept_${d.code}` ? t(`dept_${d.code}`) : d.name;
        return `
        <div class="dept-radio-card ${isSel}" onclick="BaariPatient.selectDept(${d.id})" id="dept-card-${d.id}">
          <div class="dept-card-code">${d.code}</div>
          <div class="dept-card-name">${localizedName}</div>
          <div class="dept-card-est">~${d.avg_service_minutes} ${t("minutes")}/pt</div>
        </div>
      `;
      })
      .join("");
  },

  selectDept(id) {
    this.selectedDeptId = id;
    document.querySelectorAll(".dept-radio-card").forEach((c) => c.classList.remove("selected"));
    const card = document.getElementById(`dept-card-${id}`);
    if (card) card.classList.add("selected");
  },

  // ── Voice Input (Web Speech Recognition + Intent API) ───────────────────
  setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isRecording = true;
      const box = document.getElementById("voice-box");
      const statusText = document.getElementById("voice-status");
      if (box) box.classList.add("recording");
      if (statusText) statusText.textContent = t("voice_mic_recording");
    };

    this.recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      const statusText = document.getElementById("voice-status");
      if (statusText) statusText.textContent = `${t("voice_mic_processing")}: "${transcript}"`;

      try {
        const parsed = await BaariApp.fetchApi("/api/patient/voice/parse-intent", {
          method: "POST",
          body: JSON.stringify({ text: transcript }),
        });

        if (parsed.patient_name) {
          const nameInput = document.getElementById("patient-name");
          if (nameInput) nameInput.value = parsed.patient_name;
        }

        if (parsed.department) {
          this.selectDept(parsed.department.id);
        }

        BaariApp.showToast(`Recognized: ${transcript}`, "info");
      } catch (err) {
        console.error("Intent parsing error:", err);
      }
    };

    this.recognition.onerror = (e) => {
      console.warn("Speech error:", e.error);
      this.stopVoice();
    };

    this.recognition.onend = () => {
      this.stopVoice();
    };
  },

  toggleVoice() {
    if (!this.recognition) {
      BaariApp.showToast("Speech Recognition is not available in your browser. Please type your details.", "info");
      return;
    }

    if (this.isRecording) {
      this.recognition.stop();
      this.stopVoice();
    } else {
      // Pick speech language
      if (currentLang === "mr") this.recognition.lang = "mr-IN";
      else if (currentLang === "hi") this.recognition.lang = "hi-IN";
      else this.recognition.lang = "en-IN";

      try {
        this.recognition.start();
      } catch (e) {
        this.stopVoice();
      }
    }
  },

  stopVoice() {
    this.isRecording = false;
    const box = document.getElementById("voice-box");
    const statusText = document.getElementById("voice-status");
    if (box) box.classList.remove("recording");
    if (statusText) statusText.textContent = t("voice_mic_idle");
  },

  // ── Token Request Form ──────────────────────────────────────────────────
  setupForm() {
    const form = document.getElementById("token-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("patient-name").value.trim();
      const phone = document.getElementById("patient-phone").value.trim();

      if (!name) {
        BaariApp.showToast("Please enter patient name", "error");
        return;
      }
      if (!this.selectedDeptId) {
        BaariApp.showToast("Please select a department", "error");
        return;
      }

      try {
        const token = await BaariApp.fetchApi("/api/patient/token/request", {
          method: "POST",
          body: JSON.stringify({
            name,
            phone: phone || null,
            department_id: this.selectedDeptId,
            language: currentLang,
          }),
        });

        // Store active token in session and show confirmation modal
        localStorage.setItem("baari_last_token_id", token.id);
        this.showTokenConfirmation(token);
        form.reset();
      } catch (err) {
        BaariApp.showToast(err.message, "error");
      }
    });
  },

  // ── Token Confirmation Modal ─────────────────────────────────────────────
  showTokenConfirmation(token) {
    this.activeTrackedToken = token;
    const modal = document.getElementById("token-confirm-modal");
    if (!modal) return;

    document.getElementById("conf-token-num").textContent = token.token_number;
    document.getElementById("conf-patient-name").textContent = token.patient_name;
    document.getElementById("conf-dept-name").textContent = token.department_name;
    document.getElementById("conf-pin").textContent = token.pin || "••••";
    document.getElementById("conf-wait").textContent = `${token.wait_estimate_min || 0} - ${token.wait_estimate_max || 0} ${t("minutes")}`;
    document.getElementById("conf-arrive").textContent = token.arrive_by || "Come now";

    modal.showModal();

    // Auto-read aloud in patient's language
    this.speakTokenDetails(token);
  },

  speakTokenDetails(token = this.activeTrackedToken) {
    if (!token) return;
    let speechText = "";
    if (currentLang === "hi") {
      speechText = `आपका टोकन नंबर है ${token.token_number}. आपका गुप्त पिन है ${token.pin}. कृपया इसे याद रखें। विभाग है ${token.department_name}.`;
    } else if (currentLang === "mr") {
      speechText = `आपला टोकन नंबर आहे ${token.token_number}. आपला गुप्त पिन आहे ${token.pin}. कृपया तो लिहून ठेवा. विभाग आहे ${token.department_name}.`;
    } else {
      speechText = `Your token number is ${token.token_number}. Your secret PIN is ${token.pin}. Please memorize it. Department is ${token.department_name}.`;
    }
    BaariApp.speak(speechText, currentLang);
  },

  closeTokenConfirmation() {
    const modal = document.getElementById("token-confirm-modal");
    if (modal) modal.close();
    // Scroll down to live tracker
    if (this.activeTrackedToken) {
      this.pollTokenStatus(this.activeTrackedToken.id);
    }
  },

  // ── Live Token Tracker ──────────────────────────────────────────────────
  async handleLookup(e) {
    e.preventDefault();
    const tokenNum = document.getElementById("lookup-token-num").value.trim().toUpperCase();
    const pin = document.getElementById("lookup-pin").value.trim();

    if (!tokenNum || !pin) {
      BaariApp.showToast("Please enter both token number and PIN", "error");
      return;
    }

    try {
      const token = await BaariApp.fetchApi("/api/patient/token/lookup", {
        method: "POST",
        body: JSON.stringify({ token_number: tokenNum, pin }),
      });
      this.activeTrackedToken = token;
      this.renderTracker(token);
      this.startPolling(token.id);
      BaariApp.showToast(`Found token ${token.token_number}`, "success");
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  setupTravelSlider() {
    const slider = document.getElementById("travel-slider");
    const valDisplay = document.getElementById("travel-slider-val");
    if (!slider || !valDisplay) return;

    slider.addEventListener("input", (e) => {
      this.travelMinutes = parseInt(e.target.value, 10);
      valDisplay.textContent = `${this.travelMinutes} ${t("minutes")}`;
      if (this.activeTrackedToken) {
        this.renderTracker(this.activeTrackedToken);
      }
    });
  },

  startPolling(tokenId) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.pollTokenStatus(tokenId);
    }, 10000); // 10s poll
  },

  async pollTokenStatus(tokenId) {
    try {
      const token = await BaariApp.fetchApi(`/api/patient/token/${tokenId}/status`);
      const oldStatus = this.activeTrackedToken ? this.activeTrackedToken.status : null;

      // If transition from waiting to called, play chime and notify!
      if (oldStatus === "waiting" && token.status === "called") {
        BaariApp.playAnnouncementChime();
        BaariApp.speak(`Token ${token.token_number}, please proceed to the doctor cabin now!`, currentLang);
        BaariApp.showToast(`🔔 Token ${token.token_number} is now being called!`, "success");
      }

      this.activeTrackedToken = token;
      this.renderTracker(token);
    } catch (err) {
      // Token might be from previous day
      if (this.pollTimer) clearInterval(this.pollTimer);
    }
  },

  renderTracker(token) {
    const card = document.getElementById("live-status-card");
    if (!card) return;
    card.style.display = "block";

    document.getElementById("live-token-num").textContent = token.token_number;
    document.getElementById("live-dept-name").textContent = token.department_name;
    document.getElementById("live-patient-name").textContent = token.patient_name;

    const queuePosEl = document.getElementById("live-queue-pos");
    if (token.status === "waiting" && token.position_in_queue) {
      queuePosEl.textContent = `${token.position_in_queue} people in queue ahead of you`;
    } else {
      queuePosEl.textContent = "";
    }

    // Dynamic travel calculation
    let adviceHtml = "";
    let stepIndex = 1;

    if (token.status === "waiting") {
      const waitMin = token.wait_estimate_min || 0;
      if (waitMin <= this.travelMinutes) {
        adviceHtml = `<div class="badge badge-called" style="font-size:0.95rem; padding:0.5rem 1rem;">${t("status_come_now")}</div>`;
        stepIndex = 3;
      } else {
        const leaveInMin = Math.max(0, waitMin - this.travelMinutes);
        const leaveTime = new Date(Date.now() + leaveInMin * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        adviceHtml = `
          <div style="font-size: 1.1rem; font-weight:700; color:#38bdf8; margin-bottom: 0.35rem;">
            ${t("status_wait_home")} ${token.arrive_by}
          </div>
          <div style="font-size:0.875rem; color:var(--text-muted);">
            Leave home at approximately <strong>${leaveTime}</strong> (${this.travelMinutes} min commute).
          </div>
        `;
        stepIndex = 2;
      }
    } else if (token.status === "called") {
      adviceHtml = `<div class="badge badge-called" style="font-size:1.1rem; padding:0.6rem 1.25rem;">${t("status_called")}</div>`;
      stepIndex = 4;
    } else if (token.status === "done") {
      adviceHtml = `<div class="badge badge-done" style="font-size:1rem; padding:0.5rem 1rem;">${t("status_done")}</div>`;
      stepIndex = 4;
    } else if (token.status === "no_show") {
      adviceHtml = `<div class="badge badge-priority" style="font-size:1rem; padding:0.5rem 1rem;">${t("status_noshow")}</div>`;
      stepIndex = 1;
    }

    document.getElementById("live-advice-box").innerHTML = adviceHtml;

    // Update stepper
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`step-${i}`);
      if (stepEl) {
        stepEl.classList.remove("active", "completed");
        if (i < stepIndex) stepEl.classList.add("completed");
        else if (i === stepIndex) stepEl.classList.add("active");
      }
    }
  },
};
