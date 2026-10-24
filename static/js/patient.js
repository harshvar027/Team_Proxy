/**
 * Baari — static/js/patient.js
 * Patient Kiosk & Registration:
 * 1. Self-Service Token (Voice + typed)
 * 2. Real-time QR Code Scanner (Camera via jsQR + image upload + preset test chips)
 * 3. Token Registration with Name, Phone, Email & Priority Triage
 * 4. Neural Voice readouts of token & arrive-by advice
 * 5. Dynamic Live Token Tracker with travel commute time slider
 */

window.BaariPatient = {
  departments: [],
  selectedDeptId: null,
  qrSelectedDeptId: null,
  recognition: null,
  isRecording: false,
  activeTrackedToken: null,
  pollTimer: null,
  travelMinutes: 15,
  qrScannerStream: null,
  isScanning: false,
  scanAnimFrame: null,
  verifiedHospital: null,

  init() {
    this.loadDepartments();
    this.setupSpeechRecognition();
    this.setupForm();
    this.setupTravelSlider();

    const savedTokenId = localStorage.getItem("baari_last_token_id");
    if (savedTokenId && !this.activeTrackedToken) {
      this.pollTokenStatus(savedTokenId);
    }
  },

  onLangChange() {
    this.renderDepartments();
  },

  // ── Sub-tab Navigation ───────────────────────────────────────────────────
  switchSubTab(tabName) {
    document.querySelectorAll("#view-patient .sub-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-subtab") === tabName);
    });

    document.querySelectorAll("#view-patient .sub-tab-content").forEach((content) => {
      content.classList.remove("active");
    });

    const target = document.getElementById(`subtab-${tabName}`);
    if (target) {
      target.classList.add("active");
    }

    // Manage camera lifecycle
    if (tabName !== "qr-scan" && this.qrScannerStream) {
      this.stopQRScanner();
    }
  },

  // ── Departments ─────────────────────────────────────────────────────────
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
    this._renderDeptCards("dept-cards-container", "selectedDeptId", "BaariPatient.selectDept");
    this._renderDeptCards("qr-dept-cards-container", "qrSelectedDeptId", "BaariPatient.selectQRDept");
  },

  _renderDeptCards(containerId, stateKey, clickFn) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!this.departments.length) {
      container.innerHTML = `<div style="color:var(--text-muted); padding:1rem;">Loading departments...</div>`;
      return;
    }

    if (!this[stateKey] && this.departments.length) {
      this[stateKey] = this.departments[0].id;
    }

    container.innerHTML = this.departments
      .map((d) => {
        const isSel = d.id === this[stateKey] ? "selected" : "";
        const localizedName = typeof t === "function" && t(`dept_${d.code}`) !== `dept_${d.code}` ? t(`dept_${d.code}`) : d.name;
        return `
          <div class="dept-radio-card ${isSel}" onclick="${clickFn}(${d.id})" id="${containerId}-${d.id}">
            <div class="dept-card-code">${d.code}</div>
            <div class="dept-card-name">${localizedName}</div>
            <div class="dept-card-est">~${d.avg_service_minutes} min/patient</div>
          </div>
        `;
      })
      .join("");
  },

  selectDept(id) {
    this.selectedDeptId = id;
    document.querySelectorAll("#dept-cards-container .dept-radio-card").forEach((c) => c.classList.remove("selected"));
    const card = document.getElementById(`dept-cards-container-${id}`);
    if (card) card.classList.add("selected");
  },

  selectQRDept(id) {
    this.qrSelectedDeptId = id;
    document.querySelectorAll("#qr-dept-cards-container .dept-radio-card").forEach((c) => c.classList.remove("selected"));
    const card = document.getElementById(`qr-dept-cards-container-${id}`);
    if (card) card.classList.add("selected");
  },

  // ── Voice Input Kiosk ───────────────────────────────────────────────────
  setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    this.recognition = new SpeechRec();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isRecording = true;
      const box = document.getElementById("voice-box");
      const statusText = document.getElementById("voice-status");
      if (box) box.classList.add("recording");
      if (statusText) statusText.textContent = typeof t === "function" ? t("voice_mic_recording") : "Listening... Speak now";
    };

    this.recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      const statusText = document.getElementById("voice-status");
      if (statusText) statusText.textContent = `Recognized: "${transcript}"`;

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

        BaariApp.showToast(`Understood: ${parsed.patient_name || ""} (${parsed.department?.name || "General"})`, "success");
      } catch (err) {
        console.error("Intent parsing error:", err);
      }
    };

    this.recognition.onerror = () => this.stopVoice();
    this.recognition.onend = () => this.stopVoice();
  },

  toggleVoice() {
    if (!this.recognition) {
      BaariApp.showToast("Speech Recognition not supported in this browser. Please type details.", "info");
      return;
    }

    if (this.isRecording) {
      this.recognition.stop();
      this.stopVoice();
    } else {
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
    if (statusText) statusText.textContent = typeof t === "function" ? t("voice_mic_idle") : "Tap to Speak (Voice Token)";
  },

  // ── Standard Token Request ──────────────────────────────────────────────
  setupForm() {
    const form = document.getElementById("token-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("patient-name").value.trim();
      const phone = document.getElementById("patient-phone").value.trim();
      const email = document.getElementById("patient-email") ? document.getElementById("patient-email").value.trim() : null;
      const priorityClass = document.getElementById("patient-priority") ? document.getElementById("patient-priority").value : "normal";
      const priorityReason = document.getElementById("patient-priority-reason") ? document.getElementById("patient-priority-reason").value.trim() : null;

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
            email: email || null,
            department_id: this.selectedDeptId,
            priority_class: priorityClass,
            priority_reason: priorityClass !== "normal" ? priorityReason || "Priority triage" : null,
            language: currentLang,
          }),
        });

        localStorage.setItem("baari_last_token_id", token.id);
        this.showTokenConfirmation(token);
        form.reset();
      } catch (err) {
        BaariApp.showToast(err.message, "error");
      }
    });
  },

  // ── QR Scanner & Registration ───────────────────────────────────────────
  async startQRScanner() {
    const video = document.getElementById("qr-scanner-video");
    const canvas = document.getElementById("qr-scanner-canvas");
    const container = document.getElementById("qr-viewfinder");
    const startBtn = document.getElementById("qr-scan-start-btn");

    if (!video || !canvas) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      this.qrScannerStream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      this.isScanning = true;
      if (container) container.classList.add("camera-active");
      if (startBtn) startBtn.style.display = "none";

      const stopBtn = document.getElementById("qr-scan-stop-btn");
      if (stopBtn) stopBtn.style.display = "inline-flex";

      const laser = document.getElementById("qr-scanner-laser");
      if (laser) laser.style.display = "block";

      this._scanLoop();
      BaariApp.showToast("Camera active. Point at any hospital QR code.", "info");
    } catch (err) {
      BaariApp.showToast("Camera access was not granted. You can use the Demo Test Chips or enter code below.", "warning");
    }
  },

  _scanLoop() {
    if (!this.isScanning || !this.qrScannerStream) return;

    const video = document.getElementById("qr-scanner-video");
    const canvas = document.getElementById("qr-scanner-canvas");
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (window.jsQR) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          BaariApp.playScanBeep();
          this.handleDecodedQR(code.data);
          this.stopQRScanner();
          return;
        }
      }
    }

    this.scanAnimFrame = requestAnimationFrame(() => this._scanLoop());
  },

  stopQRScanner() {
    this.isScanning = false;
    if (this.scanAnimFrame) {
      cancelAnimationFrame(this.scanAnimFrame);
      this.scanAnimFrame = null;
    }
    if (this.qrScannerStream) {
      this.qrScannerStream.getTracks().forEach((track) => track.stop());
      this.qrScannerStream = null;
    }

    const container = document.getElementById("qr-viewfinder");
    if (container) container.classList.remove("camera-active");

    const startBtn = document.getElementById("qr-scan-start-btn");
    if (startBtn) startBtn.style.display = "inline-flex";

    const stopBtn = document.getElementById("qr-scan-stop-btn");
    if (stopBtn) stopBtn.style.display = "none";

    const laser = document.getElementById("qr-scanner-laser");
    if (laser) laser.style.display = "none";
  },

  handleQRImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        if (window.jsQR) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data) {
            BaariApp.playScanBeep();
            this.handleDecodedQR(code.data);
          } else {
            BaariApp.showToast("Could not detect a valid QR code in this image", "warning");
          }
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  handleDecodedQR(qrText) {
    let hospitalName = "District Civil Hospital (Main OPD)";
    let hospitalCode = "BAARI-CIVIL-001";
    let deptId = null;

    try {
      // Check if it's a URL
      if (qrText.startsWith("http://") || qrText.startsWith("https://") || qrText.includes("?")) {
        const parsedUrl = new URL(qrText.startsWith("http") ? qrText : `http://localhost/${qrText}`);
        hospitalName = parsedUrl.searchParams.get("hospital") || hospitalName;
        hospitalCode = parsedUrl.searchParams.get("code") || hospitalCode;
        deptId = parsedUrl.searchParams.get("dept");
      } else if (qrText.startsWith("{")) {
        // Check if JSON
        const data = JSON.parse(qrText);
        hospitalName = data.hospital || hospitalName;
        hospitalCode = data.code || hospitalCode;
        deptId = data.dept_id;
      } else {
        hospitalCode = qrText.trim();
        hospitalName = `Hospital [${hospitalCode}]`;
      }
    } catch (e) {
      hospitalCode = qrText.trim();
    }

    this.applyScannedHospital(hospitalName, hospitalCode, deptId);
  },

  applyScannedHospital(name, code, deptId = null) {
    this.verifiedHospital = { name, code };

    const banner = document.getElementById("qr-verified-card");
    if (banner) banner.style.display = "flex";

    const nameEl = document.getElementById("qr-hospital-name-display");
    if (nameEl) nameEl.textContent = name;

    const codeEl = document.getElementById("qr-hospital-code-display");
    if (codeEl) codeEl.textContent = `Hospital Code: ${code}`;

    const regForm = document.getElementById("qr-registration-section");
    if (regForm) {
      regForm.style.display = "block";
      regForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    this.renderDepartments();
    if (deptId) {
      this.selectQRDept(parseInt(deptId, 10));
    }

    BaariApp.showToast(`Verified Hospital: ${name}`, "success");
  },

  // Preset demo chips for instant testing
  testScanPreset(hospitalName, hospitalCode, deptCode) {
    BaariApp.playScanBeep();
    let deptId = 1;
    if (deptCode === "O") deptId = 2;
    else if (deptCode === "Y") deptId = 3;
    else if (deptCode === "P") deptId = 4;

    this.applyScannedHospital(hospitalName, hospitalCode, deptId);
  },

  lookupHospitalCode() {
    const input = document.getElementById("manual-hospital-code");
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) {
      BaariApp.showToast("Please enter a valid hospital code", "error");
      return;
    }

    BaariApp.playScanBeep();
    this.applyScannedHospital(`Civil Hospital (${code})`, code, 1);
  },

  // ── Handle QR Form Registration ─────────────────────────────────────────
  async handleQRRegistration(e) {
    e.preventDefault();

    const name = document.getElementById("qr-patient-name").value.trim();
    const phone = document.getElementById("qr-patient-phone").value.trim();
    const email = document.getElementById("qr-patient-email").value.trim();
    const priority = document.getElementById("qr-patient-priority").value;
    const priorityReason = document.getElementById("qr-patient-reason") ? document.getElementById("qr-patient-reason").value.trim() : null;

    if (!name) {
      BaariApp.showToast("Please enter patient name", "error");
      return;
    }
    if (!phone) {
      BaariApp.showToast("Please enter 10-digit phone number", "error");
      return;
    }
    if (!this.qrSelectedDeptId) {
      BaariApp.showToast("Please select an OPD Department", "error");
      return;
    }

    try {
      const token = await BaariApp.fetchApi("/api/patient/token/request", {
        method: "POST",
        body: JSON.stringify({
          name,
          phone,
          email: email || null,
          department_id: this.qrSelectedDeptId,
          priority_class: priority,
          priority_reason: priority !== "normal" ? priorityReason || "QR Registered Priority" : null,
          hospital_code: this.verifiedHospital ? this.verifiedHospital.code : "QR-SCAN",
          language: currentLang,
        }),
      });

      localStorage.setItem("baari_last_token_id", token.id);
      this.showTokenConfirmation(token);

      // Reset QR form
      document.getElementById("qr-token-form").reset();
      this.stopQRScanner();
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
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
    document.getElementById("conf-wait").textContent = `${token.wait_estimate_min || 0} - ${token.wait_estimate_max || 0} min`;
    document.getElementById("conf-arrive").textContent = token.arrive_by || "Come now";

    modal.showModal();

    // Natural Neural Voice Audio Announcement
    this.speakTokenDetails(token);
  },

  speakTokenDetails(token = this.activeTrackedToken) {
    if (!token) return;
    let speechText = "";
    if (currentLang === "hi") {
      speechText = `नमस्ते ${token.patient_name}, आपका टोकन नंबर ${token.token_number} जारी हो गया है। आपका गुप्त पिन ${token.pin} है। कृपया ${token.arrive_by || "तुरंत"} अस्पताल पहुंचे।`;
    } else if (currentLang === "mr") {
      speechText = `नमस्कार ${token.patient_name}, आपला टोकन क्रमांक ${token.token_number} आहे. आपला पिन ${token.pin} आहे. कृपया ${token.arrive_by || "लगेच"} उपस्थित राहावे.`;
    } else {
      speechText = `Hello ${token.patient_name}. Your token number is ${token.token_number}. Your secret PIN is ${token.pin}. Please arrive at the hospital by ${token.arrive_by || "now"}.`;
    }
    BaariApp.speak(speechText, currentLang);
  },

  closeTokenConfirmation() {
    const modal = document.getElementById("token-confirm-modal");
    if (modal) modal.close();

    if (this.activeTrackedToken) {
      this.switchSubTab("track-status");
      this.renderTracker(this.activeTrackedToken);
      this.startPolling(this.activeTrackedToken.id);
    }
  },

  // ── Live Token Tracker ──────────────────────────────────────────────────
  async handleLookup(e, isTrackTab = false) {
    e.preventDefault();

    let tokenNum, pin;
    if (isTrackTab) {
      tokenNum = document.getElementById("track-token-num").value.trim().toUpperCase();
      pin = document.getElementById("track-pin").value.trim();
    } else {
      tokenNum = document.getElementById("lookup-token-num").value.trim().toUpperCase();
      pin = document.getElementById("lookup-pin").value.trim();
    }

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

      if (isTrackTab) {
        this._renderTrackTabResult(token);
      }
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  _renderTrackTabResult(token) {
    const container = document.getElementById("track-status-result");
    const content = document.getElementById("track-status-content");
    if (!container || !content) return;
    container.style.display = "block";

    let statusBadge = '<span class="badge badge-waiting">Waiting</span>';
    let adviceHtml = "";

    if (token.status === "waiting") {
      const waitMin = token.wait_estimate_min || 0;
      if (waitMin <= this.travelMinutes) {
        adviceHtml = `<div class="badge badge-called" style="font-size:1rem; padding:0.6rem 1.2rem;">🏃 Come to hospital NOW! (Commute ~${this.travelMinutes}m)</div>`;
      } else {
        adviceHtml = `
          <div style="font-size:1.15rem; font-weight:800; color:#818cf8; margin-bottom:0.3rem;">
            🏠 Stay home until ${token.arrive_by}
          </div>
          <div style="font-size:0.85rem; color:var(--text-muted);">
            Estimated wait in queue: ${waitMin} - ${token.wait_estimate_max || 0} minutes
          </div>
        `;
      }
    } else if (token.status === "called") {
      statusBadge = '<span class="badge badge-called">Currently Being Called</span>';
      adviceHtml = `<div class="badge badge-called" style="font-size:1.1rem; padding:0.6rem 1.2rem;">🔔 YOUR TURN NOW! Proceed to doctor cabin!</div>`;
    } else if (token.status === "done") {
      statusBadge = '<span class="badge badge-done">Consultation Completed</span>';
      adviceHtml = `<div class="badge badge-done" style="font-size:1rem; padding:0.5rem 1rem;">✓ Visit finished today</div>`;
    }

    content.innerHTML = `
      <div class="card" style="text-align:center;">
        <div class="token-hero-badge" style="margin-bottom:1.25rem;">
          <div style="font-size:0.8rem; font-weight:700; color:var(--text-muted);">TOKEN NUMBER</div>
          <div class="token-big-num">${token.token_number}</div>
          <div style="font-weight:700; font-size:1.15rem; color:var(--text-main);">${token.patient_name}</div>
          <div style="color:var(--text-muted); font-size:0.88rem;">${token.department_name}</div>
        </div>
        <div style="margin-bottom:1rem;">${statusBadge}</div>
        ${token.position_in_queue ? `<div style="font-size:0.95rem; font-weight:700; color:#34d399; margin-bottom:0.75rem;">👥 ${token.position_in_queue} patient(s) ahead of you</div>` : ""}
        <div style="margin-top:1rem; padding:1.25rem; background:var(--bg-glass); border-radius:var(--radius-lg); border:1px solid var(--border-subtle);">${adviceHtml}</div>
        <button class="btn btn-secondary" style="margin-top:1.25rem;" onclick="BaariPatient.speakTokenDetails(BaariPatient.activeTrackedToken)">
          🔊 Read Status Aloud
        </button>
      </div>
    `;
  },

  setupTravelSlider() {
    const slider = document.getElementById("travel-slider");
    const valDisplay = document.getElementById("travel-slider-val");
    if (!slider || !valDisplay) return;

    slider.addEventListener("input", (e) => {
      this.travelMinutes = parseInt(e.target.value, 10);
      valDisplay.textContent = `${this.travelMinutes} min`;
      if (this.activeTrackedToken) {
        this.renderTracker(this.activeTrackedToken);
        if (document.getElementById("track-status-result").style.display !== "none") {
          this._renderTrackTabResult(this.activeTrackedToken);
        }
      }
    });
  },

  startPolling(tokenId) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.pollTokenStatus(tokenId);
    }, 8000);
  },

  async pollTokenStatus(tokenId) {
    try {
      const token = await BaariApp.fetchApi(`/api/patient/token/${tokenId}/status`);
      const oldStatus = this.activeTrackedToken ? this.activeTrackedToken.status : null;

      if (oldStatus === "waiting" && token.status === "called") {
        BaariApp.playAnnouncementChime();
        BaariApp.speak(`Attention! Token ${token.token_number}, please proceed to the doctor cabin now!`, currentLang);
        BaariApp.showToast(`🔔 Token ${token.token_number} is being called!`, "success");
      }

      this.activeTrackedToken = token;
      this.renderTracker(token);
    } catch (err) {
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
      queuePosEl.textContent = `${token.position_in_queue} people ahead of you`;
    } else {
      queuePosEl.textContent = "";
    }

    let adviceHtml = "";
    let stepIndex = 1;

    if (token.status === "waiting") {
      const waitMin = token.wait_estimate_min || 0;
      if (waitMin <= this.travelMinutes) {
        adviceHtml = `
          <div style="font-size: 1.15rem; font-weight:800; color:#34d399; margin-bottom: 0.35rem;">
            🏃 Leave for hospital NOW!
          </div>
          <div style="font-size:0.85rem; color:var(--text-muted);">
            Estimated wait is ${waitMin} min, matching your commute time.
          </div>
        `;
        stepIndex = 3;
      } else {
        const leaveInMin = Math.max(0, waitMin - this.travelMinutes);
        const leaveTime = new Date(Date.now() + leaveInMin * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        adviceHtml = `
          <div style="font-size: 1.15rem; font-weight:800; color:#818cf8; margin-bottom: 0.35rem;">
            🏠 Stay home until ${token.arrive_by}
          </div>
          <div style="font-size:0.85rem; color:var(--text-muted);">
            Leave home at ~<strong>${leaveTime}</strong> (${this.travelMinutes} min commute)
          </div>
        `;
        stepIndex = 2;
      }
    } else if (token.status === "called") {
      adviceHtml = `
        <div style="font-size: 1.25rem; font-weight:900; color:#fbbf24; margin-bottom: 0.35rem;">
          🔔 YOUR TURN NOW!
        </div>
        <div style="font-size:0.88rem; color:var(--text-main);">
          Please proceed into the doctor's consultation cabin immediately.
        </div>
      `;
      stepIndex = 4;
    } else if (token.status === "done") {
      adviceHtml = `
        <div style="font-size: 1.15rem; font-weight:800; color:#34d399; margin-bottom: 0.35rem;">
          ✓ Visit Completed
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted);">
          Thank you for using Baari. Get well soon!
        </div>
      `;
      stepIndex = 4;
    }

    document.getElementById("live-advice-box").innerHTML = adviceHtml;

    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`step-${i}`);
      if (stepEl) {
        stepEl.classList.toggle("completed", i < stepIndex);
        stepEl.classList.toggle("active", i === stepIndex);
      }
    }
  },
};
