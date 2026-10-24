/**
 * Baari — static/js/display.js
 * Waiting Hall Display Board: Full-screen TV mode for hospital waiting halls.
 * Shows currently called tokens, doctor cabin assignments, up-next queue,
 * and plays automatic airport chime + neural voice announcements.
 */

window.BaariDisplay = {
  pollTimer: null,
  lastCalledTokenIds: new Set(),
  voiceEnabled: true,

  init() {
    this.render();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.render(false), 5000);
  },

  async render(showToastNotice = true) {
    const container = document.getElementById("display-board-content");
    if (!container) return;

    try {
      // Fetch departments and active queue
      const depts = await BaariApp.fetchApi("/api/patient/departments");
      const boardData = [];

      for (const d of depts) {
        try {
          const board = await BaariApp.fetchApi(`/api/staff/queue?department_id=${d.id}`);
          boardData.push({ department: d, board: board });
        } catch (e) {}
      }

      this.renderBoardDOM(boardData);

      // Check for newly called tokens to announce aloud
      boardData.forEach(({ board, department }) => {
        board.queue.forEach((item) => {
          if (item.status === "called" && !this.lastCalledTokenIds.has(item.id)) {
            this.lastCalledTokenIds.add(item.id);
            if (this.voiceEnabled) {
              this.announceToken(item, department);
            }
          }
        });
      });
    } catch (err) {
      console.warn("Display board refresh error:", err);
    }
  },

  announceToken(item, department) {
    BaariApp.playAnnouncementChime();
    let text = "";
    if (currentLang === "hi") {
      text = `टोकन नंबर ${item.token_number}, ${item.patient_name}, कृपया ${department.name} डॉक्टर केबिन में जाएं।`;
    } else if (currentLang === "mr") {
      text = `टोकन क्रमांक ${item.token_number}, ${item.patient_name}, कृपया ${department.name} डॉक्टरांच्या केबिनमध्ये जावे.`;
    } else {
      text = `Attention please: Token number ${item.token_number}, ${item.patient_name}, please proceed to ${department.name} cabin.`;
    }
    BaariApp.speak(text, currentLang);
  },

  renderBoardDOM(data) {
    const nowServingGrid = document.getElementById("display-now-serving-grid");
    const upNextTbody = document.getElementById("display-upnext-tbody");
    if (!nowServingGrid || !upNextTbody) return;

    // Filter called tokens
    const calledItems = [];
    const waitingItems = [];

    data.forEach(({ department, board }) => {
      board.queue.forEach((item) => {
        if (item.status === "called") {
          calledItems.push({ ...item, deptName: department.name, deptCode: department.code });
        } else if (item.status === "waiting") {
          waitingItems.push({ ...item, deptName: department.name, deptCode: department.code });
        }
      });
    });

    // Render Now Serving
    if (!calledItems.length) {
      nowServingGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: var(--bg-surface-elevated); border-radius: var(--radius-lg); border: 1px dashed var(--border-glass);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🩺</div>
          <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-muted);">Waiting for doctor to call next patient...</div>
          <div style="font-size: 0.85rem; color: var(--text-dim); margin-top: 0.25rem;">Staff can click "Call Next" in Staff Console</div>
        </div>
      `;
    } else {
      nowServingGrid.innerHTML = calledItems
        .map(
          (item) => `
        <div class="card display-serving-card pulse-active" style="position: relative; overflow: hidden; border: 2px solid var(--color-success); box-shadow: 0 0 30px rgba(16, 185, 129, 0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
            <span class="badge badge-called" style="font-size:0.85rem; letter-spacing:1px; font-weight:800;">🔔 NOW SERVING</span>
            <span style="font-size: 0.85rem; font-weight: 700; color: var(--color-primary-light);">${item.deptName}</span>
          </div>
          <div style="text-align: center; margin: 1rem 0;">
            <div class="token-big-num" style="font-size: 3.5rem!important; line-height: 1; letter-spacing: 2px; text-shadow: 0 0 25px rgba(99, 102, 241, 0.6);">${item.token_number}</div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-top: 0.5rem;">${item.patient_name}</div>
          </div>
          <div style="background: var(--bg-glass); padding: 0.75rem; border-radius: var(--radius-md); text-align: center; border: 1px solid var(--border-subtle); display:flex; justify-content:space-around;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted);">Cabin Assignment</div>
              <strong style="color:var(--color-success); font-size:1.05rem;">Cabin 1</strong>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-muted);">Priority</div>
              <strong style="color:var(--text-main);">${item.priority_class.toUpperCase()}</strong>
            </div>
          </div>
        </div>
      `
        )
        .join("");
    }

    // Render Up Next Queue Table (First 10)
    if (!waitingItems.length) {
      upNextTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">No patients currently in queue</td></tr>`;
    } else {
      upNextTbody.innerHTML = waitingItems
        .slice(0, 10)
        .map(
          (item, idx) => `
        <tr>
          <td><span style="font-weight:800; color:var(--text-dim); font-size:0.9rem;">#${idx + 1}</span></td>
          <td><strong style="color:var(--color-primary-light); font-family:var(--font-mono); font-size:1.1rem;">${item.token_number}</strong></td>
          <td><strong>${item.patient_name}</strong></td>
          <td><span style="color:var(--text-muted); font-size:0.88rem;">${item.deptName}</span></td>
          <td><span class="badge badge-waiting">~${item.wait_estimate_min || 0}m wait</span></td>
        </tr>
      `
        )
        .join("");
    }
  },

  toggleVoice() {
    this.voiceEnabled = !this.voiceEnabled;
    const btn = document.getElementById("display-voice-toggle");
    if (btn) {
      btn.textContent = this.voiceEnabled ? "🔊 Voice Announcements: ON" : "🔇 Voice Announcements: OFF";
      btn.className = this.voiceEnabled ? "btn btn-success" : "btn btn-secondary";
    }
    BaariApp.showToast(`Voice announcements ${this.voiceEnabled ? "enabled" : "muted"}`, "info");
  },
};
