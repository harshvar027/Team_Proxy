import { api } from "./api.js";
import { el, text, initials, bindAccountMenu } from "./ui.js";

export function homeFor(user) {
  if (!user) return "login.html";
  if (user.must_change_password) return "change-password.html";
  if (user.role === "admin" || user.role === "hospital") return "admin.html";
  if (user.role === "staff") return "staff.html";
  if (user.role === "patient") return "token.html";
  return "index.html";
}

export async function checkAuth() {
  const res = await api.me();
  if (res.ok && res.data) return { authenticated: true, user: res.data };
  return { authenticated: false, user: null };
}

export async function requireAuth(allowedRoles = []) {
  const { authenticated, user } = await checkAuth();
  if (!authenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.replace(`login.html?next=${next}`);
    return null;
  }
  if (user.must_change_password && !location.pathname.endsWith("change-password.html")) {
    location.replace("change-password.html");
    return null;
  }
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    location.replace("403.html");
    return null;
  }
  syncAccount(user);
  return user;
}

export async function requireGuest() {
  const { authenticated, user } = await checkAuth();
  if (authenticated) {
    location.replace(homeFor(user));
    return false;
  }
  return true;
}

export async function logout() {
  await api.logout();
  location.replace("login.html");
}

export function syncAccount(user) {
  const slot = document.querySelector("[data-auth-slot]");
  if (!slot) return;
  slot.replaceChildren();
  if (!user) {
    slot.append(
      el("a", { href: "login.html", class: "btn btn-sm btn-secondary", "data-i18n": "nav.signIn" }, ["Sign in"])
    );
    return;
  }
  const menu = el("div", { class: "account-menu", "data-account": true });
  const btn = el("button", {
    class: "btn btn-icon",
    type: "button",
    "data-account-toggle": true,
    "aria-expanded": "false",
    "aria-haspopup": "true",
    "aria-label": "Account menu",
  }, [el("span", { class: "avatar", text: initials(user.username) })]);
  const panel = el("div", { class: "account-panel", role: "menu" });
  panel.append(
    el("div", { class: "caption", style: "padding:8px 12px" }, [
      text(user.username),
      el("div", { text: user.hospital_name || user.department_name || user.role }),
    ]),
    el("button", { class: "btn btn-sm btn-tertiary", type: "button", "data-i18n": "nav.signOut" }, ["Sign out"])
  );
  panel.querySelector("button").addEventListener("click", () => logout());
  menu.append(btn, panel);
  slot.append(menu);
  bindAccountMenu(slot);
}
