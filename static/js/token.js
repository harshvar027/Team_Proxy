import { api } from "./api.js";
import { checkAuth, syncAccount } from "./auth.js";
import { getLanguage, t } from "./i18n.js";
import { bindHospitalQr } from "./qr.js";
import { copyText, el, setLoading, shake, toast } from "./ui.js";

function bindOffline() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  const sync = () => { banner.hidden = navigator.onLine; };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();
}

function speechEngine() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function parseTime(label) {
  const match = String(label).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ap = match[3];
  if (ap) {
    const pm = ap.toUpperCase() === "PM";
    if (pm && hours < 12) hours += 12;
    if (!pm && hours === 12) hours = 0;
  }
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function boot() {
  bindOffline();
  const { user } = await checkAuth();
  syncAccount(user);

  // Parse URL parameters (e.g. from scanned Hospital QR code)
  const urlParams = new URLSearchParams(location.search);
  let hospitalId = urlParams.get("hospital_id") ? Number(urlParams.get("hospital_id")) : null;

  // DOM elements
  const hospitalSelect = document.getElementById("hospital-select");
  const bannerHName = document.getElementById("banner-h-name");
  const bannerHLoc = document.getElementById("banner-h-loc");
  const bannerCoordLink = document.getElementById("banner-coord-link");
  const bannerCoordPhone = document.getElementById("banner-coord-phone");
  const deptHelpPhone = document.getElementById("dept-help-phone");

  const aiTextInput = document.getElementById("ai-text-input");
  const micAiBtn = document.getElementById("mic-ai");
  const btnAiTriage = document.getElementById("btn-ai-triage");
  const aiResultPanel = document.getElementById("ai-result-panel");
  const aiResultText = document.getElementById("ai-result-text");
  const aiResultReason = document.getElementById("ai-result-reason");

  const nameInput = document.getElementById("patient-name");
  const phoneInput = document.getElementById("patient-phone");
  const symptomsInput = document.getElementById("symptoms-reason");
  const deptSelect = document.getElementById("department");
  const deptCardsGrid = document.getElementById("dept-cards-grid");
  const skeleton = document.getElementById("dept-skeleton");

  const confirmHospital = document.getElementById("confirm-hospital");
  const confirmName = document.getElementById("confirm-name");
  const confirmPriority = document.getElementById("confirm-priority");
  const confirmPriorityBadge = document.getElementById("confirm-priority-badge");
  const confirmSymptoms = document.getElementById("confirm-symptoms");
  const confirmDept = document.getElementById("confirm-dept");
  const confirmCoord = document.getElementById("confirm-coord");
  const yesBtn = document.getElementById("confirm-yes");

  const issuedNumber = document.getElementById("issued-number");
  const arriveTime = document.getElementById("arrive-time");
  const waitRange = document.getElementById("wait-range");
  const issuedPin = document.getElementById("issued-pin");
  const statusLink = document.getElementById("status-link");
  const issuedPriorityChip = document.getElementById("issued-priority-chip");
  const issuedCoordName = document.getElementById("issued-coord-name");
  const issuedHLoc = document.getElementById("issued-h-loc");
  const issuedCoordCall = document.getElementById("issued-coord-call");

  let selectedPriority = "daily_life"; // emergency, daily_life, routine
  let step = 0;
  let issued = null;
  let hospitalData = null;
  let listening = null;
  let currentDepartments = [];
  let hospitalList = [];
  const hospitalChipRow = document.getElementById("hospital-chip-row");

  function paintHospitalChips() {
    if (!hospitalChipRow) return;
    hospitalChipRow.innerHTML = "";
    hospitalList.forEach((h) => {
      const selected = String(h.id) === String(hospitalId);
      const chip = el("button", {
        type: "button",
        class: `hospital-chip${selected ? " is-selected" : ""}`,
        "data-hospital-id": String(h.id),
      }, [
        el("strong", { text: h.name }),
        el("span", { text: `${h.location || "Clinic"} · ${h.coordinator_phone || "Helpline on file"}` }),
      ]);
      chip.addEventListener("click", async () => {
        hospitalId = Number(h.id);
        if (hospitalSelect) hospitalSelect.value = String(hospitalId);
        hospitalSelect?.dispatchEvent(new Event("change"));
      });
      hospitalChipRow.append(chip);
    });
  }

  // Pre-fill user data if logged in
  if (user) {
    if (user.full_name) nameInput.value = user.full_name;
    else if (user.username && user.role === "patient") nameInput.value = user.username;
    if (user.phone) phoneInput.value = user.phone;
    if (user.hospital_id && !hospitalId) hospitalId = user.hospital_id;
  }

  // Helper icons and subtitles for department cards
  function getDeptMeta(name, code = "") {
    const n = name.toLowerCase();
    const c = String(code).toUpperCase();
    if (n.includes("general") || c.startsWith("G")) {
      return { icon: "🩺", desc: "Fever, cold, infection, BP, primary consultation" };
    }
    if (n.includes("ortho") || c.startsWith("O")) {
      return { icon: "🦴", desc: "Joints, bones, fractures, sprains, spine clinic" };
    }
    if (n.includes("gynec") || c.startsWith("Y")) {
      return { icon: "🌸", desc: "Women's health, maternity, prenatal & pelvic care" };
    }
    if (n.includes("pediat") || c.startsWith("P")) {
      return { icon: "👶", desc: "Infant, child fever, pediatric checkup & vaccines" };
    }
    return { icon: "🏥", desc: "Specialized outpatient department consultation" };
  }

  // Render department interactive visual cards
  function renderDeptCards(deptList, activeDeptId) {
    if (!deptCardsGrid) return;
    deptCardsGrid.innerHTML = "";
    deptList.forEach((d) => {
      const meta = getDeptMeta(d.name, d.code);
      const isSelected = String(d.id) === String(activeDeptId);
      const card = el("div", {
        class: `dept-card ${isSelected ? "is-selected" : ""}`,
        "data-dept-id": String(d.id),
        "data-dept-code": d.code || "",
      }, [
        el("div", { class: "dept-card-icon", text: meta.icon }),
        el("div", { class: "dept-card-title", text: d.name }),
        el("div", { class: "dept-card-desc", text: meta.desc }),
      ]);

      card.addEventListener("click", () => {
        selectDepartment(d.id);
      });

      deptCardsGrid.append(card);
    });
  }

  function selectDepartment(deptId) {
    const valStr = String(deptId);
    deptSelect.value = valStr;

    // Update active card style
    if (deptCardsGrid) {
      deptCardsGrid.querySelectorAll(".dept-card").forEach((c) => {
        const match = c.getAttribute("data-dept-id") === valStr;
        c.classList.toggle("is-selected", match);
      });
    }

    // Update confirmation readback text
    const selectedOpt = deptSelect.options[deptSelect.selectedIndex];
    if (selectedOpt && confirmDept) {
      confirmDept.textContent = selectedOpt.text;
    }
  }

  // Sync when user changes native select dropdown
  deptSelect.addEventListener("change", () => {
    selectDepartment(deptSelect.value);
  });

  // Load departments for the specified hospital
  async function loadDepartments(hId) {
    if (skeleton) {
      skeleton.hidden = false;
      skeleton.style.display = "block";
    }

    const depts = await api.departments(hId);

    if (skeleton) {
      skeleton.hidden = true;
      skeleton.style.display = "none";
    }

    if (depts.ok && depts.data && depts.data.length > 0) {
      currentDepartments = depts.data;
    } else {
      currentDepartments = [];
      toast("Could not load departments for this hospital. Refresh and try again.");
      return;
    }

    // Populate native select dropdown
    deptSelect.innerHTML = "";
    currentDepartments.forEach((d) => {
      const opt = new Option(d.name, String(d.id));
      opt.setAttribute("data-code", d.code || "");
      deptSelect.add(opt);
    });

    const initialDeptId = currentDepartments[0].id;
    renderDeptCards(currentDepartments, initialDeptId);
    selectDepartment(initialDeptId);
  }

  // Load hospital information and populate hospital selector
  async function loadHospital() {
    let res;
    const hList = await api.hospitals();
    if (hList.ok && hList.data?.length) {
      hospitalList = hList.data;
      const liveCount = document.getElementById("live-hospital-count");
      if (liveCount) liveCount.textContent = String(hospitalList.length);
      paintHospitalChips();
      if (hospitalSelect) {
        hospitalSelect.innerHTML = "";
        hList.data.forEach((h) => {
          hospitalSelect.add(new Option(h.name, String(h.id)));
        });
      }

      if (hospitalId) {
        if (hospitalSelect) hospitalSelect.value = String(hospitalId);
        res = await api.hospitalInfo(hospitalId);
      } else {
        hospitalId = hList.data[0].id;
        if (hospitalSelect) hospitalSelect.value = String(hospitalId);
        res = { ok: true, data: hList.data[0] };
      }
    } else if (hospitalId) {
      res = await api.hospitalInfo(hospitalId);
    }

    if (res && res.ok && res.data) {
      hospitalData = res.data;
      bannerHName.textContent = hospitalData.name;
      bannerHLoc.textContent = `${hospitalData.location} • Coordinator: ${hospitalData.coordinator_name}`;
      bannerCoordPhone.textContent = hospitalData.coordinator_phone;
      bannerCoordLink.href = `tel:${hospitalData.coordinator_phone.replace(/\s+/g, "")}`;
      deptHelpPhone.textContent = hospitalData.coordinator_phone;
      deptHelpPhone.href = `tel:${hospitalData.coordinator_phone.replace(/\s+/g, "")}`;
      confirmHospital.textContent = hospitalData.name;
      confirmCoord.textContent = `${hospitalData.coordinator_name} (${hospitalData.coordinator_phone})`;
      paintHospitalChips();
    }

    await loadDepartments(hospitalId);
  }

  if (hospitalSelect) {
    hospitalSelect.addEventListener("change", async () => {
      hospitalId = Number(hospitalSelect.value);
      const infoRes = await api.hospitalInfo(hospitalId);
      if (infoRes.ok && infoRes.data) {
        hospitalData = infoRes.data;
        bannerHName.textContent = hospitalData.name;
        bannerHLoc.textContent = `${hospitalData.location} • Coordinator: ${hospitalData.coordinator_name}`;
        bannerCoordPhone.textContent = hospitalData.coordinator_phone;
        bannerCoordLink.href = `tel:${hospitalData.coordinator_phone.replace(/\s+/g, "")}`;
        deptHelpPhone.textContent = hospitalData.coordinator_phone;
        deptHelpPhone.href = `tel:${hospitalData.coordinator_phone.replace(/\s+/g, "")}`;
        confirmHospital.textContent = hospitalData.name;
        confirmCoord.textContent = `${hospitalData.coordinator_name} (${hospitalData.coordinator_phone})`;
        paintHospitalChips();
      }
      await loadDepartments(hospitalId);
    });
  }

  await loadHospital();

  // Priority Card Selection
  const priorityCards = [
    document.getElementById("card-emergency"),
    document.getElementById("card-daily"),
    document.getElementById("card-routine"),
  ];

  function setPrioritySelection(pClass) {
    selectedPriority = pClass;
    priorityCards.forEach((card) => {
      if (!card) return;
      const isMatch = card.getAttribute("data-priority") === pClass;
      card.classList.toggle("is-selected", isMatch);
    });
  }

  priorityCards.forEach((card) => {
    if (!card) return;
    card.addEventListener("click", () => {
      const p = card.getAttribute("data-priority");
      setPrioritySelection(p);
    });
  });

  // AI Triage Assistant Execution
  async function runAiTriage() {
    const text = aiTextInput.value.trim();
    if (text.length < 3) {
      shake(aiTextInput);
      return;
    }

    setLoading(btnAiTriage, true);
    const res = await api.aiTriage({
      text,
      language: getLanguage(),
      hospital_id: hospitalId,
    });
    setLoading(btnAiTriage, false);

    if (res.ok && res.data) {
      const { detected_name, symptoms, priority_class, priority_label, suggested_department_id, triage_reason } = res.data;

      // Auto-fill extracted name
      if (detected_name && (!nameInput.value || nameInput.value.trim().length < 2)) {
        nameInput.value = detected_name;
      }

      // Auto-fill symptoms
      symptomsInput.value = symptoms || text;

      // Auto-select priority
      setPrioritySelection(priority_class);

      if (suggested_department_id) {
        selectDepartment(suggested_department_id);
      }

      // Show friendly AI feedback
      aiResultPanel.hidden = false;
      aiResultText.textContent = `${priority_label} → Department: ${deptSelect.options[deptSelect.selectedIndex]?.text || "General"}`;
      aiResultReason.textContent = triage_reason;

      // Pulse highlight
      shake(aiResultPanel);
    }
  }

  btnAiTriage.addEventListener("click", runAiTriage);
  aiTextInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runAiTriage();
    }
  });

  // Speech Recognition for AI Assistant
  micAiBtn.addEventListener("click", () => {
    if (listening) {
      listening.stop();
      return;
    }
    const rec = speechEngine();
    if (!rec) {
      aiTextInput.focus();
      return;
    }
    rec.lang = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[getLanguage()] || "en-IN";
    rec.interimResults = false;
    rec.onstart = () => {
      micAiBtn.classList.add("is-listening");
    };
    rec.onend = () => {
      listening = null;
      micAiBtn.classList.remove("is-listening");
    };
    rec.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript || "";
      if (said) {
        aiTextInput.value = said;
        runAiTriage();
      }
    };
    listening = rec;
    rec.start();
  });

  // Wizard Step Navigation
  const showStep = (index) => {
    step = index;
    document.querySelectorAll(".wizard-step").forEach((node) => {
      node.classList.toggle("is-visible", Number(node.getAttribute("data-step")) === index);
    });
    document.querySelectorAll("[data-progress]").forEach((bar) => {
      bar.classList.toggle("is-on", Number(bar.getAttribute("data-progress")) <= index);
    });

    if (index === 0) nameInput.focus();
    if (index === 2) deptSelect.focus();
    if (index === 3) {
      // Build confirmation screen
      confirmName.textContent = nameInput.value.trim();
      const labels = {
        emergency: "Emergency / Critical (Level 1)",
        daily_life: "Daily Life Problem / Urgent (Level 2)",
        routine: "Routine / Checkup (Level 3)",
      };
      confirmPriorityBadge.textContent = labels[selectedPriority] || selectedPriority;
      confirmPriorityBadge.className = `badge badge-${selectedPriority === "emergency" ? "danger" : selectedPriority === "daily_life" ? "warning" : "primary"}`;
      confirmSymptoms.textContent = symptomsInput.value.trim() || "General consultation";
      confirmDept.textContent = deptSelect.options[deptSelect.selectedIndex]?.text || "General Medicine";
    }
  };

  document.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (step === 0) {
        if (nameInput.value.trim().length < 2) {
          document.getElementById("name-message").textContent = "Please enter patient full name.";
          document.getElementById("name-message").classList.add("is-on");
          shake(nameInput.closest(".field"));
          return;
        }
      }
      if (step === 2 && !deptSelect.value) return;
      showStep(step + 1);
    });
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showStep(Math.max(0, step - 1)));
  });

  // Final Token Generation
  yesBtn.addEventListener("click", async () => {
    setLoading(yesBtn, true);
    const res = await api.requestToken({
      name: nameInput.value.trim(),
      phone: phoneInput.value.trim() || null,
      department_id: Number(deptSelect.value),
      hospital_id: hospitalId,
      priority_class: selectedPriority,
      priority_reason: symptomsInput.value.trim() || (selectedPriority !== "routine" ? "Priority triage" : null),
      symptoms: symptomsInput.value.trim() || null,
      language: getLanguage(),
    });
    setLoading(yesBtn, false);

    if (!res.ok) {
      shake(yesBtn);
      toast(res.error || "Unable to generate token. Please try again.");
      return;
    }

    issued = res.data;
    issuedNumber.textContent = issued.token_number;
    issuedPin.textContent = issued.pin || "";
    try {
      sessionStorage.setItem("baari.lastToken", JSON.stringify({ id: issued.id, pin: issued.pin, number: issued.token_number }));
    } catch {
      /* private mode */
    }
    arriveTime.textContent = issued.arrive_by || "Come now";
    waitRange.textContent = `Expected Wait: ${issued.wait_estimate_min || 0}–${issued.wait_estimate_max || 10} minutes`;
    statusLink.href = `status.html?id=${encodeURIComponent(issued.id)}`;

    // Priority chip
    const pBadges = {
      emergency: '<span class="badge badge-danger" style="font-size:13px;padding:4px 12px">🚨 Emergency Priority (Level 1)</span>',
      daily_life: '<span class="badge badge-warning" style="font-size:13px;padding:4px 12px">⚡ Daily Life Urgent (Level 2)</span>',
      routine: '<span class="badge badge-primary" style="font-size:13px;padding:4px 12px">🩺 Routine Checkup (Level 3)</span>',
    };
    issuedPriorityChip.innerHTML = pBadges[issued.priority_class] || "";

    // Coordinator contact card on issued screen
    if (issued.coordinator_name && issued.coordinator_phone) {
      issuedCoordName.textContent = issued.coordinator_name;
      issuedCoordCall.href = `tel:${issued.coordinator_phone.replace(/\s+/g, "")}`;
      issuedCoordCall.querySelector("span").textContent = `Call ${issued.coordinator_phone}`;
    }
    if (issued.hospital_location) {
      issuedHLoc.textContent = issued.hospital_location;
    }

    showStep(4);
  });

  document.getElementById("copy-pin").addEventListener("click", () => {
    copyText(issuedPin.textContent, "PIN copied!");
  });

  bindHospitalQr({
    statusEl: document.getElementById("qr-scan-status"),
    videoEl: document.getElementById("qr-video"),
    canvasEl: document.getElementById("qr-canvas"),
    wrapEl: document.getElementById("qr-video-wrap"),
    startBtn: document.getElementById("btn-scan-qr"),
    stopBtn: document.getElementById("btn-stop-scan"),
    fileInput: document.getElementById("qr-file-input"),
    onHospital: async (parsedId, setStatus) => {
      hospitalId = Number(parsedId);
      if (hospitalSelect) hospitalSelect.value = String(hospitalId);
      const infoRes = await api.hospitalInfo(hospitalId);
      if (infoRes.ok && infoRes.data) {
        hospitalData = infoRes.data;
        bannerHName.textContent = hospitalData.name;
        bannerHLoc.textContent = `${hospitalData.location} • Coordinator: ${hospitalData.coordinator_name}`;
        bannerCoordPhone.textContent = hospitalData.coordinator_phone;
        bannerCoordLink.href = `tel:${hospitalData.coordinator_phone.replace(/\s+/g, "")}`;
        deptHelpPhone.textContent = hospitalData.coordinator_phone;
        deptHelpPhone.href = `tel:${hospitalData.coordinator_phone.replace(/\s+/g, "")}`;
        confirmHospital.textContent = hospitalData.name;
        confirmCoord.textContent = `${hospitalData.coordinator_name} (${hospitalData.coordinator_phone})`;
        paintHospitalChips();
        setStatus(`Linked to ${hospitalData.name}. Continue with check-in.`);
      } else {
        setStatus(infoRes.error || "Hospital not found for that QR.");
        return false;
      }
      await loadDepartments(hospitalId);
      return true;
    },
  });
}

document.addEventListener("DOMContentLoaded", boot);
