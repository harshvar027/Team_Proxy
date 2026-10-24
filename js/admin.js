import { api } from "./api.js";
import { requireAuth } from "./auth.js";
import { t } from "./i18n.js";
import {
  closeModal,
  copyText,
  el,
  formatDate,
  openModal,
  setLoading,
  shake,
  svgLineChart,
  toast,
  updateCount,
} from "./ui.js";

function bindOffline() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;
  const sync = () => { banner.hidden = navigator.onLine; };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  sync();
}

function bindChartHover(svg, tip, labels, series) {
  svg.addEventListener("mousemove", (event) => {
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const n = labels.length;
    const pad = 28;
    const inner = rect.width - (pad / 640) * rect.width * 2;
    const i = Math.max(0, Math.min(n - 1, Math.round(((x - (pad / 640) * rect.width) / inner) * (n - 1))));
    const lines = series.map((s) => `${s.name}: ${s.values[i]}`);
    tip.textContent = `${labels[i]} · ${lines.join(" · ")}`;
    tip.style.opacity = "1";
    tip.style.left = `${x}px`;
    tip.style.top = `${event.clientY - rect.top}px`;
  });
  svg.addEventListener("mouseleave", () => {
    tip.style.opacity = "0";
  });
}

async function boot() {
  bindOffline();
  const user = await requireAuth(["admin", "hospital"]);
  if (!user) return;

  let departments = [];
  let currentHospital = null;
  let allTokensData = [];

  // DOM Elements
  const dashHospitalTitle = document.getElementById("dash-hospital-title");
  const dashHospitalSubtitle = document.getElementById("dash-hospital-subtitle");

  // Tab switching
  const tabs = document.querySelectorAll("[data-tab]");
  const panels = document.querySelectorAll("[data-tab-panel]");

  const activateTab = (tabName) => {
    tabs.forEach((t) => {
      const match = t.getAttribute("data-tab") === tabName;
      t.classList.toggle("is-active", match);
      t.setAttribute("aria-selected", match);
    });
    panels.forEach((p) => {
      const match = p.getAttribute("data-tab-panel") === tabName;
      p.hidden = !match;
    });

    if (tabName === "queues") loadAllQueues();
    if (tabName === "hospital") loadHospitalTab();
    if (tabName === "overview") loadOverview();
    if (tabName === "users") loadUsers();
    if (tabName === "departments") loadDepartments();
    if (tabName === "audit") loadAudit();
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab.getAttribute("data-tab"));
    });
  });

  // ── Hospital Profile & QR Tab ───────────────────────────────────────────

  const loadHospitalTab = async () => {
    let res = await api.getHospitalProfile();
    if (!res.ok) {
      const hList = await api.hospitals();
      if (hList.ok && hList.data?.length) res = { ok: true, data: hList.data[0] };
    }

    if (res.ok && res.data) {
      currentHospital = res.data;
      dashHospitalTitle.textContent = currentHospital.name;
      dashHospitalSubtitle.textContent = `Coordinator: ${currentHospital.coordinator_name} (${currentHospital.coordinator_phone}) • Code: ${currentHospital.code}`;

      // QR Elements
      const qrImg = document.getElementById("hospital-qr-img");
      const qrCode = document.getElementById("qr-h-code");
      const qrName = document.getElementById("qr-h-name");
      const btnDownload = document.getElementById("btn-download-qr");

      const qrUrl = `/api/patient/hospital/${currentHospital.id}/qr`;
      qrImg.src = qrUrl;
      qrCode.textContent = currentHospital.code;
      qrName.textContent = currentHospital.name;
      btnDownload.href = qrUrl;
      btnDownload.download = `${currentHospital.code}_CheckIn_QR.png`;

      // Meta Elements
      document.getElementById("card-h-name").textContent = currentHospital.name;
      document.getElementById("card-h-code").textContent = currentHospital.code;
      document.getElementById("card-h-loc").textContent = currentHospital.location;
      document.getElementById("card-coord-name").textContent = currentHospital.coordinator_name;
      document.getElementById("card-coord-phone").textContent = currentHospital.coordinator_phone;
      document.getElementById("card-emerg-phone").textContent = currentHospital.emergency_phone || "Not set";

      // Edit form initial values
      document.getElementById("edit-h-name").value = currentHospital.name;
      document.getElementById("edit-h-loc").value = currentHospital.location;
      document.getElementById("edit-h-coord-name").value = currentHospital.coordinator_name;
      document.getElementById("edit-h-coord-phone").value = currentHospital.coordinator_phone;
      document.getElementById("edit-h-emerg-phone").value = currentHospital.emergency_phone || "";
    }
  };

  // Edit hospital modal submit
  document.getElementById("edit-hospital-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-save-hospital");
    setLoading(btn, true);

    const payload = {
      name: document.getElementById("edit-h-name").value.trim(),
      location: document.getElementById("edit-h-loc").value.trim(),
      coordinator_name: document.getElementById("edit-h-coord-name").value.trim(),
      coordinator_phone: document.getElementById("edit-h-coord-phone").value.trim(),
      emergency_phone: document.getElementById("edit-h-emerg-phone").value.trim() || null,
    };

    const res = await api.updateHospitalProfile(payload);
    setLoading(btn, false);
    if (!res.ok) {
      shake(btn);
      alert(res.error || "Failed to update hospital record");
      return;
    }
    toast("Hospital record updated successfully!");
    closeModal("edit-hospital");
    loadHospitalTab();
  });

  // Print poster
  document.getElementById("btn-print-poster")?.addEventListener("click", () => {
    if (!currentHospital) return;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Check-in Poster - ${currentHospital.name}</title>
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; padding: 40px; margin: 0; }
          .poster { border: 4px solid #0066cc; border-radius: 24px; padding: 48px; max-width: 600px; margin: 0 auto; }
          h1 { font-size: 32px; margin: 0 0 8px; color: #111; }
          p { font-size: 16px; color: #555; margin: 4px 0 24px; }
          img { width: 280px; height: 280px; margin: 16px auto; display: block; }
          .helpline { background: #f0fdf4; border: 2px solid #bbf7d0; border-radius: 12px; padding: 16px; margin-top: 24px; font-size: 18px; font-weight: bold; color: #166534; }
          .instruction { font-size: 18px; font-weight: 600; color: #0066cc; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="poster">
          <h1>${currentHospital.name}</h1>
          <p>${currentHospital.location}</p>
          <div class="instruction">Scan with camera to Get Your OPD Token</div>
          <img src="/api/patient/hospital/${currentHospital.id}/qr" alt="QR Code">
          <p style="font-size: 14px; color: #888;">AI Symptom Triage &bull; Live Queue Status &bull; Emergency Fast-Track</p>
          <div class="helpline">Coordinator Helpline: ${currentHospital.coordinator_phone}</div>
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  });

  // Copy check-in link
  document.getElementById("btn-copy-link")?.addEventListener("click", () => {
    if (!currentHospital) return;
    const link = `${location.origin}/token.html?hospital_id=${currentHospital.id}&code=${currentHospital.code}`;
    copyText(link, "Patient check-in link copied!");
  });

  // ── Master Queues Console ────────────────────────────────────────────────

  const renderQueueTable = () => {
    const body = document.getElementById("master-queue-body");
    const deptFilter = document.getElementById("filter-dept").value;
    const prioFilter = document.getElementById("filter-priority").value;
    const statusFilter = document.getElementById("filter-status").value;

    body.replaceChildren();

    const filtered = allTokensData.filter((t) => {
      if (deptFilter !== "all" && String(t.department_id) !== deptFilter) return false;
      if (prioFilter !== "all") {
        if (prioFilter === "daily_life" && t.priority_class !== "daily_life" && t.priority_class !== "priority") return false;
        if (prioFilter === "routine" && t.priority_class !== "routine" && t.priority_class !== "normal") return false;
        if (prioFilter === "emergency" && t.priority_class !== "emergency") return false;
      }
      if (statusFilter === "waiting" && t.status !== "waiting") return false;
      if (statusFilter === "called" && t.status !== "called") return false;
      if (statusFilter === "done" && t.status !== "done") return false;
      if (statusFilter === "all" && (t.status === "done" || t.status === "no_show") && prioFilter === "all") {
        // default view focuses on active/waiting
      }
      return true;
    });

    if (!filtered.length) {
      body.append(
        el("tr", {}, [
          el("td", { colspan: "8", style: "text-align:center;padding:36px;color:var(--text-muted)", text: "No patients currently match this filter." }),
        ])
      );
      return;
    }

    filtered.forEach((t) => {
      // Priority badge
      const pClass = t.priority_class;
      let badgeClass = "p-routine";
      let badgeLabel = "Routine";
      if (pClass === "emergency") {
        badgeClass = "p-emergency";
        badgeLabel = "🚨 Emergency";
      } else if (pClass === "daily_life" || pClass === "priority") {
        badgeClass = "p-daily";
        badgeLabel = "⚡ Daily Urgent";
      }

      // Status chip
      const statusChips = {
        waiting: el("span", { class: "chip chip-waiting", text: "Waiting" }),
        called: el("span", { class: "chip chip-doctor", text: "With Doctor" }),
        done: el("span", { class: "chip chip-done", text: "Served" }),
        no_show: el("span", { class: "chip chip-noshow", text: "No-Show" }),
      };

      // Actions
      const actions = el("td", { class: "row-actions", style: "display:flex;gap:6px" });

      if (t.status === "waiting") {
        const btnCall = el("button", { class: "btn btn-sm btn-primary", type: "button", text: "Call" });
        btnCall.addEventListener("click", async () => {
          await api.callNext();
          loadAllQueues();
        });
        actions.append(btnCall);
      }

      if (t.status === "called") {
        const btnDone = el("button", { class: "btn btn-sm btn-secondary", type: "button", text: "Done" });
        btnDone.addEventListener("click", async () => {
          await api.markDone(t.token_id);
          loadAllQueues();
        });
        const btnNoShow = el("button", { class: "btn btn-sm btn-tertiary", type: "button", text: "No-Show" });
        btnNoShow.addEventListener("click", async () => {
          await api.markNoShow(t.token_id);
          loadAllQueues();
        });
        actions.append(btnDone, btnNoShow);
      }

      const btnEdit = el("button", { class: "btn btn-sm btn-tertiary", type: "button", text: "Edit" });
      btnEdit.addEventListener("click", () => {
        openEditTokenModal(t);
      });
      actions.append(btnEdit);

      const arrivedStr = t.created_at ? new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

      body.append(
        el("tr", {}, [
          el("td", { style: "font-weight:700", text: t.token_number }),
          el("td", { text: t.patient_name }),
          el("td", {}, [el("span", { class: `priority-badge-sm ${badgeClass}`, text: badgeLabel })]),
          el("td", { text: t.department_name }),
          el("td", { class: "caption", style: "max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", text: t.symptoms || t.priority_reason || "—" }),
          el("td", {}, [statusChips[t.status] || el("span", { text: t.status })]),
          el("td", { class: "num caption", text: arrivedStr }),
          actions,
        ])
      );
    });
  };

  const loadAllQueues = async () => {
    const res = await api.allHospitalQueues();
    if (!res.ok) return;

    const data = res.data;
    allTokensData = data.tokens || [];

    // Update KPI counters
    updateCount(document.getElementById("kpi-waiting"), data.waiting_count || 0);
    updateCount(document.getElementById("kpi-emergency"), data.emergency_count || 0);
    updateCount(document.getElementById("kpi-daily"), data.daily_life_count || 0);
    updateCount(document.getElementById("kpi-routine"), data.routine_count || 0);
    updateCount(document.getElementById("kpi-done"), data.done_count || 0);

    renderQueueTable();
  };

  // Filter change listeners
  document.getElementById("filter-dept")?.addEventListener("change", renderQueueTable);
  document.getElementById("filter-priority")?.addEventListener("change", renderQueueTable);
  document.getElementById("filter-status")?.addEventListener("change", renderQueueTable);

  // Global Call Next button
  document.getElementById("btn-call-next-global")?.addEventListener("click", async () => {
    const res = await api.callNext();
    if (res.ok) {
      toast(`Called ${res.data.token_number} (${res.data.patient_name})`);
      loadAllQueues();
    } else {
      toast(res.error || "No patients currently waiting");
    }
  });

  // Edit Token Modal
  const openEditTokenModal = (token) => {
    document.getElementById("edit-token-id").value = token.token_id;
    document.getElementById("edit-token-patient").value = token.patient_name;
    document.getElementById("edit-token-priority").value = token.priority_class;
    document.getElementById("edit-token-reason").value = token.symptoms || token.priority_reason || "";
    document.getElementById("edit-token-dept").value = String(token.department_id);
    document.getElementById("edit-token-status").value = token.status;
    document.getElementById("edit-token-title").textContent = `Edit ${token.token_number}`;
    openModal("edit-token");
  };

  document.getElementById("edit-token-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-save-token");
    setLoading(btn, true);

    const tokenId = document.getElementById("edit-token-id").value;
    const payload = {
      patient_name: document.getElementById("edit-token-patient").value.trim(),
      priority_class: document.getElementById("edit-token-priority").value,
      priority_reason: document.getElementById("edit-token-reason").value.trim(),
      symptoms: document.getElementById("edit-token-reason").value.trim(),
      department_id: Number(document.getElementById("edit-token-dept").value),
      status: document.getElementById("edit-token-status").value,
    };

    const res = await api.editToken(tokenId, payload);
    setLoading(btn, false);
    if (!res.ok) {
      shake(btn);
      alert(res.error || "Failed to update token");
      return;
    }
    toast("Queue token updated!");
    closeModal("edit-token");
    loadAllQueues();
  });

  // Walk-in form submit
  document.getElementById("walkin-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("walkin-submit");
    setLoading(btn, true);

    const payload = {
      name: document.getElementById("walkin-name").value.trim(),
      phone: document.getElementById("walkin-phone").value.trim() || null,
      department_id: Number(document.getElementById("walkin-dept").value),
      priority_class: document.getElementById("walkin-priority").value,
      priority_reason: document.getElementById("walkin-reason").value.trim() || null,
      symptoms: document.getElementById("walkin-reason").value.trim() || null,
    };

    const res = await api.issueWalkIn(payload);
    setLoading(btn, false);
    if (!res.ok) {
      shake(btn);
      alert(res.error || "Failed to issue walk-in token");
      return;
    }
    toast(`Walk-in Token Issued: ${res.data.token_number}`);
    closeModal("walkin");
    document.getElementById("walkin-form").reset();
    loadAllQueues();
  });

  // ── Existing Departments, Users, and Analytics Logic ───────────────────

  const fillDeptSelects = () => {
    ["new-dept", "doctor-dept", "filter-dept", "edit-token-dept", "walkin-dept"].forEach((id) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const keepFirst = id === "filter-dept";
      sel.innerHTML = keepFirst ? '<option value="all">All Departments</option>' : "";
      departments.forEach((d) => sel.append(el("option", { value: String(d.id), text: d.name })));
    });
  };

  const loadDepartments = async () => {
    const [dRes, docRes] = await Promise.all([api.adminDepartments(), api.adminDoctors()]);
    departments = dRes.data || [];
    fillDeptSelects();

    const deptBody = document.getElementById("depts-body");
    if (deptBody) {
      deptBody.replaceChildren();
      departments.forEach((d) => {
        deptBody.append(
          el("tr", {}, [
            el("td", { text: d.name }),
            el("td", { class: "num", text: d.code }),
            el("td", { class: "num", text: String(d.avg_service_minutes) }),
          ])
        );
      });
    }
  };

  const loadOverview = async () => {
    const res = await api.summary();
    const skel = document.getElementById("overview-skel");
    if (skel) skel.hidden = true;
    if (!res.ok) return;
    const s = res.data;
    updateCount(document.getElementById("kpi-served"), s.patients_served);
    updateCount(document.getElementById("kpi-wait"), s.average_wait_minutes);
    updateCount(document.getElementById("kpi-noshow"), s.no_show_count);
    document.getElementById("kpi-peak").textContent = s.peak_hour;
    const svg = document.getElementById("overview-chart");
    const labels = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
    svgLineChart(svg, [{ name: "Patients", values: s.hourly }], { alt: "Hourly patients served" });
    bindChartHover(svg, document.getElementById("overview-tip"), labels, [{ name: "Patients", values: s.hourly }]);
  };

  const loadUsers = async () => {
    const res = await api.adminUsers();
    const body = document.getElementById("users-body");
    if (!body) return;
    body.replaceChildren();
    (res.data || []).forEach((row) => {
      const actions = el("td", { class: "row-actions" });
      const toggle = el("button", { class: "btn btn-sm btn-secondary", type: "button" }, [
        row.active ? t("admin.disable") : t("admin.enable"),
      ]);
      toggle.addEventListener("click", async () => {
        await api.toggleUser(row.id);
        loadUsers();
      });
      actions.append(toggle);
      body.append(
        el("tr", {}, [
          el("td", { text: row.username }),
          el("td", { text: row.role }),
          el("td", { text: row.department_name || "—" }),
          el("td", {}, [
            el("span", { class: `chip ${row.active ? "chip-done" : "chip-noshow"}`, text: row.active ? "Active" : "Disabled" }),
          ]),
          actions,
        ])
      );
    });
  };

  const loadAudit = async () => {
    const res = await api.auditLog({ page: 1, per_page: 20 });
    const body = document.getElementById("audit-body");
    if (!body) return;
    body.replaceChildren();
    (res.data?.items || []).forEach((row) => {
      body.append(
        el("tr", {}, [
          el("td", { class: "caption", text: formatDate(row.timestamp) }),
          el("td", { text: row.actor_username || "system" }),
          el("td", { text: row.actor_role }),
          el("td", { text: row.action }),
          el("td", { text: row.details || "—" }),
        ])
      );
    });
  };

  // Initial load
  await loadDepartments();
  await loadHospitalTab();
  await loadAllQueues();

  // Auto-refresh master queues every 4 seconds
  window.setInterval(() => {
    const qPanel = document.querySelector("[data-tab-panel='queues']");
    if (qPanel && !qPanel.hidden) {
      loadAllQueues();
    }
  }, 4000);
}

document.addEventListener("DOMContentLoaded", boot);
