import { api } from "./api.js";
import { checkAuth, syncAccount } from "./auth.js";
import { t } from "./i18n.js";
import { setLoading, shake, updateCount } from "./ui.js";

function bindOffline() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  const sync = () => { banner.hidden = navigator.onLine; };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();
}

async function boot() {
  bindOffline();
  const { user } = await checkAuth();
  syncAccount(user);

  const params = new URLSearchParams(location.search);
  let tokenId = params.get("id");
  const empty = document.getElementById("status-empty");
  const view = document.getElementById("status-view");
  const skel = document.getElementById("status-skel");
  const live = document.getElementById("live-chip");
  const arrive = document.getElementById("arrive-time");
  const tokenLabel = document.getElementById("token-label");
  const deptLabel = document.getElementById("department-label");
  const position = document.getElementById("position");
  const waitValue = document.getElementById("wait-value");

  const priorityBadgeContainer = document.getElementById("priority-badge-container");
  const statusHName = document.getElementById("status-h-name");
  const statusCoordName = document.getElementById("status-coord-name");
  const statusHLoc = document.getElementById("status-h-loc");
  const btnCallCoord = document.getElementById("btn-call-coord");
  const callCoordLabel = document.getElementById("call-coord-label");
  const btnEmergHelpline = document.getElementById("btn-emerg-helpline");

  let timer = 0;

  const paint = (data) => {
    empty.hidden = true;
    view.hidden = false;
    live.hidden = false;

    // Arrival advice & token
    arrive.textContent = data.arrive_by || "Come now";
    tokenLabel.textContent = `Token: ${data.token_number}`;
    deptLabel.textContent = `Department: ${data.department_name} • Patient: ${data.patient_name}`;

    // Priority badge
    const p = data.priority_class;
    let badgeHtml = "";
    if (p === "emergency") {
      badgeHtml = '<span class="priority-badge-lg priority-emergency">🚨 Emergency Priority (Level 1) - Fast Track</span>';
    } else if (p === "daily_life" || p === "priority") {
      badgeHtml = '<span class="priority-badge-lg priority-daily">⚡ Daily Life Urgent (Level 2) - Ahead of Routine</span>';
    } else {
      badgeHtml = '<span class="priority-badge-lg priority-routine">🩺 Routine Consultation (Level 3)</span>';
    }
    priorityBadgeContainer.innerHTML = badgeHtml;

    // Status / Position
    const pos = data.position_in_queue == null ? 0 : data.position_in_queue;
    updateCount(position, pos);

    if (data.status === "called") {
      waitValue.textContent = "Your turn now!";
      waitValue.style.color = "var(--success)";
    } else if (data.status === "done") {
      waitValue.textContent = "Completed";
      waitValue.style.color = "var(--text-2)";
    } else if (data.status === "no_show") {
      waitValue.textContent = "Marked No-Show";
      waitValue.style.color = "var(--danger)";
    } else {
      waitValue.textContent = `${data.wait_estimate_min || 0}–${data.wait_estimate_max || 10} min`;
      waitValue.style.color = "";
    }

    waitValue.classList.remove("is-rolling");
    void waitValue.offsetWidth;
    waitValue.classList.add("is-rolling");

    // Coordinator helpline wiring
    if (data.hospital_name) statusHName.textContent = data.hospital_name;
    if (data.coordinator_name) statusCoordName.textContent = data.coordinator_name;
    if (data.hospital_location) statusHLoc.textContent = data.hospital_location;

    if (data.coordinator_phone) {
      const cleanPhone = data.coordinator_phone.replace(/\s+/g, "");
      btnCallCoord.href = `tel:${cleanPhone}`;
      callCoordLabel.textContent = `Call Coordinator (${data.coordinator_phone})`;
    }

    if (data.emergency_phone) {
      btnEmergHelpline.style.display = "inline-flex";
      btnEmergHelpline.href = `tel:${data.emergency_phone.replace(/\s+/g, "")}`;
    }
  };

  const refresh = async () => {
    if (!tokenId) return;
    const res = await api.tokenStatus(tokenId);
    skel.hidden = true;
    if (!res.ok) {
      empty.hidden = false;
      view.hidden = true;
      live.hidden = true;
      return;
    }
    paint(res.data);
  };

  if (!tokenId) {
    empty.hidden = false;
  } else {
    skel.hidden = false;
    await refresh();
    timer = window.setInterval(refresh, 3500);
  }

  document.getElementById("lookup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = document.getElementById("lookup-token");
    const pin = document.getElementById("lookup-pin");
    const message = document.getElementById("lookup-message");
    const submit = document.getElementById("lookup-submit");
    message.textContent = "";

    if (!token.value.trim() || !pin.value.trim()) {
      shake(token.closest(".field"));
      shake(pin.closest(".field"));
      return;
    }

    setLoading(submit, true);
    const res = await api.lookupToken(token.value.trim(), pin.value.trim());
    setLoading(submit, false);

    if (!res.ok) {
      message.textContent = res.network ? t("login.network") : res.error;
      message.classList.add("is-on");
      shake(pin.closest(".field"));
      return;
    }

    tokenId = String(res.data.id);
    history.replaceState({}, "", `status.html?id=${encodeURIComponent(tokenId)}`);
    paint(res.data);
    window.clearInterval(timer);
    timer = window.setInterval(refresh, 3500);
  });
}

document.addEventListener("DOMContentLoaded", boot);
