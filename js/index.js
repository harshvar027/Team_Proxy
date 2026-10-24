import { api } from "./api.js";
import { checkAuth, syncAccount } from "./auth.js";
import { t } from "./i18n.js";
import { setLoading, shake } from "./ui.js";

function bindOffline() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  const sync = () => {
    banner.hidden = navigator.onLine;
  };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();
}

async function boot() {
  bindOffline();
  const { user } = await checkAuth();
  syncAccount(user);
  const countEl = document.getElementById("home-hospital-count");
  const hospitals = await api.hospitals();
  if (countEl) {
    if (hospitals.ok && Array.isArray(hospitals.data)) {
      countEl.textContent = String(hospitals.data.length || 0);
    } else {
      countEl.textContent = "Open";
    }
  }
  const list = document.getElementById("home-hospital-list");
  if (list) {
    list.replaceChildren();
    if (hospitals.ok && hospitals.data?.length) {
      hospitals.data.forEach((h) => {
        const card = document.createElement("a");
        card.className = "hospital-chip";
        card.href = `token.html?hospital_id=${encodeURIComponent(h.id)}`;
        card.innerHTML = `<strong></strong><span></span>`;
        card.querySelector("strong").textContent = h.name;
        card.querySelector("span").textContent = `${h.location || "Clinic"} · ${h.coordinator_phone || "Helpline on file"}`;
        list.append(card);
      });
    } else {
      list.innerHTML = `<article class="trust-item"><strong>No hospitals yet</strong><p class="muted" style="margin:6px 0 0;font-size:13px">Register a clinic from Sign in to publish a QR poster.</p></article>`;
    }
  }

  const form = document.getElementById("lookup-form");
  const token = document.getElementById("lookup-token");
  const pin = document.getElementById("lookup-pin");
  const message = document.getElementById("lookup-message");
  const submit = document.getElementById("lookup-submit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
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
    location.href = `status.html?id=${encodeURIComponent(res.data.id)}`;
  });
}

boot();
