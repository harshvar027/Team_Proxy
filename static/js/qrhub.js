/**
 * Baari — static/js/qrhub.js
 * Hospital QR Hub & Official Poster Generator:
 * Generates custom, high-resolution QR codes and printable official OPD posters
 * with hospital headers, department routing, and bilingual instructions.
 */

window.BaariQRHub = {
  currentQR: null,

  init() {
    this.populateDepartments();
    this.generateQR();
  },

  async populateDepartments() {
    const select = document.getElementById("qrhub-dept-select");
    if (!select) return;

    try {
      const depts = await BaariApp.fetchApi("/api/patient/departments");
      select.innerHTML = `
        <option value="" selected>All Departments (Hospital Main OPD Entrance)</option>
        ${depts.map((d) => `<option value="${d.id}">${d.name} (${d.code})</option>`).join("")}
      `;
    } catch (e) {}
  },

  generateQR() {
    const hospName = document.getElementById("qrhub-hosp-name")?.value.trim() || "District Civil Hospital";
    const hospCode = document.getElementById("qrhub-hosp-code")?.value.trim() || "BAARI-GH-MUM-001";
    const deptId = document.getElementById("qrhub-dept-select")?.value || "";
    const container = document.getElementById("qrhub-qr-canvas-box");
    if (!container) return;

    container.innerHTML = "";

    const origin = window.location.origin;
    let targetUrl = `${origin}/?qr=1&hospital=${encodeURIComponent(hospName)}&code=${encodeURIComponent(hospCode)}`;
    if (deptId) {
      targetUrl += `&dept=${deptId}`;
    }

    const qrWrapper = document.createElement("div");
    qrWrapper.id = "qrhub-active-qrcode";
    qrWrapper.style.padding = "16px";
    qrWrapper.style.background = "#ffffff";
    qrWrapper.style.borderRadius = "16px";
    qrWrapper.style.display = "inline-block";
    qrWrapper.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";
    container.appendChild(qrWrapper);

    if (window.QRCode) {
      this.currentQR = new QRCode(qrWrapper, {
        text: targetUrl,
        width: 220,
        height: 220,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    }

    // Update target URL display
    const urlDisplay = document.getElementById("qrhub-target-url-display");
    if (urlDisplay) urlDisplay.textContent = targetUrl;

    // Update poster preview
    const prevHosp = document.getElementById("qrhub-prev-hosp");
    if (prevHosp) prevHosp.textContent = hospName;

    const prevCode = document.getElementById("qrhub-prev-code");
    if (prevCode) prevCode.textContent = `Hospital Code: ${hospCode}`;
  },

  copyUrl() {
    const urlDisplay = document.getElementById("qrhub-target-url-display");
    if (!urlDisplay) return;
    const url = urlDisplay.textContent;
    navigator.clipboard.writeText(url).then(() => {
      BaariApp.showToast("Patient registration URL copied!", "success");
    }).catch(() => {
      prompt("Copy URL:", url);
    });
  },

  printPoster() {
    const hospName = document.getElementById("qrhub-hosp-name")?.value.trim() || "District Civil Hospital";
    const hospCode = document.getElementById("qrhub-hosp-code")?.value.trim() || "BAARI-GH-MUM-001";
    const targetUrl = document.getElementById("qrhub-target-url-display")?.textContent || window.location.href;

    if (window.BaariAdmin && window.BaariAdmin.printHospitalPoster) {
      window.BaariAdmin.printHospitalPoster(hospName, hospCode, targetUrl);
    }
  },

  downloadQRImage() {
    const qrWrapper = document.getElementById("qrhub-active-qrcode");
    if (!qrWrapper) return;
    const img = qrWrapper.querySelector("img");
    const canvas = qrWrapper.querySelector("canvas");
    let src = "";
    if (img && img.src) src = img.src;
    else if (canvas) src = canvas.toDataURL("image/png");

    if (!src) {
      BaariApp.showToast("Could not export QR image", "error");
      return;
    }

    const a = document.createElement("a");
    a.href = src;
    a.download = `Baari_OPD_QR_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    BaariApp.showToast("QR Code downloaded as PNG", "success");
  },
};
