import { api } from "./api.js";
import { requireAuth, homeFor } from "./auth.js";
import { t } from "./i18n.js";
import { passwordStrength, setLoading, shake } from "./ui.js";

async function boot() {
  const user = await requireAuth(["staff", "admin"]);
  if (!user) return;

  const form = document.getElementById("pw-form");
  const current = document.getElementById("current");
  const next = document.getElementById("next");
  const confirm = document.getElementById("confirm");
  const bar = document.getElementById("strength-bar");
  const error = document.getElementById("pw-error");
  const submit = document.getElementById("pw-submit");
  const message = document.getElementById("pw-message");
  current.focus();

  const paintStrength = () => {
    const { checks, rank } = passwordStrength(next.value);
    bar.className = `strength-bar ${next.value ? rank : ""}`;
    document.querySelectorAll("[data-check]").forEach((item) => {
      item.classList.toggle("is-valid", Boolean(checks[item.getAttribute("data-check")]));
    });
  };
  next.addEventListener("input", paintStrength);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    message.textContent = "";
    const strength = passwordStrength(next.value);
    if (strength.score < 4) {
      shake(next.closest(".field"));
      return;
    }
    if (next.value !== confirm.value) {
      message.textContent = t("changePassword.mismatch");
      message.classList.add("is-on");
      shake(confirm.closest(".field"));
      return;
    }
    setLoading(submit, true);
    current.readOnly = true;
    next.readOnly = true;
    confirm.readOnly = true;
    const res = await api.changePassword(current.value, next.value);
    setLoading(submit, false);
    current.readOnly = false;
    next.readOnly = false;
    confirm.readOnly = false;
    if (!res.ok) {
      error.textContent = res.network ? t("login.network") : res.error;
      shake(form);
      return;
    }
    const fresh = await api.me();
    location.replace(homeFor(fresh.ok ? fresh.data : user));
  });
}

boot();
