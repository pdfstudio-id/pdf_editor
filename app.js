// Konfigurasi Worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// State Aplikasi
let pdfDocLib = null;
let pdfDocJs = null;
let currentPage = 0;
let pageAnnotations = [];
let fabricCanvas = null;
let currentRenderScale = 1.3;

// Elemen DOM
const pdfUpload = document.getElementById("pdf-upload");
const mergeUpload = document.getElementById("merge-upload");
const lblMergePdf = document.getElementById("lbl-merge-pdf");
const imageUpload = document.getElementById("image-upload");
const lblAddImage = document.getElementById("lbl-add-image");

const emptyState = document.getElementById("empty-state");
const editorContainer = document.getElementById("editor-container");
const pdfCanvas = document.getElementById("pdf-canvas");
const pageInfo = document.getElementById("page-info");

const btnDownload = document.getElementById("btn-download");
const btnAddText = document.getElementById("btn-add-text");
const btnWhiteout = document.getElementById("btn-whiteout");
const btnBgRemove = document.getElementById("btn-bg-remove");
const btnSign = document.getElementById("btn-sign");
const btnForm = document.getElementById("btn-form");
const btnDeleteObj = document.getElementById("btn-delete-obj");
const btnRotatePage = document.getElementById("btn-rotate-page");
const btnAddPage = document.getElementById("btn-add-page");
const btnDelPage = document.getElementById("btn-del-page");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");

// Inisialisasi Fabric Canvas
fabricCanvas = new fabric.Canvas("fabric-canvas");
setToolsEnabled(false);

function setToolsEnabled(enabled) {
  [
    btnDownload,
    btnAddText,
    btnWhiteout,
    btnBgRemove,
    btnSign,
    btnForm,
    btnDeleteObj,
    btnRotatePage,
    btnAddPage,
    btnDelPage,
  ].forEach((btn) => (btn.disabled = !enabled));

  imageUpload.disabled = !enabled;
  mergeUpload.disabled = !enabled;
  lblAddImage.classList.toggle("disabled", !enabled);
  lblMergePdf.classList.toggle("disabled", !enabled);
}

// 1. BUKA FILE PDF
pdfUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  await loadPdfFromBytes(new Uint8Array(arrayBuffer), true);

  emptyState.classList.add("hidden");
  editorContainer.classList.remove("hidden");
  setToolsEnabled(true);
});

async function loadPdfFromBytes(bytes, resetAnnotations = false) {
  pdfDocLib = await PDFLib.PDFDocument.load(bytes);
  pdfDocJs = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;

  if (resetAnnotations) {
    currentPage = 0;
    pageAnnotations = Array.from({ length: pdfDocLib.getPageCount() }, () => null);
  }

  await renderCurrentPage();
}

// 2. RENDER HALAMAN AKTIF (Responsif mengikuti lebar layar)
async function renderCurrentPage() {
  const totalPages = pdfDocLib.getPageCount();
  pageInfo.textContent = `Halaman ${currentPage + 1} / ${totalPages}`;
  btnPrev.disabled = currentPage === 0;
  btnNext.disabled = currentPage === totalPages - 1;
  btnDelPage.disabled = totalPages <= 1;

  const page = await pdfDocJs.getPage(currentPage + 1);
  const unscaledViewport = page.getViewport({ scale: 1 });
  const maxWidth = window.innerWidth - 24;
  currentRenderScale = Math.min(1.3, maxWidth / unscaledViewport.width);
  const viewport = page.getViewport({ scale: currentRenderScale });

  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  const ctx = pdfCanvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  fabricCanvas.setWidth(viewport.width);
  fabricCanvas.setHeight(viewport.height);
  fabricCanvas.clear();

  if (pageAnnotations[currentPage]) {
    fabricCanvas.loadFromJSON(pageAnnotations[currentPage], () => {
      fabricCanvas.renderAll();
    });
  }
}

function saveCurrentAnnotations() {
  if (pdfDocLib) {
    pageAnnotations[currentPage] = fabricCanvas.toJSON();
  }
}

// 3. NAVIGASI HALAMAN
btnPrev.addEventListener("click", async () => {
  if (currentPage > 0) {
    saveCurrentAnnotations();
    currentPage--;
    await renderCurrentPage();
  }
});

btnNext.addEventListener("click", async () => {
  if (currentPage < pdfDocLib.getPageCount() - 1) {
    saveCurrentAnnotations();
    currentPage++;
    await renderCurrentPage();
  }
});

// 4. GABUNG PDF (MERGE)
mergeUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !pdfDocLib) return;

  try {
    saveCurrentAnnotations();
    const mergeBytes = await file.arrayBuffer();
    const mergeDoc = await PDFLib.PDFDocument.load(mergeBytes);
    const copiedPages = await pdfDocLib.copyPages(mergeDoc, mergeDoc.getPageIndices());

    copiedPages.forEach((p) => {
      pdfDocLib.addPage(p);
      pageAnnotations.push(null);
    });

    const updatedBytes = await pdfDocLib.save();
    await loadPdfFromBytes(updatedBytes, false);
    alert(`Berhasil menggabungkan ${copiedPages.length} halaman baru!`);
  } catch (err) {
    alert("Gagal menggabungkan PDF: " + err.message);
  } finally {
    e.target.value = "";
  }
});

// 5. PUTAR HALAMAN 90°
btnRotatePage.addEventListener("click", async () => {
  if (!pdfDocLib) return;
  saveCurrentAnnotations();

  const page = pdfDocLib.getPage(currentPage);
  const currentRotation = page.getRotation().angle;
  page.setRotation(PDFLib.degrees((currentRotation + 90) % 360));

  const updatedBytes = await pdfDocLib.save();
  await loadPdfFromBytes(updatedBytes, false);
});

// 6. TAMBAH & HAPUS HALAMAN
btnAddPage.addEventListener("click", async () => {
  saveCurrentAnnotations();
  pdfDocLib.insertPage(currentPage + 1, [595.28, 841.89]);
  pageAnnotations.splice(currentPage + 1, 0, null);
  currentPage++;

  const updatedBytes = await pdfDocLib.save();
  await loadPdfFromBytes(updatedBytes, false);
});

btnDelPage.addEventListener("click", async () => {
  if (pdfDocLib.getPageCount() <= 1) return;
  if (!confirm(`Hapus halaman ${currentPage + 1}?`)) return;

  pdfDocLib.removePage(currentPage);
  pageAnnotations.splice(currentPage, 1);
  if (currentPage >= pdfDocLib.getPageCount()) {
    currentPage = pdfDocLib.getPageCount() - 1;
  }

  const updatedBytes = await pdfDocLib.save();
  await loadPdfFromBytes(updatedBytes, false);
});

// 7. TAMBAH TEKS, WHITEOUT, GAYA FONT & GAMBAR
btnAddText.addEventListener("click", () => {
  const text = new fabric.IText("Klik 2x untuk edit teks", {
    left: 60,
    top: 60,
    fontSize: 20,
    fill: "#000000",
    fontFamily: "Arial",
  });
  fabricCanvas.add(text);
  fabricCanvas.setActiveObject(text);
});

btnWhiteout.addEventListener("click", () => {
  const rect = new fabric.Rect({
    left: 80,
    top: 80,
    width: 160,
    height: 30,
    fill: "#ffffff",
    stroke: "#94a3b8",
    strokeWidth: 1,
    strokeDashArray: [4, 4],
  });
  fabricCanvas.add(rect);
  fabricCanvas.setActiveObject(rect);
});

// Toolbar Gaya Teks
const textToolbar = document.getElementById("text-toolbar");
const fontFamilySelect = document.getElementById("font-family");
const fontSizeInput = document.getElementById("font-size");
const btnBold = document.getElementById("btn-bold");
const btnItalic = document.getElementById("btn-italic");
const btnUnderline = document.getElementById("btn-underline");
const fontColorInput = document.getElementById("font-color");

function updateTextToolbar() {
  const obj = fabricCanvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    textToolbar.classList.remove("hidden");
    fontFamilySelect.value = obj.fontFamily || "Arial";
    fontSizeInput.value = obj.fontSize || 20;
    fontColorInput.value = obj.fill || "#000000";
    btnBold.classList.toggle("active-style", obj.fontWeight === "bold");
    btnItalic.classList.toggle("active-style", obj.fontStyle === "italic");
    btnUnderline.classList.toggle("active-style", !!obj.underline);
  } else {
    textToolbar.classList.add("hidden");
  }
}

fabricCanvas.on("selection:created", updateTextToolbar);
fabricCanvas.on("selection:updated", updateTextToolbar);
fabricCanvas.on("selection:cleared", updateTextToolbar);

fontFamilySelect.addEventListener("change", () => {
  const obj = fabricCanvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    obj.set("fontFamily", fontFamilySelect.value);
    fabricCanvas.renderAll();
  }
});

fontSizeInput.addEventListener("input", () => {
  const obj = fabricCanvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    obj.set("fontSize", parseInt(fontSizeInput.value, 10) || 20);
    fabricCanvas.renderAll();
  }
});

btnBold.addEventListener("click", () => {
  const obj = fabricCanvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    obj.set("fontWeight", obj.fontWeight === "bold" ? "normal" : "bold");
    fabricCanvas.renderAll();
    updateTextToolbar();
  }
});

btnItalic.addEventListener("click", () => {
  const obj = fabricCanvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    obj.set("fontStyle", obj.fontStyle === "italic" ? "normal" : "italic");
    fabricCanvas.renderAll();
    updateTextToolbar();
  }
});

btnUnderline.addEventListener("click", () => {
  const obj = fabricCanvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    obj.set("underline", !obj.underline);
    fabricCanvas.renderAll();
    updateTextToolbar();
  }
});

fontColorInput.addEventListener("input", () => {
  const obj = fabricCanvas.getActiveObject();
  if (obj && obj.type === "i-text") {
    obj.set("fill", fontColorInput.value);
    fabricCanvas.renderAll();
  }
});

imageUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    fabric.Image.fromURL(event.target.result, (img) => {
      img.scaleToWidth(200);
      img.set({ left: 80, top: 80 });
      fabricCanvas.add(img);
      fabricCanvas.setActiveObject(img);
    });
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

btnDeleteObj.addEventListener("click", () => {
  const activeObj = fabricCanvas.getActiveObject();
  if (activeObj) fabricCanvas.remove(activeObj);
});

// 8. MODAL TANDA TANGAN
const signModal = document.getElementById("sign-modal");
const signPad = document.getElementById("sign-pad");
const signCtx = signPad.getContext("2d");
let isDrawing = false;

signCtx.lineWidth = 3;
signCtx.lineCap = "round";
signCtx.strokeStyle = "#000000";

function getPos(e) {
  const rect = signPad.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const scaleX = signPad.width / rect.width;
  const scaleY = signPad.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

signPad.addEventListener("pointerdown", (e) => {
  isDrawing = true;
  const pos = getPos(e);
  signCtx.beginPath();
  signCtx.moveTo(pos.x, pos.y);
});

signPad.addEventListener("pointermove", (e) => {
  if (!isDrawing) return;
  const pos = getPos(e);
  signCtx.lineTo(pos.x, pos.y);
  signCtx.stroke();
});

window.addEventListener("pointerup", () => (isDrawing = false));

btnSign.addEventListener("click", () => {
  signCtx.clearRect(0, 0, signPad.width, signPad.height);
  signModal.classList.remove("hidden");
});

document.getElementById("btn-clear-sign").addEventListener("click", () => {
  signCtx.clearRect(0, 0, signPad.width, signPad.height);
});

document.getElementById("btn-cancel-sign").addEventListener("click", () => {
  signModal.classList.add("hidden");
});

document.getElementById("btn-save-sign").addEventListener("click", () => {
  const dataUrl = signPad.toDataURL("image/png");
  fabric.Image.fromURL(dataUrl, (img) => {
    img.scaleToWidth(180);
    img.set({ left: 100, top: 100 });
    fabricCanvas.add(img);
    fabricCanvas.setActiveObject(img);
  });
  signModal.classList.add("hidden");
});

// 9. ISI FORMULIR PDF (ACROFORM)
const formModal = document.getElementById("form-modal");
const formFieldsContainer = document.getElementById("form-fields-container");

btnForm.addEventListener("click", () => {
  if (!pdfDocLib) return;
  const form = pdfDocLib.getForm();
  const fields = form.getFields();

  if (fields.length === 0) {
    alert(
      "Dokumen PDF ini tidak memiliki kolom formulir interaktif (AcroForm).\nKamu tetap bisa mengisinya secara manual menggunakan tombol '📝 Teks'."
    );
    return;
  }

  formFieldsContainer.innerHTML = "";

  fields.forEach((field, index) => {
    const name = field.getName();
    const wrapper = document.createElement("div");
    wrapper.className = "form-group";

    if (field instanceof PDFLib.PDFTextField) {
      wrapper.innerHTML = `
        <label for="field-${index}">${name}</label>
        <input type="text" id="field-${index}" data-field-name="${name}" data-type="text" value="${field.getText() || ""}" />
      `;
    } else if (field instanceof PDFLib.PDFCheckBox) {
      wrapper.classList.add("form-group-checkbox");
      wrapper.innerHTML = `
        <input type="checkbox" id="field-${index}" data-field-name="${name}" data-type="checkbox" ${field.isChecked() ? "checked" : ""} />
        <label for="field-${index}">${name}</label>
      `;
    } else if (field instanceof PDFLib.PDFDropdown) {
      const options = field.getOptions();
      const selected = field.getSelected()[0] || "";
      const optionsHtml = options
        .map((opt) => `<option value="${opt}" ${opt === selected ? "selected" : ""}>${opt}</option>`)
        .join("");
      wrapper.innerHTML = `
        <label for="field-${index}">${name}</label>
        <select id="field-${index}" data-field-name="${name}" data-type="dropdown">
          <option value="">-- Pilih --</option>
          ${optionsHtml}
        </select>
      `;
    }

    if (wrapper.innerHTML) formFieldsContainer.appendChild(wrapper);
  });

  formModal.classList.remove("hidden");
});

document.getElementById("btn-cancel-form").addEventListener("click", () => {
  formModal.classList.add("hidden");
});

document.getElementById("btn-save-form").addEventListener("click", async () => {
  saveCurrentAnnotations();
  const form = pdfDocLib.getForm();
  const inputs = formFieldsContainer.querySelectorAll("[data-field-name]");

  inputs.forEach((el) => {
    const name = el.getAttribute("data-field-name");
    const type = el.getAttribute("data-type");

    try {
      if (type === "text") {
        form.getTextField(name).setText(el.value);
      } else if (type === "checkbox") {
        const cb = form.getCheckBox(name);
        el.checked ? cb.check() : cb.uncheck();
      } else if (type === "dropdown" && el.value) {
        form.getDropdown(name).select(el.value);
      }
    } catch (e) {
      console.warn(`Gagal mengisi field ${name}:`, e);
    }
  });

  formModal.classList.add("hidden");
  const updatedBytes = await pdfDocLib.save();
  await loadPdfFromBytes(updatedBytes, false);
});

// 10. HAPUS LATAR BELAKANG (AI, MANUAL, RESTORE & ZOOM)
const bgModal = document.getElementById("bg-modal");
const bgFileInput = document.getElementById("bg-file-input");
const btnBgReset = document.getElementById("btn-bg-reset");
const bgPreviewArea = document.getElementById("bg-preview-area");
const bgPreviewCanvas = document.getElementById("bg-preview-canvas");
const bgPreviewCtx = bgPreviewCanvas.getContext("2d", { willReadFrequently: true });
const bgStatusText = document.getElementById("bg-status-text");

const btnAiBg = document.getElementById("btn-ai-bg");
const modeColorBtn = document.getElementById("mode-color");
const modeBrushBtn = document.getElementById("mode-brush");
const modeRestoreBtn = document.getElementById("mode-restore");
const panelColor = document.getElementById("panel-color");
const panelBrush = document.getElementById("panel-brush");

const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const bgZoomVal = document.getElementById("bg-zoom-val");

const bgTolerance = document.getElementById("bg-tolerance");
const bgToleranceVal = document.getElementById("bg-tolerance-val");
const bgBrushSize = document.getElementById("bg-brush-size");
const bgBrushSizeVal = document.getElementById("bg-brush-size-val");
const btnSaveBg = document.getElementById("btn-save-bg");

const originalBgCanvas = document.createElement("canvas");
const originalBgCtx = originalBgCanvas.getContext("2d");

let originalBgImg = null;
let bgToolMode = "none";
let isDrawingBg = false;
let bgZoom = 1;
let baseDisplayW = 300;
let baseDisplayH = 240;

btnBgRemove.addEventListener("click", () => {
  bgModal.classList.remove("hidden");
});

document.getElementById("btn-cancel-bg").addEventListener("click", () => {
  bgModal.classList.add("hidden");
});

function applyBgZoom() {
  bgZoomVal.textContent = `${Math.round(bgZoom * 100)}%`;
  bgPreviewCanvas.style.width = `${Math.round(baseDisplayW * bgZoom)}px`;
  bgPreviewCanvas.style.height = `${Math.round(baseDisplayH * bgZoom)}px`;
}

btnZoomIn.addEventListener("click", () => {
  if (bgZoom < 3) {
    bgZoom = Math.min(3, +(bgZoom + 0.25).toFixed(2));
    applyBgZoom();
  }
});

btnZoomOut.addEventListener("click", () => {
  if (bgZoom > 0.5) {
    bgZoom = Math.max(0.5, +(bgZoom - 0.25).toFixed(2));
    applyBgZoom();
  }
});

function drawImageToBgCanvas(img, saveAsOriginal = false) {
  const maxDim = 800;
  let w = img.width;
  let h = img.height;

  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  bgPreviewCanvas.width = w;
  bgPreviewCanvas.height = h;
  bgPreviewCtx.clearRect(0, 0, w, h);
  bgPreviewCtx.drawImage(img, 0, 0, w, h);

  if (saveAsOriginal) {
    originalBgCanvas.width = w;
    originalBgCanvas.height = h;
    originalBgCtx.clearRect(0, 0, w, h);
    originalBgCtx.drawImage(img, 0, 0, w, h);

    const fitRatio = Math.min(420 / w, 240 / h, 1);
    baseDisplayW = Math.round(w * fitRatio);
    baseDisplayH = Math.round(h * fitRatio);
    bgZoom = 1;
    applyBgZoom();
  }
}

bgFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      originalBgImg = img;
      drawImageToBgCanvas(img, true);
      bgPreviewArea.classList.remove("hidden");
      btnSaveBg.disabled = false;
      btnBgReset.disabled = false;
      setBgMode("none");
      bgStatusText.textContent = "Pilih 'AI Otomatis' atau mode manual di atas.";
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

btnBgReset.addEventListener("click", () => {
  if (originalBgImg) {
    drawImageToBgCanvas(originalBgImg, true);
    bgStatusText.textContent = "Gambar dikembalikan ke kondisi awal.";
  }
});

function setBgMode(mode) {
  bgToolMode = mode;
  modeColorBtn.classList.toggle("active-mode", mode === "color");
  modeBrushBtn.classList.toggle("active-mode", mode === "brush");
  modeRestoreBtn.classList.toggle("active-mode", mode === "restore");

  panelColor.classList.toggle("hidden", mode !== "color");
  panelBrush.classList.toggle("hidden", mode !== "brush" && mode !== "restore");

  if (mode === "color") {
    bgStatusText.textContent = "Klik warna background pada gambar yang ingin dihapus.";
  } else if (mode === "brush") {
    bgStatusText.textContent = "Gosok bagian gambar yang ingin dihapus secara manual.";
  } else if (mode === "restore") {
    bgStatusText.textContent = "Gosok bagian yang terhapus untuk mengembalikannya.";
  }
}

modeColorBtn.addEventListener("click", () => setBgMode("color"));
modeBrushBtn.addEventListener("click", () => setBgMode("brush"));
modeRestoreBtn.addEventListener("click", () => setBgMode("restore"));

bgTolerance.addEventListener("input", () => {
  bgToleranceVal.textContent = bgTolerance.value;
});

bgBrushSize.addEventListener("input", () => {
  bgBrushSizeVal.textContent = bgBrushSize.value;
});

btnAiBg.addEventListener("click", async () => {
  if (!originalBgImg) return;

  setBgMode("none");
  btnAiBg.disabled = true;
  btnSaveBg.disabled = true;
  btnAiBg.textContent = "⏳ Memproses AI...";
  bgStatusText.textContent = "Menyiapkan model AI...";

  try {
    const resizedBlob = await new Promise((resolve) =>
      bgPreviewCanvas.toBlob(resolve, "image/png")
    );

    const { removeBackground } = await import(
      "https://esm.sh/@imgly/background-removal@1.4.5"
    );

    const resultBlob = await removeBackground(resizedBlob, {
      model: "small",
      progress: (key, current, total) => {
        if (total > 0) {
          const percent = Math.round((current / total) * 100);
          bgStatusText.textContent = `Memuat AI (${percent}%)...`;
        }
      },
    });

    const resultUrl = URL.createObjectURL(resultBlob);
    const img = new Image();
    img.onload = () => {
      drawImageToBgCanvas(img, false);
      URL.revokeObjectURL(resultUrl);
      bgStatusText.textContent = "Selesai! Gunakan Kuas Hapus/Kembalikan untuk merapikan.";
    };
    img.src = resultUrl;
  } catch (err) {
    console.error(err);
    bgStatusText.textContent = "AI gagal dimuat. Gunakan mode Klik Warna atau Kuas Manual.";
    alert("Gagal menjalankan AI Hapus BG: " + err.message);
  } finally {
    btnAiBg.disabled = false;
    btnSaveBg.disabled = false;
    btnAiBg.textContent = "🤖 AI Otomatis";
  }
});

function getBgCanvasPos(e) {
  const rect = bgPreviewCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const scaleX = bgPreviewCanvas.width / rect.width;
  const scaleY = bgPreviewCanvas.height / rect.height;
  return {
    x: Math.floor((clientX - rect.left) * scaleX),
    y: Math.floor((clientY - rect.top) * scaleY),
  };
}

function removeColorAt(x, y) {
  const w = bgPreviewCanvas.width;
  const h = bgPreviewCanvas.height;
  const imgData = bgPreviewCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const idx = (y * w + x) * 4;
  const targetR = data[idx];
  const targetG = data[idx + 1];
  const targetB = data[idx + 2];
  if (data[idx + 3] === 0) return;

  const tolerance = parseInt(bgTolerance.value, 10);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const dist = Math.sqrt(
      Math.pow(data[i] - targetR, 2) +
      Math.pow(data[i + 1] - targetG, 2) +
      Math.pow(data[i + 2] - targetB, 2)
    );
    if (dist <= tolerance) {
      data[i + 3] = 0;
    }
  }

  bgPreviewCtx.putImageData(imgData, 0, 0);
}

function eraseBrushAt(x, y) {
  const radius = parseInt(bgBrushSize.value, 10);
  bgPreviewCtx.save();
  bgPreviewCtx.globalCompositeOperation = "destination-out";
  bgPreviewCtx.beginPath();
  bgPreviewCtx.arc(x, y, radius, 0, Math.PI * 2);
  bgPreviewCtx.fill();
  bgPreviewCtx.restore();
}

function restoreBrushAt(x, y) {
  const radius = parseInt(bgBrushSize.value, 10);
  bgPreviewCtx.save();
  bgPreviewCtx.beginPath();
  bgPreviewCtx.arc(x, y, radius, 0, Math.PI * 2);
  bgPreviewCtx.clip();
  bgPreviewCtx.drawImage(originalBgCanvas, 0, 0);
  bgPreviewCtx.restore();
}

bgPreviewCanvas.addEventListener("pointerdown", (e) => {
  const pos = getBgCanvasPos(e);
  if (bgToolMode === "color") {
    removeColorAt(pos.x, pos.y);
  } else if (bgToolMode === "brush") {
    isDrawingBg = true;
    eraseBrushAt(pos.x, pos.y);
  } else if (bgToolMode === "restore") {
    isDrawingBg = true;
    restoreBrushAt(pos.x, pos.y);
  }
});

bgPreviewCanvas.addEventListener("pointermove", (e) => {
  if (!isDrawingBg) return;
  const pos = getBgCanvasPos(e);
  if (bgToolMode === "brush") {
    eraseBrushAt(pos.x, pos.y);
  } else if (bgToolMode === "restore") {
    restoreBrushAt(pos.x, pos.y);
  }
});

window.addEventListener("pointerup", () => {
  isDrawingBg = false;
});

btnSaveBg.addEventListener("click", () => {
  const dataUrl = bgPreviewCanvas.toDataURL("image/png");
  fabric.Image.fromURL(dataUrl, (img) => {
    img.scaleToWidth(200);
    img.set({ left: 100, top: 100 });
    fabricCanvas.add(img);
    fabricCanvas.setActiveObject(img);
  });
  bgModal.classList.add("hidden");
});

// 11. SIMPAN & DOWNLOAD PDF
btnDownload.addEventListener("click", async () => {
  saveCurrentAnnotations();
  btnDownload.textContent = "⏳ Memproses...";
  btnDownload.disabled = true;

  try {
    const bytes = await pdfDocLib.save();
    const finalPdf = await PDFLib.PDFDocument.load(bytes);
    const pages = finalPdf.getPages();

    const tempCanvasEl = document.createElement("canvas");
    const tempFabric = new fabric.StaticCanvas(tempCanvasEl);

    for (let i = 0; i < pages.length; i++) {
      const json = pageAnnotations[i];
      if (!json || !json.objects || json.objects.length === 0) continue;

      const pdfJsPage = await pdfDocJs.getPage(i + 1);
      const viewport = pdfJsPage.getViewport({ scale: currentRenderScale });

      tempFabric.setWidth(viewport.width);
      tempFabric.setHeight(viewport.height);

      await new Promise((resolve) => {
        tempFabric.loadFromJSON(json, () => {
          tempFabric.getObjects().forEach((obj) => {
            if (obj.type === "rect" && obj.fill === "#ffffff") {
              obj.set({
                stroke: "transparent",
                strokeWidth: 0,
                strokeDashArray: null,
              });
            }
          });
          tempFabric.renderAll();
          resolve();
        });
      });

      const overlayDataUrl = tempFabric.toDataURL({ format: "png", multiplier: 2 });
      const pngImage = await finalPdf.embedPng(overlayDataUrl);

      const { width, height } = pages[i].getSize();
      pages[i].drawImage(pngImage, { x: 0, y: 0, width, height });
    }

    const finalBytes = await finalPdf.save();
    const blob = new Blob([finalBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "dokumen-diedit.pdf";
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Gagal menyimpan PDF: " + err.message);
  } finally {
    btnDownload.textContent = "💾 Simpan PDF";
    btnDownload.disabled = false;
  }
});

// 12. PENGATURAN TEMA WARNA & MODE SIANG/MALAM
const themeSelect = document.getElementById("theme-select");
const btnThemeMode = document.getElementById("btn-theme-mode");

function applySavedTheme() {
  const savedTheme = localStorage.getItem("pdfStudioTheme") || "indigo";
  const savedMode = localStorage.getItem("pdfStudioMode") || "light";

  document.documentElement.setAttribute("data-theme", savedTheme);
  document.documentElement.setAttribute("data-mode", savedMode);

  themeSelect.value = savedTheme;
  btnThemeMode.textContent = savedMode === "dark" ? "☀️" : "🌙";
}

themeSelect.addEventListener("change", () => {
  const theme = themeSelect.value;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("pdfStudioTheme", theme);
});

btnThemeMode.addEventListener("click", () => {
  const currentMode = document.documentElement.getAttribute("data-mode");
  const nextMode = currentMode === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-mode", nextMode);
  localStorage.setItem("pdfStudioMode", nextMode);
  btnThemeMode.textContent = nextMode === "dark" ? "☀️" : "🌙";
});

applySavedTheme();

// 13. MENU GARIS 3 (MOBILE TOOLBAR TOGGLE)
const btnMobileMenu = document.getElementById("btn-mobile-menu");
const mainToolbar = document.getElementById("main-toolbar");

if (btnMobileMenu && mainToolbar) {
  btnMobileMenu.addEventListener("click", () => {
    const isOpen = mainToolbar.classList.toggle("open");
    btnMobileMenu.textContent = isOpen ? "✕" : "☰";
  });

  // Otomatis tutup menu setelah pengguna memilih alat edit di HP
  mainToolbar.addEventListener("click", (e) => {
    if (e.target.closest(".btn")) {
      mainToolbar.classList.remove("open");
      btnMobileMenu.textContent = "☰";
    }
  });
}
