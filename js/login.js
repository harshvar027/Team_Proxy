import { api } from "./api.js";
import { requireGuest, homeFor } from "./auth.js";
import { t } from "./i18n.js";
import { bindHospitalQr } from "./qr.js";
import { setLoading, shake } from "./ui.js";

function formatClock(total) {
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function setError(node, message) {
  node.textContent = message;
}

async function boot() {
  const allowed = await requireGuest();
  if (!allowed) return;

  const form = document.getElementById("login-form");
  const username = document.getElementById("username");
  const password = document.getElementById("password");
  const toggle = document.getElementById("toggle-password");
  const caps = document.getElementById("caps-warning");
  const error = document.getElementById("login-error");
  const submit = document.getElementById("login-submit");
  const submitLabel = document.getElementById("btn-submit-label");
  const success = document.getElementById("login-success");

  // Role tabs & Mode buttons
  const tabPatient = document.getElementById("tab-patient");
  const tabHospital = document.getElementById("tab-hospital");
  const modeSignin = document.getElementById("mode-signin");
  const modeRegister = document.getElementById("mode-register");

  const patientRegFields = document.getElementById("patient-reg-fields");
  const hospitalRegFields = document.getElementById("hospital-reg-fields");
  const portalTitle = document.getElementById("portal-title");
  const portalSubtitle = document.getElementById("portal-subtitle");
  const labelUsername = document.getElementById("label-username");

  let activeRole = "patient"; // "patient" or "hospital"
  let activeMode = "signin";  // "signin" or "register"
  let lockTimer = 0;

  function updateUIState() {
    // Role tabs
    tabPatient.classList.toggle("is-active", activeRole === "patient");
    tabPatient.setAttribute("aria-selected", activeRole === "patient");
    tabHospital.classList.toggle("is-active", activeRole === "hospital");
    tabHospital.setAttribute("aria-selected", activeRole === "hospital");

    // Mode buttons
    modeSignin.classList.toggle("is-active", activeMode === "signin");
    modeRegister.classList.toggle("is-active", activeMode === "register");

    if (activeMode === "signin") {
      portalTitle.textContent = activeRole === "hospital" ? "Hospital Sign In" : "Patient Sign In";
      portalSubtitle.textContent = activeRole === "hospital" 
        ? "Access live queue controls, doctor roster & patient QR code."
        : "Check your active queue tokens and appointment times.";
      submitLabel.textContent = "Sign in";
      patientRegFields.hidden = true;
      hospitalRegFields.hidden = true;
      labelUsername.textContent = activeRole === "hospital" ? "Hospital Username" : "Username or Mobile";
      password.setAttribute("autocomplete", "current-password");
    } else {
      password.setAttribute("autocomplete", "new-password");
      portalTitle.textContent = activeRole === "hospital" ? "Register Hospital / Clinic" : "Create Patient Account";
      portalSubtitle.textContent = activeRole === "hospital"
        ? "Set up your hospital record & generate patient scan QR code."
        : "Register to request priority tokens and track live turn status.";
      submitLabel.textContent = activeRole === "hospital" ? "Create Hospital Record" : "Create Account";
      labelUsername.textContent = activeRole === "hospital" ? "Admin Username" : "Desired Username";

      patientRegFields.hidden = activeRole !== "patient";
      hospitalRegFields.hidden = activeRole !== "hospital";
    }
    setError(error, "");
  }

  tabPatient.addEventListener("click", () => {
    activeRole = "patient";
    updateUIState();
  });

  tabHospital.addEventListener("click", () => {
    activeRole = "hospital";
    updateUIState();
    window.requestAnimationFrame(() => {
      document.getElementById("login-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });

  modeSignin.addEventListener("click", () => {
    activeMode = "signin";
    updateUIState();
  });

  modeRegister.addEventListener("click", () => {
    activeMode = "register";
    updateUIState();
    window.requestAnimationFrame(() => {
      form.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });

  bindHospitalQr({
    statusEl: document.getElementById("qr-scan-status"),
    videoEl: document.getElementById("qr-video"),
    canvasEl: document.getElementById("qr-canvas"),
    wrapEl: document.getElementById("qr-video-wrap"),
    startBtn: document.getElementById("btn-scan-qr"),
    stopBtn: document.getElementById("btn-stop-scan"),
    fileInput: document.getElementById("qr-file-input"),
    onHospital: async (hospitalId, setStatus) => {
      setStatus("Opening check-in for that hospital…");
      location.href = `token.html?hospital_id=${encodeURIComponent(hospitalId)}`;
      return true;
    },
  });

  username.focus();

  const syncCaps = (event) => {
    const on = event.getModifierState && event.getModifierState("CapsLock");
    caps.classList.toggle("is-on", Boolean(on));
  };
  password.addEventListener("keydown", syncCaps);
  password.addEventListener("keyup", syncCaps);

  toggle.addEventListener("click", () => {
    const shown = password.type === "text";
    password.type = shown ? "password" : "text";
    toggle.setAttribute("aria-pressed", shown ? "false" : "true");
    toggle.querySelector("use").setAttribute("href", shown ? "assets/icons.svg#eye" : "assets/icons.svg#eye-off");
    password.focus();
  });

  const startLockout = (seconds) => {
    window.clearInterval(lockTimer);
    let left = Math.max(1, seconds);
    const tick = () => {
      setError(error, t("login.retryIn", { time: formatClock(left) }));
      submit.disabled = true;
      if (left <= 0) {
        window.clearInterval(lockTimer);
        submit.disabled = false;
        setError(error, "");
        return;
      }
      left -= 1;
    };
    tick();
    lockTimer = window.setInterval(tick, 1000);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError(error, "");

    const u = username.value.trim();
    const p = password.value;

    if (!u || !p) {
      shake(form.querySelector("[data-field='username']"));
      shake(form.querySelector("[data-field='password']"));
      setError(error, "Please enter your username and password.");
      return;
    }
    if (activeMode === "register" && p.length < 6) {
      shake(form.querySelector("[data-field='password']"));
      setError(error, "Password must be at least 6 characters.");
      return;
    }
    if (activeMode === "register" && !/^[a-zA-Z0-9_.-]+$/.test(u)) {
      shake(form.querySelector("[data-field='username']"));
      setError(error, "Username can only use letters, numbers, dots, hyphens, and underscores.");
      return;
    }

    setLoading(submit, true);

    if (activeMode === "register") {
      // Registration flow
      let regPayload = {
        username: u,
        password: p,
        role: activeRole,
      };

      if (activeRole === "patient") {
        const pName = document.getElementById("patient-name")?.value.trim();
        const pPhone = document.getElementById("patient-phone")?.value.trim();
        if (!pName) {
          setLoading(submit, false);
          shake(document.getElementById("patient-reg-fields"));
          setError(error, "Please enter your full name.");
          return;
        }
        regPayload.full_name = pName;
        regPayload.phone = pPhone;
      } else if (activeRole === "hospital") {
        const hName = document.getElementById("hospital-name")?.value.trim();
        const hLoc = document.getElementById("hospital-location")?.value.trim();
        const cName = document.getElementById("coord-name")?.value.trim();
        const cPhone = document.getElementById("coord-phone")?.value.trim();
        const ePhone = document.getElementById("emerg-phone")?.value.trim();

        if (!hName || !hLoc || !cPhone) {
          setLoading(submit, false);
          shake(document.getElementById("hospital-reg-fields"));
          setError(error, "Please provide Hospital Name, Location, and Coordinator Contact No.");
          return;
        }

        regPayload.hospital_name = hName;
        regPayload.location = hLoc;
        regPayload.coordinator_name = cName || "Coordinator";
        regPayload.coordinator_phone = cPhone;
        regPayload.emergency_phone = ePhone || cPhone;
      }

      const res = await api.register(regPayload);
      if (!res.ok) {
        setLoading(submit, false);
        shake(form);
        setError(error, res.error || "Registration failed. Please check inputs.");
        return;
      }

      // Registration success
      form.hidden = true;
      success.hidden = false;
      success.classList.add("is-on");

      setTimeout(() => {
        if (activeRole === "hospital") {
          location.replace("admin.html");
        } else {
          location.replace("token.html");
        }
      }, 700);
      return;
    }

    // Sign in flow
    const res = await api.login(u, p);
    if (!res.ok) {
      setLoading(submit, false);
      shake(form);
      if (res.network) setError(error, t("login.network"));
      else if (res.locked) {
        setError(error, t("login.lockout"));
        startLockout(res.lockoutRemaining || 600);
      } else {
        setError(error, res.error || "Invalid username or password");
      }
      return;
    }

    form.hidden = true;
    success.hidden = false;
    success.classList.add("is-on");

    const me = await api.me();
    const user = me.ok ? me.data : res.data;
    const params = new URLSearchParams(location.search);
    const next = params.get("next") || "";
    const safeNext = /^\/?[a-z0-9.-]+\.html(?:\?.*)?$/i.test(next) ? next.replace(/^\//, "") : "";
    const dest = user?.must_change_password
      ? "change-password.html"
      : safeNext || homeFor(user);

    setTimeout(() => {
      location.replace(dest);
    }, 700);
  });
}

document.addEventListener("DOMContentLoaded", boot);
