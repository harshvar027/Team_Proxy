export function bindHospitalQr({
  onHospital,
  statusEl,
  videoEl,
  canvasEl,
  wrapEl,
  startBtn,
  stopBtn,
  fileInput,
} = {}) {
  let scanStream = null;
  let scanTimer = 0;

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  async function applyHospitalFromQr(raw) {
    let parsedId = null;
    try {
      const url = new URL(raw, location.origin);
      parsedId = url.searchParams.get("hospital_id");
    } catch {
      const match = String(raw).match(/hospital_id=(\d+)/i);
      parsedId = match ? match[1] : null;
    }
    if (!parsedId) {
      setStatus("That QR is not a Baari hospital poster. Try another code.");
      return false;
    }
    if (typeof onHospital === "function") {
      return onHospital(Number(parsedId), setStatus);
    }
    location.href = `token.html?hospital_id=${encodeURIComponent(parsedId)}`;
    return true;
  }

  function stopScanner() {
    window.clearTimeout(scanTimer);
    if (scanStream) {
      scanStream.getTracks().forEach((track) => track.stop());
      scanStream = null;
    }
    if (videoEl) videoEl.srcObject = null;
    if (wrapEl) wrapEl.hidden = true;
    if (stopBtn) stopBtn.hidden = true;
    if (startBtn) startBtn.hidden = false;
  }

  function tickScan() {
    if (!scanStream || !videoEl || !canvasEl || typeof window.jsQR !== "function") return;
    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;
    if (width && height) {
      canvasEl.width = width;
      canvasEl.height = height;
      const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(videoEl, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const code = window.jsQR(image.data, width, height, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        stopScanner();
        applyHospitalFromQr(code.data);
        return;
      }
    }
    scanTimer = window.setTimeout(tickScan, 180);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser cannot open the camera. Upload a photo of the QR instead.");
      fileInput?.click();
      return;
    }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      videoEl.srcObject = scanStream;
      await videoEl.play();
      wrapEl.hidden = false;
      if (stopBtn) stopBtn.hidden = false;
      if (startBtn) startBtn.hidden = true;
      setStatus("Hold the hospital poster inside the frame.");
      tickScan();
    } catch {
      setStatus("Camera permission was blocked. Upload a photo of the QR instead.");
    }
  }

  startBtn?.addEventListener("click", startScanner);
  stopBtn?.addEventListener("click", () => {
    stopScanner();
    setStatus("Scanner stopped. You can still pick a hospital from the list.");
  });
  fileInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = typeof window.jsQR === "function"
        ? window.jsQR(image.data, canvas.width, canvas.height)
        : null;
      URL.revokeObjectURL(img.src);
      if (code?.data) applyHospitalFromQr(code.data);
      else setStatus("No QR found in that image.");
    };
    img.src = URL.createObjectURL(file);
  });
  window.addEventListener("pagehide", stopScanner);

  return { stopScanner, applyHospitalFromQr, setStatus };
}
