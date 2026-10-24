/**
 * Baari — static/js/staff.js
 * Staff Queue Console: Real-time department queue board, Call Next with chime,
 * service timer, Walk-in token generator, priority override, and doctor status toggles.
 */

window.BaariStaff = {
  activeDeptId: null,
  pollTimer: null,
  doctors: [],
  selectedTokenForPriority: null,

  init() {
    this.setupView();
    this.refreshQueue();

    // Auto refresh queue every 8 seconds
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.refreshQueue(false), 8000);
  },

  async setupView() {
    // Check if user is logged in
    if (!BaariApp.currentUser) {
      document.getElementById("staff-login-warning").style.display = "block";
      document.getElementById("staff-console-content").style.display = "none";
      return;
    }

    document.getElementById("staff-login-warning").style.display = "none";
    document.getElementById("staff-console-content").style.display = "block";

    // Setup Department Dropdown
    const deptSelect = document.getElementById("staff-dept-select");
    if (!deptSelect) return;

    if (BaariApp.currentUser.role === "staff") {
      this.activeDeptId = BaariApp.currentUser.department_id;
      deptSelect.innerHTML = `<option value="${this.activeDeptId}" selected>${BaariApp.currentUser.department_name}</option>`;
      deptSelect.disabled = true;
    } else {
      // Admin can select any department
      try {
        const depts = await BaariApp.fetchApi("/api/patient/departments");
        deptSelect.innerHTML = depts
          .map((d) => `<option value="${d.id}">${d.name} (${d.code})</option>`)
          .join("");
        deptSelect.disabled = false;
        if (!this.activeDeptId && depts.length) {
          this.activeDeptId = depts[0].id;
        }
        deptSelect.value = this.activeDeptId;
        deptSelect.onchange = (e) => {
          this.activeDeptId = parseInt(e.target.value, 10);
          this.refreshQueue();
        };
      } catch (e) {}
    }

    this.loadDoctors();
  },

  async loadDoctors() {
    if (!this.activeDeptId) return;
    try {
      const docs = await BaariApp.fetchApi(`/api/staff/doctors?department_id=${this.activeDeptId}`);
      this.doctors = docs;
      this.renderDoctorsRoster();
    } catch (err) {}
  },

  renderDoctorsRoster() {
    const container = document.getElementById("staff-doctors-roster");
    if (!container) return;

    if (!this.doctors.length) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem;">No doctors registered</div>`;
      return;
    }

    container.innerHTML = this.doctors
      .map(
        (doc) => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-surface-elevated); padding:0.45rem 0.75rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle); margin-bottom:0.4rem;">
        <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">
          ${doc.name}
        </span>
        <button class="btn ${doc.active ? "btn-success" : "btn-secondary"}" 
                style="padding:0.2rem 0.6rem; font-size:0.75rem;" 
                onclick="BaariStaff.toggleDoctor(${doc.id})">
          ${doc.active ? "Active" : "Away"}
        </button>
      </div>
    `
      )
      .join("");
  },

  async toggleDoctor(docId) {
    try {
      await BaariApp.fetchApi(`/api/staff/doctors/${docId}/toggle`, { method: "POST" });
      BaariApp.showToast("Doctor status updated", "info");
      await this.loadDoctors();
      this.refreshQueue(false);
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  async refreshQueue(showToastOnError = true) {
    if (!BaariApp.currentUser) return;
    try {
      const url = this.activeDeptId ? `/api/staff/queue?department_id=${this.activeDeptId}` : "/api/staff/queue";
      const board = await BaariApp.fetchApi(url);
      this.renderBoard(board);
    } catch (err) {
      if (showToastOnError) BaariApp.showToast(err.message, "error");
    }
  },

  renderBoard(board) {
    document.getElementById("staff-stat-active-docs").textContent = `${board.active_doctors} / ${board.total_doctors}`;
    document.getElementById("staff-stat-waiting").textContent = board.waiting_count;
    document.getElementById("staff-stat-called").textContent = board.called_count;
    document.getElementById("staff-stat-done").textContent = board.done_today;
    document.getElementById("staff-stat-avg-service").textContent = `${board.avg_service_minutes} min`;

    // Capacity recommendation alert
    const capAlert = document.getElementById("staff-capacity-alert");
    if (capAlert) {
      if (board.consider_opening_counter) {
        capAlert.style.display = "flex";
        document.getElementById("staff-capacity-msg").textContent = `High Queue Load (${board.waiting_count} waiting). Activating an additional doctor counter can save ~${board.estimated_improvement_minutes} minutes per patient.`;
      } else {
        capAlert.style.display = "none";
      }
    }

    // Render Queue Table
    const tbody = document.getElementById("staff-queue-tbody");
    if (!tbody) return;

    if (!board.queue.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">No active tokens in queue today</td></tr>`;
      return;
    }

    tbody.innerHTML = board.queue
      .map((item) => {
        const isCalled = item.status === "called";
        const rowClass = isCalled ? "row-called" : "";

        // Status badge
        let statusBadge = `<span class="badge badge-waiting">Waiting</span>`;
        if (isCalled) statusBadge = `<span class="badge badge-called">IN CABIN</span>`;

        // Priority badge
        let priorityBadge = `<span class="badge badge-normal">Normal</span>`;
        if (item.priority_class === "priority") {
          priorityBadge = `<span class="badge badge-priority" title="${item.priority_reason || ""}">Priority</span>`;
        } else if (item.priority_class === "emergency") {
          priorityBadge = `<span class="badge badge-emergency" title="${item.priority_reason || ""}">Emergency</span>`;
        }

        // Location expectation
        let locationBadge = `<span style="color:var(--text-muted); font-size:0.8rem;">🏠 At home</span>`;
        if (item.is_expected_in_hall || isCalled) {
          locationBadge = `<span style="color:#34d399; font-weight:700; font-size:0.8rem;">📍 In Hall</span>`;
        }

        // Action buttons
        let actions = "";
        if (isCalled) {
          actions = `
          <button class="btn btn-success" style="padding:0.3rem 0.7rem; font-size:0.8rem;" onclick="BaariStaff.markDone(${item.token_id})">
            ✓ Done
          </button>
          <button class="btn btn-danger" style="padding:0.3rem 0.6rem; font-size:0.8rem; margin-left:0.3rem;" onclick="BaariStaff.markNoShow(${item.token_id})">
            No-Show
          </button>
        `;
        } else {
          actions = `
          <button class="btn btn-secondary" style="padding:0.3rem 0.6rem; font-size:0.75rem;" onclick="BaariStaff.openPriorityModal(${item.token_id}, '${item.priority_class}', '${item.priority_reason || ""}')">
            Priority
          </button>
        `;
        }

        return `
        <tr class="${rowClass}">
          <td><strong style="color:#38bdf8; font-family:var(--font-mono); font-size:1.05rem;">${item.token_number}</strong></td>
          <td><strong>${item.patient_name}</strong><br><small style="color:var(--text-muted);">${item.phone_masked || "No phone"}</small></td>
          <td>${priorityBadge}</td>
          <td>${statusBadge}</td>
          <td>${locationBadge}</td>
          <td>${isCalled ? "Being served" : `~${item.wait_estimate_min || 0}m`}</td>
          <td>${actions}</td>
        </tr>
      `;
      })
      .join("");
  },

  // ── Actions ─────────────────────────────────────────────────────────────
  async callNext() {
    try {
      const url = this.activeDeptId ? `/api/staff/call-next?department_id=${this.activeDeptId}` : "/api/staff/call-next";
      const token = await BaariApp.fetchApi(url, { method: "POST" });

      // Play audio chime and voice announcement
      BaariApp.playAnnouncementChime();
      BaariApp.speak(`Token number ${token.token_number}, ${token.patient_name}, please proceed to the doctor cabin.`, currentLang);

      BaariApp.showToast(`Called token ${token.token_number}`, "success");
      this.refreshQueue(false);
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  async markDone(tokenId) {
    try {
      await BaariApp.fetchApi(`/api/staff/token/${tokenId}/done`, { method: "POST" });
      BaariApp.showToast("Visit completed", "success");
      this.refreshQueue(false);
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  async markNoShow(tokenId) {
    if (!confirm("Are you sure you want to mark this patient as No-Show?")) return;
    try {
      await BaariApp.fetchApi(`/api/staff/token/${tokenId}/no-show`, { method: "POST" });
      BaariApp.showToast("Patient marked as No-Show", "info");
      this.refreshQueue(false);
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  // ── Issue Walk-in Modal ──────────────────────────────────────────────────
  openWalkinModal() {
    const modal = document.getElementById("walkin-modal");
    if (modal) modal.showModal();
  },

  closeWalkinModal() {
    const modal = document.getElementById("walkin-modal");
    if (modal) modal.close();
  },

  async handleWalkinSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("walkin-name").value.trim();
    const phone = document.getElementById("walkin-phone").value.trim();
    const priority = document.getElementById("walkin-priority").value;
    const reason = document.getElementById("walkin-reason").value.trim();

    if (!name) {
      BaariApp.showToast("Please enter patient name", "error");
      return;
    }
    if (priority !== "normal" && !reason) {
      BaariApp.showToast("Priority reason is mandatory for priority/emergency cases", "error");
      return;
    }

    try {
      const token = await BaariApp.fetchApi("/api/staff/issue-token", {
        method: "POST",
        body: JSON.stringify({
          name,
          department_id: this.activeDeptId,
          phone: phone || null,
          priority_class: priority,
          priority_reason: reason || null,
        }),
      });

      BaariApp.showToast(`Walk-in Token ${token.token_number} issued (PIN: ${token.pin})`, "success");
      this.closeWalkinModal();
      document.getElementById("walkin-form").reset();
      this.refreshQueue(false);
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },

  // ── Priority Modal ──────────────────────────────────────────────────────
  openPriorityModal(tokenId, currentClass, currentReason) {
    this.selectedTokenForPriority = tokenId;
    const modal = document.getElementById("priority-modal");
    if (!modal) return;
    document.getElementById("priority-select").value = currentClass;
    document.getElementById("priority-reason-input").value = currentReason;
    modal.showModal();
  },

  closePriorityModal() {
    const modal = document.getElementById("priority-modal");
    if (modal) modal.close();
  },

  async handlePrioritySubmit(e) {
    e.preventDefault();
    if (!this.selectedTokenForPriority) return;
    const pClass = document.getElementById("priority-select").value;
    const reason = document.getElementById("priority-reason-input").value.trim();

    if (pClass !== "normal" && !reason) {
      BaariApp.showToast("Reason is required when setting priority or emergency", "error");
      return;
    }

    try {
      await BaariApp.fetchApi(`/api/staff/token/${this.selectedTokenForPriority}/priority`, {
        method: "PUT",
        body: JSON.stringify({ priority_class: pClass, priority_reason: reason || null }),
      });
      BaariApp.showToast("Priority updated successfully", "success");
      this.closePriorityModal();
      this.refreshQueue(false);
    } catch (err) {
      BaariApp.showToast(err.message, "error");
    }
  },
};
