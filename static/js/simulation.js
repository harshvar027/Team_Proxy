/**
 * Baari — static/js/simulation.js
 * Discrete-event simulation runner and interactive Chart.js crowd visualizer.
 */

window.BaariSimulation = {
  chartInstance: null,

  init() {
    this.setupControls();
    // Run initial simulation
    this.run();
  },

  setupControls() {
    const patientsSlider = document.getElementById("sim-patients");
    const patientsVal = document.getElementById("sim-patients-val");
    if (patientsSlider && patientsVal) {
      patientsSlider.oninput = (e) => (patientsVal.textContent = e.target.value);
    }

    const docsSlider = document.getElementById("sim-doctors");
    const docsVal = document.getElementById("sim-doctors-val");
    if (docsSlider && docsVal) {
      docsSlider.oninput = (e) => (docsVal.textContent = e.target.value);
    }

    const adhSlider = document.getElementById("sim-adherence");
    const adhVal = document.getElementById("sim-adherence-val");
    if (adhSlider && adhVal) {
      adhSlider.oninput = (e) => (adhVal.textContent = `${Math.round(e.target.value * 100)}%`);
    }
  },

  async run() {
    const patients = parseInt(document.getElementById("sim-patients")?.value || 100, 10);
    const docs = parseInt(document.getElementById("sim-doctors")?.value || 3, 10);
    const adherence = parseFloat(document.getElementById("sim-adherence")?.value || 0.75);

    const btn = document.getElementById("sim-run-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Simulating...";
    }

    try {
      const res = await BaariApp.fetchApi("/api/simulation/run", {
        method: "POST",
        body: JSON.stringify({
          patients_per_day: patients,
          num_doctors: docs,
          follow_rate: adherence,
          seed: 42,
        }),
      });

      this.renderMetrics(res);
      this.renderChart(res.crowd_over_time);
    } catch (err) {
      BaariApp.showToast("Simulation error: " + err.message, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = t("sim_btn_run");
      }
    }
  },

  renderMetrics(res) {
    document.getElementById("sim-val-wait-red").textContent = `-${res.improvement_pct.wait_time_reduction}%`;
    document.getElementById("sim-val-wait-detail").textContent = `Dropped from ${res.baseline.average_wait_minutes}m to ${res.with_baari.average_wait_minutes}m in hall`;

    document.getElementById("sim-val-crowd-red").textContent = `-${res.improvement_pct.peak_crowd_reduction}%`;
    document.getElementById("sim-val-crowd-detail").textContent = `Peak reduced from ${res.baseline.peak_crowd} to ${res.with_baari.peak_crowd} patients`;

    document.getElementById("sim-val-hours-saved").textContent = `${res.improvement_pct.hours_saved} hrs`;
    document.getElementById("sim-val-hours-detail").textContent = `Total unproductive patient waiting eliminated`;
  },

  renderChart(crowdData) {
    const canvas = document.getElementById("sim-chart");
    if (!canvas || !window.Chart) return;

    const labels = Object.keys(crowdData);
    const baselinePoints = labels.map((l) => crowdData[l].baseline);
    const baariPoints = labels.map((l) => crowdData[l].baari);

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = canvas.getContext("2d");
    this.chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Without Baari (Pre-dawn 4 AM rush)",
            data: baselinePoints,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 2,
          },
          {
            label: "With Baari (Staggered Arrival Windows)",
            data: baariPoints,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.18)",
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "#d1d5db",
              font: { weight: "600", size: 12 },
            },
          },
          tooltip: {
            backgroundColor: "rgba(17, 24, 39, 0.95)",
            titleColor: "#f9fafb",
            bodyColor: "#d1d5db",
            borderColor: "rgba(255, 255, 255, 0.1)",
            borderWidth: 1,
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#9ca3af", maxRotation: 45 },
          },
          y: {
            title: {
              display: true,
              text: "Patients Standing in Waiting Hall",
              color: "#9ca3af",
            },
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { color: "#9ca3af" },
            beginAtZero: true,
          },
        },
      },
    });
  },
};
