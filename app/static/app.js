const state = {
  videoFile: null,
  referenceFile: null,
  jobId: null,
  currentStage: null,
  generated: [],
  words: [],
  referenceRaw: [],
  reference: [],
  merged: [],
  downloads: {},
  alignment: {},
  waveform: {
    status: "idle",
    peaks: [],
    duration: 0,
    url: "",
    error: "",
  },
  activeWordIndex: -1,
  autoOffsetSec: 0,
  referenceOffsetSec: 0,
  referenceScale: 1,
  uiLanguage: window.localStorage.getItem("filmSubtitleLab.uiLanguage") || "es",
};

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const clearButton = document.getElementById("clearButton");
const startButton = document.getElementById("startButton");
const selectionSummary = document.getElementById("selectionSummary");
const statusBand = document.getElementById("statusBand");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const stagePanel = document.getElementById("stagePanel");
const stageTitle = document.getElementById("stageTitle");
const stageDetail = document.getElementById("stageDetail");
const stageProgress = document.getElementById("stageProgress");
const stageProgressFill = document.getElementById("stageProgressFill");
const stageSteps = document.getElementById("stageSteps");
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
const waveformCanvas = document.getElementById("waveformCanvas");
const waveformStatus = document.getElementById("waveformStatus");
const matchSummary = document.getElementById("matchSummary");
const sttProvider = document.getElementById("sttProvider");
const localControls = document.getElementById("localControls");
const elevenlabsControls = document.getElementById("elevenlabsControls");
const showGenerated = document.getElementById("showGenerated");
const showReference = document.getElementById("showReference");
const offsetMs = document.getElementById("offsetMs");
const offsetMinus = document.getElementById("offsetMinus");
const offsetPlus = document.getElementById("offsetPlus");
const offsetReset = document.getElementById("offsetReset");
const uiLanguage = document.getElementById("uiLanguage");
const pitchButton = document.getElementById("pitchButton");
const pitchStatus = document.getElementById("pitchStatus");
const pitchAudio = document.getElementById("pitchAudio");

const I18N = {
  es: {
    appSubtitle: "Transcripcion local con RTX 4090",
    uiLanguage: "Interfaz",
    dropKicker: "Arrastra",
    dropTitle: "Video/audio + SRT/VTT opcional",
    chooseFiles: "Elegir archivos",
    clear: "Limpiar",
    audioLanguage: "Idioma audio",
    langEnglish: "Ingles",
    langSpanish: "Espanol",
    langAuto: "Auto",
    langFrench: "Frances",
    langGerman: "Aleman",
    langItalian: "Italiano",
    localModel: "Modelo",
    elevenModel: "Modelo ElevenLabs",
    batch: "Lote",
    compute: "Calculo",
    timestamps: "Timestamps",
    speakers: "Hablantes",
    temperature: "Temperatura",
    seed: "Semilla",
    diarize: "Diarizar",
    audioEvents: "Eventos de audio",
    cleanFiller: "Limpiar muletillas",
    keyterms: "Terminos clave",
    keytermsPlaceholder: "nombres, lugares, terminos tecnicos",
    auto: "Auto",
    hackathonPitch: "Explicar proyecto",
    pitchGenerating: "Generando voz...",
    pitchPlaying: "Reproduciendo pitch",
    pitchReady: "Pitch listo",
    pitchError: "No se pudo generar el pitch",
    transcribe: "Transcribir",
    technicalLog: "Log tecnico",
    comparisonTitle: "Comparacion sincronizada",
    newSubtitles: "Nuevo",
    originalSubtitles: "Original",
    originalOffset: "Offset original",
    offsetMinusTitle: "Adelantar original 100 ms",
    offsetPlusTitle: "Retrasar original 100 ms",
    offsetResetTitle: "Volver al offset automatico",
    time: "Tiempo",
    wordTimestamps: "Timestamps palabra",
    word: "Palabra",
    confidence: "Confianza",
    noFiles: "Sin archivos seleccionados",
    media: "Media",
    original: "Original",
    uploading: "Subiendo",
    uploadingPercent: "Subiendo {percent}%",
    uploadError: "Error al subir",
    queuedStatus: "En cola",
    networkUploadError: "Error de red durante la subida.",
    noWordTimestamps: "Sin timestamps por palabra",
    working: "Trabajando",
    stageFallback: "La transcripcion esta en curso.",
    autoOffset: "Offset auto",
    matches: "coincidencias",
    matchTimeline: "Match visual",
    matchWaiting: "Esperando resultados",
    matchedSubtitles: "Match",
    matchSummary: "{matched} matches · {coverage}% cobertura · {delta} ms delta medio",
    matchNoReference: "Sin subtitulos originales para comparar",
    matchNoCues: "Sin subtitulos generados todavia",
    matchNewOnly: "solo nuevo",
    matchOriginalOnly: "solo original",
    matchGood: "match",
    waveformWaiting: "La onda aparecera cuando termine la transcripcion.",
    waveformLoading: "Generando onda de sonido desde el audio...",
    waveformReady: "Onda lista. Los bloques de abajo muestran como encajan los subtitulos.",
    waveformUnavailable: "No se pudo generar la onda, pero puedes revisar los carriles de subtitulos.",
    wordResync: "Resync por palabras",
    cues: "cues",
    tokenCoverage: "cobertura tokens",
    interpolated: "interpolados",
    "status.done": "Completado",
    "status.error": "Error",
    "status.running": "Trabajando",
    "status.queued": "En cola",
    "step.upload": "Subida",
    "step.queue": "Cola",
    "step.prepare": "Preparacion",
    "step.audio": "Audio",
    "step.vad": "Voz",
    "step.transcribe": "Transcripcion",
    "step.align": "Alineado",
    "step.remote": "API alojada",
    "step.export": "Exportacion",
    "step.review": "Revision",
    "stage.browserUpload.title": "Subiendo archivo",
    "stage.browserUpload.detail":
      "El navegador esta enviando el audio/video y los subtitulos opcionales a la estacion de trabajo.",
    uploadProgress: "Progreso de subida: {percent}%. Los videos grandes pueden tardar un poco.",
    "stage.uploadFailed.title": "Fallo en la subida",
    "stage.uploadFailed.detail":
      "El navegador no pudo enviar el archivo a la estacion de trabajo. Revisa la conexion e intentalo de nuevo.",
    "stage.queued.title": "Esperando turno",
    "stage.queued.detail": "El archivo ya esta subido y el trabajo esta entrando en la cola de procesamiento.",
    "stage.prepare.title": "Preparando transcripcion",
    "stage.prepare.detail": "El backend esta preparando modelo, GPU/cache, idioma y carpetas de salida.",
    "stage.audio.title": "Preparando audio",
    "stage.audio.detail": "La app esta extrayendo una pista mono normalizada y optimizada para reconocer voz.",
    "stage.vad.title": "Detectando voz",
    "stage.vad.detail": "WhisperX esta separando dialogo de silencios, musica o ruido.",
    "stage.transcribe.title": "Transcribiendo dialogo",
    "stage.transcribe.detail": "El motor STT esta convirtiendo el habla en texto.",
    "stage.align.title": "Alineando palabras",
    "stage.align.detail": "La app esta refinando los timestamps por palabra para que los subtitulos entren a tiempo.",
    "stage.upload.title": "Enviando a ElevenLabs",
    "stage.upload.detail": "El backend esta subiendo el archivo y los parametros elegidos a la API alojada.",
    "stage.remote.title": "Esperando a ElevenLabs",
    "stage.remote.detail": "ElevenLabs esta procesando el audio y devolviendo texto con timestamps.",
    "stage.export.title": "Generando subtitulos",
    "stage.export.detail": "La app esta creando SRT, VTT, JSON, TXT, TSV y la vista de comparacion.",
    "stage.done.title": "Listo para revisar",
    "stage.done.detail": "La transcripcion ha terminado y los subtitulos estan listos para revisar o descargar.",
    "stage.error.title": "Transcripcion detenida",
    "stage.error.detail": "El trabajo encontro un error. Revisa el mensaje y el log tecnico debajo.",
  },
  en: {
    appSubtitle: "Local transcription with RTX 4090",
    uiLanguage: "Interface",
    dropKicker: "Drop",
    dropTitle: "Video/audio + optional SRT/VTT",
    chooseFiles: "Choose files",
    clear: "Clear",
    audioLanguage: "Audio language",
    langEnglish: "English",
    langSpanish: "Spanish",
    langAuto: "Auto",
    langFrench: "French",
    langGerman: "German",
    langItalian: "Italian",
    localModel: "Model",
    elevenModel: "ElevenLabs model",
    batch: "Batch",
    compute: "Compute",
    timestamps: "Timestamps",
    speakers: "Speakers",
    temperature: "Temperature",
    seed: "Seed",
    diarize: "Diarize",
    audioEvents: "Audio events",
    cleanFiller: "Clean filler",
    keyterms: "Keyterms",
    keytermsPlaceholder: "names, places, technical terms",
    auto: "Auto",
    hackathonPitch: "Explain project",
    pitchGenerating: "Generating voice...",
    pitchPlaying: "Playing pitch",
    pitchReady: "Pitch ready",
    pitchError: "Could not generate pitch",
    transcribe: "Transcribe",
    technicalLog: "Technical log",
    comparisonTitle: "Synchronized comparison",
    newSubtitles: "New",
    originalSubtitles: "Original",
    originalOffset: "Original offset",
    offsetMinusTitle: "Move original subtitles 100 ms earlier",
    offsetPlusTitle: "Move original subtitles 100 ms later",
    offsetResetTitle: "Return to the automatic offset",
    time: "Time",
    wordTimestamps: "Word timestamps",
    word: "Word",
    confidence: "Confidence",
    noFiles: "No files selected",
    media: "Media",
    original: "Original",
    uploading: "Uploading",
    uploadingPercent: "Uploading {percent}%",
    uploadError: "Upload error",
    queuedStatus: "Queued",
    networkUploadError: "Network error during upload.",
    noWordTimestamps: "No word timestamps",
    working: "Working",
    stageFallback: "Transcription is in progress.",
    autoOffset: "Auto offset",
    matches: "matches",
    matchTimeline: "Visual match",
    matchWaiting: "Waiting for results",
    matchedSubtitles: "Match",
    matchSummary: "{matched} matches · {coverage}% coverage · {delta} ms avg delta",
    matchNoReference: "No original subtitles to compare",
    matchNoCues: "No generated subtitles yet",
    matchNewOnly: "new only",
    matchOriginalOnly: "original only",
    matchGood: "match",
    waveformWaiting: "The waveform will appear when transcription finishes.",
    waveformLoading: "Generating sound waveform from the audio...",
    waveformReady: "Waveform ready. The lanes below show how subtitles line up.",
    waveformUnavailable: "Could not generate the waveform, but the subtitle lanes are still available.",
    wordResync: "Word resync",
    cues: "cues",
    tokenCoverage: "token coverage",
    interpolated: "interpolated",
    "status.done": "Done",
    "status.error": "Error",
    "status.running": "Working",
    "status.queued": "Queued",
    "step.upload": "Upload",
    "step.queue": "Queue",
    "step.prepare": "Setup",
    "step.audio": "Audio",
    "step.vad": "Speech",
    "step.transcribe": "Transcription",
    "step.align": "Alignment",
    "step.remote": "Hosted API",
    "step.export": "Export",
    "step.review": "Review",
    "stage.browserUpload.title": "Uploading media",
    "stage.browserUpload.detail":
      "The browser is sending the selected audio/video and optional subtitles to the workstation.",
    uploadProgress: "Upload progress: {percent}%. Large video files can take a little while.",
    "stage.uploadFailed.title": "Upload failed",
    "stage.uploadFailed.detail":
      "The browser could not send the selected file to the workstation. Check the connection and try again.",
    "stage.queued.title": "Waiting for an available worker",
    "stage.queued.detail": "The file is uploaded and the transcription job is entering the processing queue.",
    "stage.prepare.title": "Preparing transcription",
    "stage.prepare.detail": "The backend is setting up the model, GPU/cache, language, and output folders.",
    "stage.audio.title": "Preparing audio",
    "stage.audio.detail": "The app is extracting a mono, normalized track optimized for speech recognition.",
    "stage.vad.title": "Detecting speech",
    "stage.vad.detail": "WhisperX is separating dialogue from silence, music, or noise.",
    "stage.transcribe.title": "Transcribing dialogue",
    "stage.transcribe.detail": "The STT engine is converting spoken dialogue into text.",
    "stage.align.title": "Aligning words",
    "stage.align.detail": "The app is refining word-level timestamps so subtitles land correctly.",
    "stage.upload.title": "Sending to ElevenLabs",
    "stage.upload.detail": "The backend is uploading the file and selected options to the hosted API.",
    "stage.remote.title": "Waiting for ElevenLabs",
    "stage.remote.detail": "ElevenLabs is processing audio and returning text with timestamps.",
    "stage.export.title": "Generating subtitles",
    "stage.export.detail": "The app is converting the transcript to SRT, VTT, JSON, TXT, TSV, and the comparison view.",
    "stage.done.title": "Ready for review",
    "stage.done.detail": "Transcription finished and subtitles are ready to inspect or download.",
    "stage.error.title": "Transcription stopped",
    "stage.error.detail": "The job hit an error. Check the message and technical log below.",
  },
};

function getUiLanguage() {
  return uiLanguage?.value || state.uiLanguage || "es";
}

function hasTranslation(key) {
  const lang = getUiLanguage();
  return Boolean(I18N[lang]?.[key] || I18N.es[key] || I18N.en[key]);
}

function t(key, params = {}) {
  params = params || {};
  const lang = getUiLanguage();
  const table = I18N[lang] || I18N.es;
  let value = table[key] ?? I18N.es[key] ?? I18N.en[key] ?? key;
  Object.entries(params).forEach(([name, replacement]) => {
    value = value.replaceAll(`{${name}}`, String(replacement));
  });
  return value;
}

function statusLabel(status) {
  const key = `status.${status}`;
  return hasTranslation(key) ? t(key) : status;
}

function browserStageSteps(upload, queue, transcribe, review) {
  return [
    { key: "upload", state: upload },
    { key: "queue", state: queue },
    { key: "transcribe", state: transcribe },
    { key: "review", state: review },
  ];
}

function localizeStage(stage) {
  if (!stage) return null;
  const key = stage.key || "";
  const titleKey = stage.title_i18n || (key ? `stage.${key}.title` : "");
  const detailKey = stage.detail_i18n || (key ? `stage.${key}.detail` : "");
  const title = titleKey && hasTranslation(titleKey) ? t(titleKey, stage.title_args) : stage.title || t("working");
  const detail =
    detailKey && hasTranslation(detailKey)
      ? t(detailKey, stage.detail_args)
      : stage.detail || t("stageFallback");
  return { ...stage, title, detail };
}

function appendIfValue(form, name, value) {
  const trimmed = String(value || "").trim();
  if (trimmed) form.append(name, trimmed);
}

function renderStage(stage) {
  state.currentStage = stage || null;
  if (!stage) {
    stagePanel.hidden = true;
    return;
  }

  const localized = localizeStage(stage);
  stagePanel.hidden = false;
  stageTitle.textContent = localized.title;
  stageDetail.textContent = localized.detail;

  const progress = Number(stage.progress);
  if (Number.isFinite(progress)) {
    stageProgress.hidden = false;
    stageProgressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  } else {
    stageProgress.hidden = true;
    stageProgressFill.style.width = "0%";
  }

  stageSteps.innerHTML = "";
  (stage.steps || []).forEach((step) => {
    const item = document.createElement("span");
    item.className = `stage-step ${step.state || "pending"}`;
    const stepKey = step.title_i18n || (step.key ? `step.${step.key}` : "");
    item.textContent = stepKey && hasTranslation(stepKey) ? t(stepKey, step.title_args) : step.title || step.key;
    stageSteps.appendChild(item);
  });
}

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
  if (state.videoFile) parts.push(`${t("media")}: ${state.videoFile.name}`);
  if (state.referenceFile) parts.push(`${t("original")}: ${state.referenceFile.name}`);
  selectionSummary.textContent = parts.length ? parts.join(" | ") : t("noFiles");
  startButton.disabled = !state.videoFile;
}

function resetAll() {
  state.videoFile = null;
  state.referenceFile = null;
  state.jobId = null;
  state.currentStage = null;
  state.generated = [];
  state.words = [];
  state.referenceRaw = [];
  state.reference = [];
  state.merged = [];
  state.downloads = {};
  state.alignment = {};
  state.waveform = { status: "idle", peaks: [], duration: 0, url: "", error: "" };
  state.activeWordIndex = -1;
  state.autoOffsetSec = 0;
  state.referenceOffsetSec = 0;
  state.referenceScale = 1;
  fileInput.value = "";
  statusBand.hidden = true;
  progressTrack.hidden = true;
  uploadProgress.style.width = "0%";
  stagePanel.hidden = true;
  reviewLayout.hidden = true;
  renderSelection();
  renderMatchSummary();
  renderWaveformStatus();
  drawWaveformTimeline();
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

  if (sttProvider.value === "elevenlabs") {
    form.append("elevenlabs_model", document.getElementById("elevenlabsModel").value);
    form.append("elevenlabs_timestamps", document.getElementById("elevenlabsTimestamps").value);
    appendIfValue(form, "elevenlabs_num_speakers", document.getElementById("elevenlabsSpeakers").value);
    appendIfValue(form, "elevenlabs_temperature", document.getElementById("elevenlabsTemperature").value);
    appendIfValue(form, "elevenlabs_seed", document.getElementById("elevenlabsSeed").value);
    form.append("elevenlabs_diarize", document.getElementById("elevenlabsDiarize").checked ? "true" : "false");
    form.append(
      "elevenlabs_tag_audio_events",
      document.getElementById("elevenlabsAudioEvents").checked ? "true" : "false",
    );
    form.append("elevenlabs_no_verbatim", document.getElementById("elevenlabsNoVerbatim").checked ? "true" : "false");
    appendIfValue(form, "elevenlabs_keyterms", document.getElementById("elevenlabsKeyterms").value);
  } else {
    form.append("model", document.getElementById("model").value);
    form.append("batch_size", document.getElementById("batchSize").value);
    form.append("compute_type", document.getElementById("computeType").value);
  }

  startButton.disabled = true;
  statusBand.hidden = false;
  progressTrack.hidden = false;
  uploadProgress.style.width = "0%";
  statusDot.className = "status-dot";
  statusText.textContent = t("uploading");
  logTail.textContent = "";
  renderStage({
    key: "browserUpload",
    progress: 0,
    steps: browserStageSteps("active", "pending", "pending", "pending"),
  });

  let payload;
  try {
    payload = await uploadJob(form);
  } catch (error) {
    statusDot.className = "status-dot error";
    statusText.textContent = t("uploadError");
    logTail.textContent = String(error.message || error);
    renderStage({
      key: "uploadFailed",
      progress: null,
      steps: browserStageSteps("active", "pending", "pending", "pending"),
    });
    startButton.disabled = false;
    return;
  }

  state.jobId = payload.job_id;
  uploadProgress.style.width = "100%";
  progressTrack.hidden = true;
  statusText.textContent = t("queuedStatus");
  renderStage({
    key: "queued",
    progress: null,
    steps: browserStageSteps("done", "active", "pending", "pending"),
  });
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
      statusText.textContent = t("uploadingPercent", { percent });
      renderStage({
        key: "browserUpload",
        detail_i18n: "uploadProgress",
        detail_args: { percent },
        progress: percent,
        steps: browserStageSteps("active", "pending", "pending", "pending"),
      });
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText));
      } else {
        reject(new Error(request.responseText || `HTTP ${request.status}`));
      }
    });
    request.addEventListener("error", () => reject(new Error(t("networkUploadError"))));
    request.send(form);
  });
}

async function pollStatus() {
  const response = await fetch(`/api/jobs/${state.jobId}/status`);
  const status = await response.json();

  statusBand.hidden = false;
  const localizedStage = localizeStage(status.stage);
  statusText.textContent = localizedStage?.title || statusLabel(status.status);
  statusDot.className = `status-dot ${status.status}`;
  renderStage(status.stage);
  logTail.textContent = (status.log_tail || []).join("\n");
  logTail.scrollTop = logTail.scrollHeight;

  if (status.status === "done") {
    progressTrack.hidden = true;
    await loadResult();
    return;
  }

  if (status.status === "error") {
    statusText.textContent = status.error || statusLabel("error");
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
  state.downloads = result.downloads || {};
  state.alignment = result.alignment || {};
  state.waveform = {
    status: "idle",
    peaks: [],
    duration: 0,
    url: result.waveform_url || "",
    error: "",
  };
  state.activeWordIndex = -1;
  state.autoOffsetSec = Number(result.alignment?.offset_sec || 0);
  state.referenceOffsetSec = state.autoOffsetSec;
  state.referenceScale = Number(result.alignment?.scale || 1);
  offsetMs.value = String(Math.round(state.referenceOffsetSec * 1000));
  applyReferenceTiming();
  state.merged = mergeCues(state.generated, state.reference);

  videoPlayer.src = result.video_url;
  renderDownloads(state.downloads, state.alignment);
  renderCueGrid();
  renderWordGrid();
  renderMatchSummary();
  renderWaveformStatus();
  reviewLayout.hidden = false;
  drawWaveformTimeline();
  loadWaveform(state.waveform.url);
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
  renderMatchSummary();
  drawWaveformTimeline();
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
  if (alignment.source === "word_resync") {
    const coverage = Number(alignment.token_coverage || 0).toFixed(1);
    const interpolated = Number(alignment.interpolated_cues || 0);
    const medianShift = Math.round(Number(alignment.median_shift_sec || 0) * 1000);
    meta.textContent = `${t("wordResync")}: ${matches} ${t("cues")} | ${t("tokenCoverage")}: ${coverage}% | ${t("interpolated")}: ${interpolated} | shift: ${medianShift}ms | ${quality}`;
  } else {
    meta.textContent = `${t("autoOffset")}: ${offset}ms | scale: ${scale.toFixed(6)} | ${t("matches")}: ${matches} | ${quality}`;
  }
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

function maxTimelineDuration() {
  const cueEnd = [...state.generated, ...state.reference].reduce((max, cue) => Math.max(max, Number(cue.end) || 0), 0);
  const mediaDuration = Number(videoPlayer.duration);
  const waveformDuration = Number(state.waveform.duration);
  return Math.max(1, cueEnd, Number.isFinite(mediaDuration) ? mediaDuration : 0, waveformDuration || 0);
}

function computeMatchMetrics() {
  const matched = state.merged.filter((row) => row.generated && row.reference);
  const total = Math.max(state.generated.length, state.reference.length, 1);
  const deltas = matched.map((row) => {
    const generatedMid = (row.generated.start + row.generated.end) / 2;
    const referenceMid = (row.reference.start + row.reference.end) / 2;
    return Math.abs(generatedMid - referenceMid) * 1000;
  });
  const avgDelta = deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : 0;
  return {
    matched: matched.length,
    total,
    coverage: Math.round((matched.length / total) * 100),
    avgDelta: Math.round(avgDelta),
  };
}

function renderMatchSummary() {
  if (!matchSummary) return;
  if (!state.generated.length) {
    matchSummary.textContent = t("matchNoCues");
    return;
  }
  if (!state.reference.length) {
    matchSummary.textContent = t("matchNoReference");
    return;
  }
  const metrics = computeMatchMetrics();
  matchSummary.textContent = t("matchSummary", {
    matched: metrics.matched,
    coverage: metrics.coverage,
    delta: metrics.avgDelta,
  });
}

function matchInfo(row) {
  if (row.generated && row.reference) {
    const generatedMid = (row.generated.start + row.generated.end) / 2;
    const referenceMid = (row.reference.start + row.reference.end) / 2;
    const deltaMs = Math.round((generatedMid - referenceMid) * 1000);
    const absDelta = Math.abs(deltaMs);
    return {
      kind: absDelta <= 250 ? "good" : absDelta <= 750 ? "drift" : "off",
      label: absDelta <= 250 ? t("matchGood") : `${deltaMs > 0 ? "+" : ""}${deltaMs}ms`,
    };
  }
  if (row.generated) return { kind: "new-only", label: t("matchNewOnly") };
  return { kind: "original-only", label: t("matchOriginalOnly") };
}

function renderWaveformStatus() {
  if (!waveformStatus) return;
  if (state.waveform.status === "loading") waveformStatus.textContent = t("waveformLoading");
  else if (state.waveform.status === "ready") waveformStatus.textContent = t("waveformReady");
  else if (state.waveform.status === "error") waveformStatus.textContent = t("waveformUnavailable");
  else waveformStatus.textContent = t("waveformWaiting");
}

async function loadWaveform(url) {
  if (!url) return;
  state.waveform = { status: "loading", peaks: [], duration: 0, url, error: "" };
  renderWaveformStatus();
  drawWaveformTimeline();
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    state.waveform = {
      status: "ready",
      peaks: Array.isArray(payload.peaks) ? payload.peaks : [],
      duration: Number(payload.duration) || 0,
      url,
      error: "",
    };
  } catch (error) {
    state.waveform = {
      status: "error",
      peaks: [],
      duration: 0,
      url,
      error: String(error.message || error),
    };
  }
  renderWaveformStatus();
  drawWaveformTimeline();
}

function cueX(seconds, width, duration, inset) {
  return inset + (Math.max(0, Number(seconds) || 0) / duration) * (width - inset * 2);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, height / 2, Math.max(0, width) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawWaveformTimeline() {
  if (!waveformCanvas) return;
  const ctx = waveformCanvas.getContext("2d");
  if (!ctx) return;

  const ratio = window.devicePixelRatio || 1;
  const cssWidth = Math.max(320, waveformCanvas.clientWidth || 720);
  const cssHeight = Math.max(170, waveformCanvas.clientHeight || 190);
  if (waveformCanvas.width !== Math.round(cssWidth * ratio)) {
    waveformCanvas.width = Math.round(cssWidth * ratio);
  }
  if (waveformCanvas.height !== Math.round(cssHeight * ratio)) {
    waveformCanvas.height = Math.round(cssHeight * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const inset = 16;
  const width = cssWidth;
  const height = cssHeight;
  const duration = maxTimelineDuration();
  const waveTop = 40;
  const waveHeight = 82;
  const waveMid = waveTop + waveHeight / 2;
  const generatedY = height - 48;
  const referenceY = height - 28;
  const laneH = 10;

  ctx.fillStyle = "#0d1012";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#283038";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = inset + ((width - inset * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x, height - 12);
    ctx.stroke();
    ctx.fillStyle = "#6f7f88";
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.fillText(formatTime((duration * i) / 4), x + 4, 24);
  }

  ctx.strokeStyle = "#343c43";
  ctx.beginPath();
  ctx.moveTo(inset, waveMid);
  ctx.lineTo(width - inset, waveMid);
  ctx.stroke();

  const peaks = state.waveform.peaks || [];
  if (peaks.length) {
    const gradient = ctx.createLinearGradient(0, waveTop, 0, waveTop + waveHeight);
    gradient.addColorStop(0, "#7fb7ff");
    gradient.addColorStop(0.52, "#4fb286");
    gradient.addColorStop(1, "#d79a43");
    ctx.fillStyle = gradient;
    const drawWidth = width - inset * 2;
    const bars = Math.min(Math.floor(drawWidth), peaks.length);
    for (let x = 0; x < bars; x += 1) {
      const peak = Math.sqrt(Number(peaks[Math.floor((x / bars) * peaks.length)]) || 0);
      const barH = Math.max(1, peak * waveHeight * 0.92);
      ctx.fillRect(inset + x, waveMid - barH / 2, 1, barH);
    }
  } else {
    ctx.fillStyle = "#243039";
    for (let x = inset; x < width - inset; x += 5) {
      const peak = 0.22 + Math.abs(Math.sin(x * 0.035)) * 0.42;
      const barH = peak * waveHeight * 0.75;
      ctx.fillRect(x, waveMid - barH / 2, 2, barH);
    }
  }

  state.merged.forEach((row) => {
    if (row.generated && row.reference) {
      const generatedMid = (row.generated.start + row.generated.end) / 2;
      const referenceMid = (row.reference.start + row.reference.end) / 2;
      const delta = Math.abs(generatedMid - referenceMid);
      ctx.strokeStyle = delta <= 0.25 ? "#7de0ae" : delta <= 0.75 ? "#d79a43" : "#ef6f6c";
      ctx.globalAlpha = 0.52;
      ctx.beginPath();
      ctx.moveTo(cueX(generatedMid, width, duration, inset), generatedY + laneH);
      ctx.lineTo(cueX(referenceMid, width, duration, inset), referenceY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });

  state.generated.forEach((cue) => {
    const x = cueX(cue.start, width, duration, inset);
    const w = Math.max(2, cueX(cue.end, width, duration, inset) - x);
    ctx.fillStyle = "rgba(79, 178, 134, 0.86)";
    drawRoundedRect(ctx, x, generatedY, w, laneH, 4);
  });

  state.reference.forEach((cue) => {
    const x = cueX(cue.start, width, duration, inset);
    const w = Math.max(2, cueX(cue.end, width, duration, inset) - x);
    ctx.fillStyle = "rgba(215, 154, 67, 0.86)";
    drawRoundedRect(ctx, x, referenceY, w, laneH, 4);
  });

  ctx.fillStyle = "#9ca9b1";
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillText(t("newSubtitles"), inset, generatedY - 5);
  ctx.fillText(t("originalSubtitles"), inset, referenceY - 5);

  const current = Math.max(0, Number(videoPlayer.currentTime) || 0);
  const playheadX = cueX(current, width, duration, inset);
  ctx.strokeStyle = "#eef3f5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 10);
  ctx.lineTo(playheadX, height - 10);
  ctx.stroke();
  ctx.fillStyle = "#eef3f5";
  ctx.beginPath();
  ctx.arc(playheadX, 10, 4, 0, Math.PI * 2);
  ctx.fill();
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
    const match = matchInfo(row);
    const item = document.createElement("button");
    item.type = "button";
    item.className = `cue-row match-${match.kind}`;
    item.dataset.index = String(index);
    item.innerHTML = `
      <div class="time">${formatTime(row.start)}<span class="row-match ${match.kind}">${escapeHtml(match.label)}</span></div>
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

function formatScore(word) {
  const value = Number(word.score ?? word.logprob);
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
      <div>${escapeHtml(t("noWordTimestamps"))}</div>
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
      <div>${formatScore(word)}</div>
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

  if (wordIndex === state.activeWordIndex) {
    drawWaveformTimeline();
    return;
  }
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

  drawWaveformTimeline();
}

videoPlayer.addEventListener("timeupdate", updateActive);
videoPlayer.addEventListener("loadedmetadata", drawWaveformTimeline);
showGenerated.addEventListener("change", updateActive);
showReference.addEventListener("change", updateActive);
window.addEventListener("resize", drawWaveformTimeline);

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
  localControls.hidden = hosted;
  elevenlabsControls.hidden = !hosted;
  updateElevenlabsModelControls();
}

function updateElevenlabsModelControls() {
  const model = document.getElementById("elevenlabsModel").value;
  const noVerbatim = document.getElementById("elevenlabsNoVerbatim");
  noVerbatim.disabled = model !== "scribe_v2";
  if (model !== "scribe_v2") noVerbatim.checked = false;
}

async function playHackathonPitch() {
  pitchButton.disabled = true;
  pitchStatus.textContent = t("pitchGenerating");
  try {
    const response = await fetch(`/api/hackathon-pitch/audio?language=${encodeURIComponent(getUiLanguage())}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      let detail = await response.text();
      try {
        detail = JSON.parse(detail).detail || detail;
      } catch {
        // Keep the plain response text.
      }
      throw new Error(detail || `HTTP ${response.status}`);
    }

    const audioBlob = await response.blob();
    if (pitchAudio.dataset.objectUrl) {
      URL.revokeObjectURL(pitchAudio.dataset.objectUrl);
    }
    const audioUrl = URL.createObjectURL(audioBlob);
    pitchAudio.dataset.objectUrl = audioUrl;
    pitchAudio.src = audioUrl;
    pitchStatus.textContent = t("pitchPlaying");
    await pitchAudio.play();
  } catch (error) {
    pitchStatus.textContent = `${t("pitchError")}: ${error.message || error}`;
    pitchButton.disabled = false;
  }
}

function applyTranslations() {
  state.uiLanguage = I18N[uiLanguage.value] ? uiLanguage.value : "es";
  document.documentElement.lang = state.uiLanguage;

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  renderSelection();
  if (state.currentStage) {
    statusText.textContent = localizeStage(state.currentStage).title;
    renderStage(state.currentStage);
  }
  if (!reviewLayout.hidden) {
    renderDownloads(state.downloads, state.alignment);
    renderCueGrid();
    renderWordGrid();
    renderMatchSummary();
    renderWaveformStatus();
    drawWaveformTimeline();
    updateActive();
  }
}

sttProvider.addEventListener("change", updateProviderControls);
document.getElementById("elevenlabsModel").addEventListener("change", updateElevenlabsModelControls);
pitchButton.addEventListener("click", playHackathonPitch);
pitchAudio.addEventListener("ended", () => {
  pitchButton.disabled = false;
  pitchStatus.textContent = t("pitchReady");
});
pitchAudio.addEventListener("error", () => {
  pitchButton.disabled = false;
  pitchStatus.textContent = t("pitchError");
});
uiLanguage.value = I18N[state.uiLanguage] ? state.uiLanguage : "es";
uiLanguage.addEventListener("change", () => {
  window.localStorage.setItem("filmSubtitleLab.uiLanguage", uiLanguage.value);
  applyTranslations();
});

updateProviderControls();
applyTranslations();
