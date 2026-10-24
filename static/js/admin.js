/**
 * Baari — static/js/admin.js
 * Admin Control Center: Hospital KPIs, Staff user management,
 * Department and doctor configuration, Audit log viewer, and queue reset.
 */

window.BaariAdmin = {
  departments: [],
  users: [],
  auditLogs: [],

  init() {
    this.checkAdminAccess();
  },

  async checkAdminAccess() {
    if (!BaariApp.currentUser || BaariApp.currentUser.role !== "admin") {
      document.getElementById("admin-access-warning").style.display = "block";
      document.getElementById("admin-content").style.display = "none";
      return;
    }

    document.getElementById("admin-access-warning").style.display = "none";
    document.getElementById("admin-content").style.display = "block";

    this.loadSummary();
    this.loadUsers();
    this.loadDepartments();
    this.loadAuditLogs();
  },

  async loadSummary() {
    try {
      const s = await BaariApp.fetchApi("/api/admin/summary");
      document.getElementById("adm-stat-served").textContent = s.patients_served;
      document.getElementById("adm-stat-avg-wait").textContent = `${s.average_wait_minutes}m`;
      document.getElementById("adm-stat-longest-wait").textContent = `${s.longest_wait_minutes}m`;
      document.getElementById("adm-stat-peak").textContent = s.peak_hour;
      document.getElementById("adm-stat-noshow").textContent = `${s.no_show_count} (${s.no_show_rate}%)`;

      // Render Department Breakdown
      const deptContainer = document.getElementById("adm-dept-breakdown");
      if (deptContainer) {
        deptContainer.innerHTML = s.by_department
          .map(
            (d) => `
          <div class="card" style="padding:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:1.05rem; color:#60a5fa;">${d.department_name} (${d.department_code})</strong>
              <span class="badge badge-normal">${d.total_tokens} tokens today</span>
            </div>
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.5rem; margin-top:0.75rem; text-align:center;">
              <div style="background:var(--bg-surface-elevated); padding:0.4rem; border-radius:var(--radius-sm);">
                <div style="font-size:0.75rem; color:var(--text-muted);">Waiting</div>
                <div style="font-weight:700; color:#d1d5db;">${d.waiting}</div>
              </div>
              <div style="background:var(--bg-surface-elevated); padding:0.4rem; border-radius:var(--radius-sm);">
                <div style="font-size:0.75rem; color:var(--text-muted);">Done</div>
                <div style="font-weight:700; color:#34d399;">${d.done}</div>
              </div>
              <div style="background:var(--bg-surface-elevated); padding:0.4rem; border-radius:var(--radius-sm);">
                <div style="font-size:0.75rem; color:var(--text-muted);">No-Show</div>
                <div style="font-weight:700; color:#f87171;">${d.no_show}</div>
              </div>
            </div>
          </div>
        `
          )
          .join("");
      }
    } catch (err) {}
  },

  async loadUsers() {
    try {
      const users = await BaariApp.fetchApi("/api/admin/users");
      this.users = users;
      const tbody = document.getElementById("adm-users-tbody");
      if (!tbody) return;

      tbody.innerHTML = users
        .map((u) => {
          const isMe = u.id === BaariApp.currentUser?.id;
          const statusBtn = isMe
            ? `<span style="color:var(--text-dim); font-size:0.8rem;">(Current)</span>`
            : `
            <button class="btn ${u.active ? "btn-danger" : "btn-success"}" 
                    style="padding:0.2rem 0.5rem; font-size:0.75rem;" 
                    onclick="BaariAdmin.toggleUser(${u.id})">
              ${u.active ? "Disable" : "Enable"}
            </button>
            <button class="btn btn-secondary" 
                    style="padding:0.2rem 0.5rem; font-size:0.75rem; margin-left:0.25rem;" 
                    onclick="BaariAdmin.promptResetPassword(${u.id}, '${u.username}')">
              Reset Pass
            </button>
          `;

          return `
          <tr>
            <td><strong>${u.username}</strong></td>
            <td><span class="badge ${u.role === "admin" ? "badge-priority" : "badge-normal"}">${u.role}</span></td>
            <td>${u.department_name || "All Departments (Admin)"}</td>
            <td><span class="badge ${u.active ? "badge-called" : "badge-done"}">${u.active ? "Active" : "Disabled"}</span></td>
            <td>${statusBtn}</td>
          </tr>
        `;
        })
        .join("");
    } catch (err) {}
  },

  async toggleUser(userId) {
    try {
      await BaariApp.fetchApi(`/api/admin/users/${userId}/toggle`, { method: "POST" });
      BaariApp.showToast("User status updated", "info");
      this.loadUsers();
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  async promptResetPassword(userId, username) {
    const newPass = prompt(`Enter new password for ${username} (min 8 chars):`);
    if (!newPass) return;
    if (newPass.length < 8) {
      alert("Password must be at least 8 characters long");
      return;
    }

    try {
      await BaariApp.fetchApi(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: newPass }),
      });
      BaariApp.showToast(`Password reset for ${username}`, "success");
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  async loadDepartments() {
    try {
      const depts = await BaariApp.fetchApi("/api/admin/departments");
      this.departments = depts;

      // Populate department select in Add User modal
      const userDeptSelect = document.getElementById("new-user-dept");
      if (userDeptSelect) {
        userDeptSelect.innerHTML = depts
          .map((d) => `<option value="${d.id}">${d.name} (${d.code})</option>`)
          .join("");
      }

      // Populate department select in Add Doctor modal
      const docDeptSelect = document.getElementById("new-doc-dept");
      if (docDeptSelect) {
        docDeptSelect.innerHTML = depts
          .map((d) => `<option value="${d.id}">${d.name} (${d.code})</option>`)
          .join("");
      }
    } catch (err) {}
  },

  async loadAuditLogs() {
    try {
      const logs = await BaariApp.fetchApi("/api/admin/audit?per_page=40");
      this.auditLogs = logs;
      const tbody = document.getElementById("adm-audit-tbody");
      if (!tbody) return;

      tbody.innerHTML = logs
        .map((l) => {
          const dt = new Date(l.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          return `
          <tr>
            <td style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">${dt}</td>
            <td><strong>${l.action}</strong></td>
            <td><span class="badge ${l.actor_role === "admin" ? "badge-priority" : "badge-normal"}">${l.actor_username || l.actor_role}</span></td>
            <td style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${l.details || ""}">
              ${l.details || "—"}
            </td>
          </tr>
        `;
        })
        .join("");
    } catch (err) {}
  },

  // ── Create User ─────────────────────────────────────────────────────────
  openAddUserModal() {
    const modal = document.getElementById("add-user-modal");
    if (modal) modal.showModal();
  },

  closeAddUserModal() {
    const modal = document.getElementById("add-user-modal");
    if (modal) modal.close();
  },

  async handleAddUser(e) {
    e.preventDefault();
    const u = document.getElementById("new-username").value.trim();
    const p = document.getElementById("new-password").value;
    const r = document.getElementById("new-role").value;
    const d = document.getElementById("new-user-dept").value;

    try {
      await BaariApp.fetchApi("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: u,
          password: p,
          role: r,
          department_id: r === "staff" ? parseInt(d, 10) : null,
        }),
      });

      BaariApp.showToast(`User ${u} created successfully`, "success");
      this.closeAddUserModal();
      document.getElementById("add-user-form").reset();
      this.loadUsers();
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  // ── Create Department ───────────────────────────────────────────────────
  openAddDeptModal() {
    const modal = document.getElementById("add-dept-modal");
    if (modal) modal.showModal();
  },

  closeAddDeptModal() {
    const modal = document.getElementById("add-dept-modal");
    if (modal) modal.close();
  },

  async handleAddDept(e) {
    e.preventDefault();
    const name = document.getElementById("new-dept-name").value.trim();
    const code = document.getElementById("new-dept-code").value.trim().toUpperCase();
    const avg = parseFloat(document.getElementById("new-dept-avg").value || 8.0);

    try {
      await BaariApp.fetchApi("/api/admin/departments", {
        method: "POST",
        body: JSON.stringify({ name, code, avg_service_minutes: avg }),
      });

      BaariApp.showToast(`Department ${name} created`, "success");
      this.closeAddDeptModal();
      document.getElementById("add-dept-form").reset();
      this.loadDepartments();
      this.loadSummary();
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  // ── Reset Day Queue ─────────────────────────────────────────────────────
  async resetDay() {
    if (!confirm("Are you sure you want to reset today's queue? All tokens and consultations for today will be cleared.")) return;
    try {
      const res = await BaariApp.fetchApi("/api/admin/reset-day", { method: "POST" });
      BaariApp.showToast(res.message, "info");
      this.loadSummary();
      this.loadAuditLogs();
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },
};
