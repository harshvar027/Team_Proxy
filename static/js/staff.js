import { api } from "./api.js";
import { requireAuth } from "./auth.js";
import { t } from "./i18n.js";
import {
  closeModal,
  el,
  emptyState,
  flip,
  formatDate,
  insertRow,
  openModal,
  setLoading,
  shake,
  toast,
  updateCount,
} from "./ui.js";

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

function chip(kind, label) {
  return el("span", { class: `chip chip-${kind}`, text: label });
}

async function boot() {
  bindOffline();
  const user = await requireAuth(["staff", "admin"]);
  if (!user) return;

  const body = document.getElementById("queue-body");
  const wrap = document.getElementById("queue-table-wrap");
  const skel = document.getElementById("queue-skel");
  const empty = document.getElementById("queue-empty");
  const rising = document.getElementById("rising");
  const callBtn = document.getElementById("call-next");
  const doctorList = document.getElementById("doctor-list");
  const docCount = document.getElementById("doc-count");
  let board = null;
  let doctors = [];
  let priorityTarget = null;
  let priorityClass = "normal";

  document.getElementById("dept-label").textContent = user.department_name || "";

  const renderStats = () => {
    updateCount(document.getElementById("stat-waiting"), board.waiting_count);
    updateCount(document.getElementById("stat-called"), board.called_count);
    updateCount(document.getElementById("stat-done"), board.done_today);
    updateCount(document.getElementById("stat-wait"), board.avg_service_minutes);
    rising.hidden = !board.consider_opening_counter;
  };

  const renderQueue = () => {
    skel.hidden = true;
    const rows = board.queue || [];
    if (!rows.length) {
      wrap.hidden = true;
      empty.hidden = false;
      empty.replaceChildren(emptyState({ title: t("staff.empty"), iconName: "inbox" }));
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    flip(body, () => {
      body.replaceChildren();
      rows.forEach((row) => {
        const tr = el("tr", { dataset: { id: String(row.token_id) } });
        const actions = el("td", { class: "row-actions" });
        const pri = el("button", { class: "btn btn-sm btn-secondary", type: "button", "data-i18n": "staff.setPriority" }, [t("staff.setPriority")]);
        pri.addEventListener("click", () => {
          priorityTarget = row.token_id;
          priorityClass = row.priority_class || "normal";
          document.querySelectorAll("[data-priority]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-priority") === priorityClass);
          });
          document.getElementById("priority-reason").value = row.priority_reason || "";
          openModal("priority");
        });
        const ns = el("button", { class: "btn btn-sm btn-tertiary", type: "button" }, [t("staff.noShow")]);
        ns.addEventListener("click", async () => {
          await api.markNoShow(row.token_id);
          await load();
        });
        if (row.status === "called") {
          const done = el("button", { class: "btn btn-sm btn-primary", type: "button" }, ["Done"]);
          done.addEventListener("click", async () => {
            await api.markDone(row.token_id);
            await load();
          });
          actions.append(done);
        }
        actions.append(pri, ns);
        tr.append(
          el("td", { class: "num", text: row.token_number }),
          el("td", { text: row.patient_name }),
          el("td", {}, [chip(row.priority_class, row.priority_class)]),
          el("td", {}, [chip(row.status, row.status)]),
          actions
        );
        insertRow(tr);
        body.append(tr);
      });
    });
  };

  const renderDoctors = () => {
    const active = doctors.filter((d) => d.active);
    docCount.textContent = String(active.length);
    doctorList.replaceChildren();
    doctors.forEach((d) => {
      const row = el("div", { class: "list-row" });
      row.append(
        el("span", { text: d.name }),
        chip(d.active ? "doctor" : "waiting", d.active ? "On duty" : "Off")
      );
      doctorList.append(row);
    });
  };

  const load = async () => {
    const [q, docs] = await Promise.all([api.staffQueue(user.department_id), api.staffDoctors()]);
    if (q.ok) {
      board = q.data;
      renderStats();
      renderQueue();
    }
    if (docs.ok) {
      doctors = docs.data;
      renderDoctors();
    }
  };

  await load();

  callBtn.addEventListener("click", async () => {
    setLoading(callBtn, true);
    const res = await api.callNext();
    setLoading(callBtn, false);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    toast(`${t("staff.callNext")}: ${res.data.token_number}`);
    await load();
  });

  const shiftDoctor = async (wantActive) => {
    const target = doctors.find((d) => d.active === !wantActive);
    if (!target) return;
    await api.toggleDoctor(target.id);
    await load();
  };
  document.getElementById("doc-plus").addEventListener("click", () => shiftDoctor(true));
  document.getElementById("doc-minus").addEventListener("click", () => shiftDoctor(false));

  document.getElementById("walkin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("walkin-name");
    const submit = document.getElementById("walkin-submit");
    if (!name.value.trim()) {
      shake(name.closest(".field"));
      return;
    }
    setLoading(submit, true);
    const res = await api.issueWalkIn({
      name: name.value.trim(),
      department_id: user.department_id,
    });
    setLoading(submit, false);
    if (!res.ok) {
      toast(res.error);
      return;
    }
    toast(res.data.token_number);
    name.value = "";
    closeModal("walkin");
    await load();
  });

  document.querySelectorAll("[data-priority]").forEach((btn) => {
    btn.addEventListener("click", () => {
      priorityClass = btn.getAttribute("data-priority");
      document.querySelectorAll("[data-priority]").forEach((b) => b.classList.toggle("is-active", b === btn));
    });
  });

  document.getElementById("priority-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const reason = document.getElementById("priority-reason");
    const msg = document.getElementById("reason-message");
    if (priorityClass !== "normal" && !reason.value.trim()) {
      msg.classList.add("is-on");
      shake(reason.closest(".field"));
      return;
    }
    setLoading(document.getElementById("priority-submit"), true);
    await api.setPriority(priorityTarget, priorityClass, reason.value.trim());
    setLoading(document.getElementById("priority-submit"), false);
    closeModal("priority");
    await load();
  });

  const auditBtn = document.getElementById("audit-toggle");
  const auditPanel = document.getElementById("audit-panel");
  auditBtn.addEventListener("click", async () => {
    const open = auditPanel.hidden;
    auditPanel.hidden = !open;
    auditBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;
    const res = await api.auditLog({ per_page: 8 });
    const tbody = document.getElementById("audit-body");
    tbody.replaceChildren();
    (res.data?.items || []).forEach((row) => {
      tbody.append(
        el("tr", {}, [
          el("td", { class: "caption", text: formatDate(row.timestamp) }),
          el("td", { text: row.actor_username }),
          el("td", { text: row.action }),
          el("td", { text: row.details }),
        ])
      );
    });
  });
}

boot();
