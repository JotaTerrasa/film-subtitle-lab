const state = {
  videoFile: null,
  referenceFile: null,
  jobId: null,
  generated: [],
  words: [],
  referenceRaw: [],
  reference: [],
  merged: [],
  activeWordIndex: -1,
  autoOffsetSec: 0,
  referenceOffsetSec: 0,
  referenceScale: 1,
};

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const clearButton = document.getElementById("clearButton");
const startButton = document.getElementById("startButton");
const selectionSummary = document.getElementById("selectionSummary");
const statusBand = document.getElementById("statusBand");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const logTail = document.getElementById("logTail");
const progressTrack = document.getElementById("progressTrack");
const uploadProgress = document.getElementById("uploadProgress");
const reviewLayout = document.getElementById("reviewLayout");
const videoPlayer = document.getElementById("videoPlayer");
const activeGenerated = document.getElementById("activeGenerated");
const activeReference = document.getElementById("activeReference");
const cueGrid = document.getElementById("cueGrid");
const wordGrid = document.getElementById("wordGrid");
const wordCount = document.getElementById("wordCount");
const downloadRow = document.getElementById("downloadRow");
const sttProvider = document.getElementById("sttProvider");
const showGenerated = document.getElementById("showGenerated");
const showReference = document.getElementById("showReference");
const offsetMs = document.getElementById("offsetMs");
const offsetMinus = document.getElementById("offsetMinus");
const offsetPlus = document.getElementById("offsetPlus");
const offsetReset = document.getElementById("offsetReset");

function isSubtitle(file) {
  return /\.(srt|vtt)$/i.test(file.name);
}

function isMedia(file) {
  return file.type.startsWith("video/") || file.type.startsWith("audio/");
}

function setFiles(files) {
  [...files].forEach((file) => {
    if (isSubtitle(file)) state.referenceFile = file;
    else if (isMedia(file)) state.videoFile = file;
  });
  renderSelection();
}

function renderSelection() {
  const parts = [];
  if (state.videoFile) parts.push(`Media: ${state.videoFile.name}`);
  if (state.referenceFile) parts.push(`Original: ${state.referenceFile.name}`);
  selectionSummary.textContent = parts.length ? parts.join(" | ") : "Sin archivos seleccionados";
  startButton.disabled = !state.videoFile;
}

function resetAll() {
  state.videoFile = null;
  state.referenceFile = null;
  state.jobId = null;
  state.generated = [];
  state.words = [];
  state.referenceRaw = [];
  state.reference = [];
  state.merged = [];
  state.activeWordIndex = -1;
  state.autoOffsetSec = 0;
  state.referenceOffsetSec = 0;
  state.referenceScale = 1;
  fileInput.value = "";
  statusBand.hidden = true;
  progressTrack.hidden = true;
  uploadProgress.style.width = "0%";
  reviewLayout.hidden = true;
  renderSelection();
}

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  setFiles(event.dataTransfer.files);
});

fileInput.addEventListener("change", (event) => setFiles(event.target.files));
clearButton.addEventListener("click", resetAll);

startButton.addEventListener("click", async () => {
  if (!state.videoFile) return;

  const form = new FormData();
  form.append("video", state.videoFile);
  if (state.referenceFile) form.append("reference", state.referenceFile);
  form.append("stt_provider", sttProvider.value);
  form.append("language", document.getElementById("language").value);
  form.append("model", document.getElementById("model").value);
  form.append("batch_size", document.getElementById("batchSize").value);
  form.append("compute_type", document.getElementById("computeType").value);

  startButton.disabled = true;
  statusBand.hidden = false;
  progressTrack.hidden = false;
  uploadProgress.style.width = "0%";
  statusDot.className = "status-dot";
  statusText.textContent = "Subiendo";
  logTail.textContent = "";

  let payload;
  try {
    payload = await uploadJob(form);
  } catch (error) {
    statusDot.className = "status-dot error";
    statusText.textContent = "Error al subir";
    logTail.textContent = String(error.message || error);
    startButton.disabled = false;
    return;
  }

  state.jobId = payload.job_id;
  uploadProgress.style.width = "100%";
  statusText.textContent = "En cola";
  pollStatus();
});

function uploadJob(form) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/jobs");
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      uploadProgress.style.width = `${percent}%`;
      statusText.textContent = `Subiendo ${percent}%`;
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText));
      } else {
        reject(new Error(request.responseText || `HTTP ${request.status}`));
      }
    });
    request.addEventListener("error", () => reject(new Error("Error de red durante la subida.")));
    request.send(form);
  });
}

async function pollStatus() {
  const response = await fetch(`/api/jobs/${state.jobId}/status`);
  const status = await response.json();

  statusBand.hidden = false;
  statusText.textContent = status.status;
  statusDot.className = `status-dot ${status.status}`;
  logTail.textContent = (status.log_tail || []).join("\n");
  logTail.scrollTop = logTail.scrollHeight;

  if (status.status === "done") {
    progressTrack.hidden = true;
    await loadResult();
    return;
  }

  if (status.status === "error") {
    statusText.textContent = status.error || "Error";
    progressTrack.hidden = true;
    startButton.disabled = false;
    return;
  }

  setTimeout(pollStatus, 2000);
}

async function loadResult() {
  const response = await fetch(`/api/jobs/${state.jobId}/result`);
  const result = await response.json();
  state.generated = result.generated_cues || [];
  state.words = result.word_timestamps || [];
  state.referenceRaw = result.reference_cues || [];
  state.activeWordIndex = -1;
  state.autoOffsetSec = Number(result.alignment?.offset_sec || 0);
  state.referenceOffsetSec = state.autoOffsetSec;
  state.referenceScale = Number(result.alignment?.scale || 1);
  offsetMs.value = String(Math.round(state.referenceOffsetSec * 1000));
  applyReferenceTiming();
  state.merged = mergeCues(state.generated, state.reference);

  videoPlayer.src = result.video_url;
  renderDownloads(result.downloads || {}, result.alignment || {});
  renderCueGrid();
  renderWordGrid();
  reviewLayout.hidden = false;
  startButton.disabled = false;
}

function applyReferenceTiming() {
  state.reference = state.referenceRaw.map((cue) => {
    const adjustedStart = cue.start * state.referenceScale + state.referenceOffsetSec;
    const adjustedEnd = cue.end * state.referenceScale + state.referenceOffsetSec;
    return {
      ...cue,
      originalStart: cue.start,
      originalEnd: cue.end,
      start: Math.max(0, adjustedStart),
      end: Math.max(0, adjustedEnd),
    };
  });
}

function rerenderWithOffset() {
  applyReferenceTiming();
  state.merged = mergeCues(state.generated, state.reference);
  renderCueGrid();
  updateActive();
}

function renderDownloads(downloads, alignment) {
  downloadRow.innerHTML = "";
  const meta = document.createElement("span");
  meta.className = "alignment-meta";
  const offset = Math.round(Number(alignment.offset_sec || 0) * 1000);
  const scale = Number(alignment.scale || 1);
  const matches = Number(alignment.matches || 0);
  const quality = alignment.quality || "none";
  meta.textContent = `Offset auto: ${offset}ms | scale: ${scale.toFixed(6)} | matches: ${matches} | ${quality}`;
  downloadRow.appendChild(meta);

  Object.entries(downloads).forEach(([kind, url]) => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.textContent = kind.toUpperCase();
    link.download = "";
    downloadRow.appendChild(link);
  });
}

function mergeCues(generated, reference) {
  const rows = generated.map((cue) => ({ start: cue.start, end: cue.end, generated: cue, reference: null }));

  reference.forEach((ref) => {
    let best = null;
    let bestOverlap = 0;
    rows.forEach((row) => {
      const overlap = Math.max(0, Math.min(row.end, ref.end) - Math.max(row.start, ref.start));
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = row;
      }
    });
    if (best && bestOverlap > 0) best.reference = ref;
    else rows.push({ start: ref.start, end: ref.end, generated: null, reference: ref });
  });

  return rows.sort((a, b) => a.start - b.start);
}

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  const ms = Math.floor((value % 1) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function renderCueGrid() {
  cueGrid.innerHTML = "";
  state.merged.forEach((row, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "cue-row";
    item.dataset.index = String(index);
    item.innerHTML = `
      <div class="time">${formatTime(row.start)}</div>
      <div>${row.generated ? escapeHtml(row.generated.text) : '<span class="empty-cell">-</span>'}</div>
      <div>${row.reference ? escapeHtml(row.reference.text) : '<span class="empty-cell">-</span>'}</div>
    `;
    item.addEventListener("click", () => {
      videoPlayer.currentTime = row.start;
      videoPlayer.play();
    });
    cueGrid.appendChild(item);
  });
}

function formatTimeRange(start, end) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatScore(score) {
  const value = Number(score);
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function renderWordGrid() {
  wordGrid.innerHTML = "";
  wordCount.textContent = String(state.words.length);

  if (!state.words.length) {
    const item = document.createElement("div");
    item.className = "word-row empty";
    item.innerHTML = `
      <div>-</div>
      <div>Sin timestamps por palabra</div>
      <div>-</div>
    `;
    wordGrid.appendChild(item);
    return;
  }

  state.words.forEach((word, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "word-row";
    item.dataset.index = String(index);
    item.innerHTML = `
      <div class="time">${formatTimeRange(word.start, word.end)}</div>
      <div>${escapeHtml(word.text)}</div>
      <div>${formatScore(word.score)}</div>
    `;
    item.addEventListener("click", () => {
      videoPlayer.currentTime = Math.max(0, Number(word.start) || 0);
      videoPlayer.play();
    });
    wordGrid.appendChild(item);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function activeCue(cues, time) {
  return cues.find((cue) => time >= cue.start && time <= cue.end) || null;
}

function activeWordIndex(words, time) {
  let low = 0;
  let high = words.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const word = words[middle];
    if (time < word.start) high = middle - 1;
    else if (time > word.end) low = middle + 1;
    else return middle;
  }
  return -1;
}

function updateActive() {
  const time = videoPlayer.currentTime || 0;
  const generated = activeCue(state.generated, time);
  const reference = activeCue(state.reference, time);
  const wordIndex = activeWordIndex(state.words, time);

  activeGenerated.textContent = showGenerated.checked && generated ? generated.text : "";
  activeReference.textContent = showReference.checked && reference ? reference.text : "";

  const rows = cueGrid.querySelectorAll(".cue-row");
  let activeIndex = -1;
  state.merged.forEach((row, index) => {
    if (time >= row.start && time <= row.end) activeIndex = index;
  });

  rows.forEach((row, index) => {
    row.classList.toggle("active", index === activeIndex);
  });

  if (activeIndex >= 0) {
    const row = rows[activeIndex];
    const gridTop = cueGrid.scrollTop;
    const gridBottom = gridTop + cueGrid.clientHeight;
    if (row.offsetTop < gridTop || row.offsetTop + row.offsetHeight > gridBottom) {
      row.scrollIntoView({ block: "nearest" });
    }
  }

  if (wordIndex === state.activeWordIndex) return;
  state.activeWordIndex = wordIndex;

  const wordRows = wordGrid.querySelectorAll(".word-row");
  wordRows.forEach((row, index) => {
    row.classList.toggle("active", index === wordIndex);
  });

  if (wordIndex >= 0) {
    const row = wordRows[wordIndex];
    const gridTop = wordGrid.scrollTop;
    const gridBottom = gridTop + wordGrid.clientHeight;
    if (row.offsetTop < gridTop || row.offsetTop + row.offsetHeight > gridBottom) {
      row.scrollIntoView({ block: "nearest" });
    }
  }
}

videoPlayer.addEventListener("timeupdate", updateActive);
showGenerated.addEventListener("change", updateActive);
showReference.addEventListener("change", updateActive);

offsetMs.addEventListener("change", () => {
  state.referenceOffsetSec = (Number(offsetMs.value) || 0) / 1000;
  rerenderWithOffset();
});

offsetMinus.addEventListener("click", () => {
  state.referenceOffsetSec -= 0.1;
  offsetMs.value = String(Math.round(state.referenceOffsetSec * 1000));
  rerenderWithOffset();
});

offsetPlus.addEventListener("click", () => {
  state.referenceOffsetSec += 0.1;
  offsetMs.value = String(Math.round(state.referenceOffsetSec * 1000));
  rerenderWithOffset();
});

offsetReset.addEventListener("click", () => {
  state.referenceOffsetSec = state.autoOffsetSec;
  offsetMs.value = String(Math.round(state.referenceOffsetSec * 1000));
  rerenderWithOffset();
});

function updateProviderControls() {
  const hosted = sttProvider.value === "elevenlabs";
  document.getElementById("model").disabled = hosted;
  document.getElementById("batchSize").disabled = hosted;
  document.getElementById("computeType").disabled = hosted;
}

sttProvider.addEventListener("change", updateProviderControls);

updateProviderControls();
renderSelection();
