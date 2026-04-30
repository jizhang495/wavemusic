import "./styles.css";

type TimbrePreset = "sine" | "square" | "triangle" | "saw" | "soft organ" | "warm synth organ" | "custom";

type MixWeights = {
  sine: number;
  square: number;
  triangle: number;
  saw: number;
};

type Timbre = TimbrePreset | {
  preset: "custom";
  mix: MixWeights;
};

interface PartPayload {
  name: string;
  timbre: Timbre;
  score: string;
}

interface ProjectPartPayload {
  name?: string;
  timbre?: unknown;
  score?: string | string[];
}

interface MusicProject {
  title: string;
  key: string;
  time_signature: string;
  bpm: number;
  sample_rate: number;
  transpose: number;
  parts: ProjectPartPayload[];
}

interface RenderRequest {
  title: string;
  key: string;
  time_signature: string;
  parts: PartPayload[];
  filename: string;
  sample_rate: number;
  bpm: number;
  transpose: number;
  use_cpp: boolean;
}

interface PreviewRequest {
  timbre: Timbre;
  line: string;
  sample_rate: number;
  bpm: number;
  transpose: number;
  use_cpp: boolean;
}

interface RenderResponse {
  filename: string;
  audio_url: string;
  score: string;
}

interface ScorePayload {
  filename: string;
  title: string;
  key: string;
  time_signature: string;
  bpm: number;
  sample_rate: number;
  transpose: number;
  parts: PartPayload[];
}

type ElementRef = {
  name: HTMLInputElement;
  timbre: HTMLSelectElement;
  mixPanel: HTMLElement;
  mixInputs: Record<keyof MixWeights, HTMLInputElement>;
  mixText: HTMLInputElement;
  timbreCanvas: HTMLCanvasElement;
  spectrumCanvas: HTMLCanvasElement;
  score: HTMLTextAreaElement;
};

const timbrePresets: TimbrePreset[] = [
  "sine",
  "square",
  "triangle",
  "saw",
  "soft organ",
  "warm synth organ",
  "custom",
];
const mixKeys: Array<keyof MixWeights> = ["sine", "square", "triangle", "saw"];
const presetMixes: Record<TimbrePreset, MixWeights> = {
  sine: { sine: 1, square: 0, triangle: 0, saw: 0 },
  square: { sine: 0, square: 1, triangle: 0, saw: 0 },
  triangle: { sine: 0, square: 0, triangle: 1, saw: 0 },
  saw: { sine: 0, square: 0, triangle: 0, saw: 1 },
  "soft organ": { sine: 0.55, square: 0.1, triangle: 0.35, saw: 0 },
  "warm synth organ": { sine: 0.4, square: 0.15, triangle: 0.3, saw: 0.15 },
  custom: { sine: 0.4, square: 0.15, triangle: 0.3, saw: 0.15 },
};
const configuredApiRoot = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
const apiRoots = (() => {
  if (configuredApiRoot) {
    return [configuredApiRoot];
  }
  const hostname = window.location.hostname;
  if (window.location.protocol === "file:") {
    return ["http://127.0.0.1:8000"];
  }
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return ["", "http://127.0.0.1:8000", "http://localhost:8000"];
  }
  return ["", "http://127.0.0.1:8000"];
})();

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("App container missing");
}

const partRefs: ElementRef[] = [];
const state = {
  selectedSheet: "",
  activePartIndex: 0,
  partEditorHeight: 300,
};

const container = document.createElement("div");
container.innerHTML = `
  <header class="app-header">
    <div>
      <h1 class="title">WaveMusic</h1>
      <p class="subtitle">Create scores and render WAV audio.</p>
    </div>
    <a class="github-link" href="https://github.com/jizhang495/wavemusic" target="_blank" rel="noreferrer">GitHub</a>
  </header>
  <section class="toolbar score-row">
    <label>
      <span>Load score</span>
      <select id="sheet-select">
        <option value="">Select score</option>
      </select>
    </label>
    <button id="load-sheet" type="button">Load sample</button>
    <button id="load-local-score" type="button">Load from local</button>
    <input id="local-score-file" type="file" accept=".json,application/json" hidden />
    <div class="status-field">
      <span>Status</span>
      <span id="status" class="status">Idle</span>
    </div>
  </section>
  <section class="toolbar settings-row">
    <label>
      <span>Title</span>
      <input id="title-input" value="untitled" placeholder="untitled" />
    </label>
    <label>
      <span>Key</span>
      <input id="key-input" value="c major" placeholder="c major" />
    </label>
    <label>
      <span>Time Signature</span>
      <input id="time-signature-input" value="4/4" placeholder="4/4" />
    </label>
    <label>
      <span>BPM</span>
      <input id="bpm-input" type="number" min="20" max="300" value="100" />
    </label>
    <label>
      <span>Sample Rate</span>
      <input id="sample-rate" type="number" min="8000" max="96000" step="1000" value="44100" />
    </label>
    <label>
      <span>Transpose</span>
      <input id="transpose-input" type="number" min="-48" max="48" step="1" value="0" />
    </label>
    <button id="save-sheet" type="button">Save score</button>
    <button id="save-wav" type="button">Save WAV</button>
  </section>
  <section class="parts" id="parts"></section>
  <section class="playback-bar">
    <button id="preview-line" type="button">Preview selected (Alt+Enter)</button>
    <button id="render" type="button">Render WAV</button>
    <audio id="audio-player" controls></audio>
  </section>
`;
app.appendChild(container);

const statusElement = app.querySelector<HTMLElement>("#status")!;
const sheetSelect = app.querySelector<HTMLSelectElement>("#sheet-select")!;
const titleElement = app.querySelector<HTMLInputElement>("#title-input")!;
const bpmElement = app.querySelector<HTMLInputElement>("#bpm-input")!;
const sampleRateElement = app.querySelector<HTMLInputElement>("#sample-rate")!;
const transposeElement = app.querySelector<HTMLInputElement>("#transpose-input")!;
const keyElement = app.querySelector<HTMLInputElement>("#key-input")!;
const timeSignatureElement = app.querySelector<HTMLInputElement>("#time-signature-input")!;
const audioPlayer = app.querySelector<HTMLAudioElement>("#audio-player")!;
const loadButton = app.querySelector<HTMLButtonElement>("#load-sheet")!;
const localScoreButton = app.querySelector<HTMLButtonElement>("#load-local-score")!;
const localScoreFileInput = app.querySelector<HTMLInputElement>("#local-score-file")!;
const previewButton = app.querySelector<HTMLButtonElement>("#preview-line")!;
const saveButton = app.querySelector<HTMLButtonElement>("#save-sheet")!;
const saveWavButton = app.querySelector<HTMLButtonElement>("#save-wav")!;
const renderButton = app.querySelector<HTMLButtonElement>("#render")!;
const partsContainer = app.querySelector<HTMLElement>("#parts")!;

function setStatus(message: string) {
  statusElement.textContent = message;
}

function syncPartEditorHeights() {
  partRefs.forEach((ref) => {
    ref.score.style.height = `${state.partEditorHeight}px`;
  });
}

function clampSampleRate(value: number): number {
  if (!Number.isFinite(value) || value < 8000) return 8000;
  if (value > 96000) return 96000;
  return value;
}

function clampBpm(value: number): number {
  if (!Number.isFinite(value) || value < 20) return 20;
  if (value > 300) return 300;
  return value;
}

function clampTranspose(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < -48) return -48;
  if (value > 48) return 48;
  return Math.trunc(value);
}

function partPayloads(): PartPayload[] {
  return partRefs.map((ref, index) => ({
    name: ref.name.value.trim() || `part ${index + 1}`,
    timbre: timbrePayload(ref),
    score: ref.score.value.trim(),
  }));
}

function scoreLines(value: string): string[] {
  if (!value.trim()) {
    return [];
  }
  return value.split(/\r?\n/).map((line) => line.trimEnd());
}

function scoreText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((line) => String(line)).join("\n").trim();
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function buildProject(): MusicProject {
  return {
    title: titleText(),
    key: keyElement.value.trim() || "c major",
    time_signature: timeSignatureElement.value.trim() || "4/4",
    bpm: clampBpm(Number(bpmElement.value)),
    sample_rate: clampSampleRate(Number(sampleRateElement.value)),
    transpose: clampTranspose(Number(transposeElement.value)),
    parts: partRefs.map((ref, index) => ({
      name: ref.name.value.trim() || `part ${index + 1}`,
      timbre: timbrePayload(ref),
      score: scoreLines(ref.score.value),
    })),
  };
}

function stripExtension(filename: string, extension: string): string {
  return filename.toLowerCase().endsWith(extension)
    ? filename.slice(0, -extension.length)
    : filename;
}

function titleText(): string {
  return titleElement.value.trim() || "untitled";
}

function filenameStemFromTitle(title: string): string {
  const stem = title
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return stem || "untitled";
}

function filenameFromTitle(extension: string): string {
  return `${filenameStemFromTitle(titleText())}${extension}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function audioUrlWithCache(audioUrl: string): string {
  const apiRoot = apiRoots[0] || "";
  const prefix = apiRoot
    || (window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "");
  return `${prefix}${audioUrl}?_=${Date.now()}`;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizePreset(value: unknown): TimbrePreset {
  const normalized = String(value || "triangle")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  if (normalized === "sawtooth") {
    return "saw";
  }
  if (timbrePresets.includes(normalized as TimbrePreset)) {
    return normalized as TimbrePreset;
  }
  return "triangle";
}

function normalizeMix(value: unknown, fallback: MixWeights): MixWeights {
  if (isRecord(value)) {
    return {
      sine: clampUnit(Number(value.sine ?? fallback.sine)),
      square: clampUnit(Number(value.square ?? fallback.square)),
      triangle: clampUnit(Number(value.triangle ?? fallback.triangle)),
      saw: clampUnit(Number(value.saw ?? fallback.saw)),
    };
  }
  if (Array.isArray(value)) {
    return {
      sine: clampUnit(Number(value[0] ?? fallback.sine)),
      square: clampUnit(Number(value[1] ?? fallback.square)),
      triangle: clampUnit(Number(value[2] ?? fallback.triangle)),
      saw: clampUnit(Number(value[3] ?? fallback.saw)),
    };
  }
  return { ...fallback };
}

function timbreState(value: unknown): { preset: TimbrePreset; mix: MixWeights } {
  if (isRecord(value)) {
    const preset = normalizePreset(value.preset);
    const fallback = preset === "custom" ? presetMixes.custom : presetMixes[preset];
    return {
      preset,
      mix: normalizeMix(value.mix, fallback),
    };
  }
  const preset = normalizePreset(value);
  return { preset, mix: { ...presetMixes[preset] } };
}

function mixFromInputs(ref: ElementRef): MixWeights {
  return {
    sine: clampUnit(Number(ref.mixInputs.sine.value)),
    square: clampUnit(Number(ref.mixInputs.square.value)),
    triangle: clampUnit(Number(ref.mixInputs.triangle.value)),
    saw: clampUnit(Number(ref.mixInputs.saw.value)),
  };
}

function timbrePayload(ref: ElementRef): Timbre {
  const preset = normalizePreset(ref.timbre.value);
  if (preset === "custom") {
    return { preset: "custom", mix: mixFromInputs(ref) };
  }
  return preset;
}

function mixedWaveSample(phase: number, mix: MixWeights): number {
  const total = mixKeys.reduce((sum, key) => sum + mix[key], 0);
  if (total <= 0) return 0;

  const sine = Math.sin(2 * Math.PI * phase);
  const square = phase < 0.5 ? 1 : -1;
  const triangle = 1 - 4 * Math.abs(phase - 0.5);
  const saw = 2 * phase - 1;

  return (
    (mix.sine * sine
      + mix.square * square
      + mix.triangle * triangle
      + mix.saw * saw)
    / total
  );
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(180, Math.round(rect.width || 220));
  const height = Math.max(64, Math.round(rect.height || 72));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { ctx, width, height };
}

function drawTimbre(canvas: HTMLCanvasElement, mix: MixWeights) {
  const resized = resizeCanvas(canvas);
  if (!resized) return;
  const { ctx, width, height } = resized;
  const mid = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  for (let x = 0; x < width; x += 1) {
    const phase = x / Math.max(1, width - 1);
    const y = mid - mixedWaveSample(phase, mix) * (height * 0.38);
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function spectrumValues(mix: MixWeights): number[] {
  const sampleCount = 256;
  const harmonicCount = 16;
  const values: number[] = [];

  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    let real = 0;
    let imag = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      const phase = i / sampleCount;
      const sample = mixedWaveSample(phase, mix);
      const angle = -2 * Math.PI * harmonic * phase;
      real += sample * Math.cos(angle);
      imag += sample * Math.sin(angle);
    }
    values.push((2 * Math.hypot(real, imag)) / sampleCount);
  }

  const max = Math.max(...values, 1);
  return values.map((value) => value / max);
}

function drawSpectrum(canvas: HTMLCanvasElement, mix: MixWeights) {
  const resized = resizeCanvas(canvas);
  if (!resized) return;
  const { ctx, width, height } = resized;
  const values = spectrumValues(mix);
  const gap = 3;
  const barWidth = Math.max(4, (width - gap * (values.length - 1)) / values.length);

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 1);
  ctx.lineTo(width, height - 1);
  ctx.stroke();

  ctx.fillStyle = "#1d4ed8";
  values.forEach((value, index) => {
    const barHeight = Math.max(1, value * (height - 8));
    const x = index * (barWidth + gap);
    const y = height - barHeight - 1;
    ctx.fillRect(x, y, barWidth, barHeight);
  });
}

function updateTimbreVisuals(ref: ElementRef) {
  const mix = mixFromInputs(ref);
  ref.mixText.value = mixKeys.map((key) => mix[key]).join(", ");
  drawTimbre(ref.timbreCanvas, mix);
  drawSpectrum(ref.spectrumCanvas, mix);
}

function setCustomMix(ref: ElementRef, mix: MixWeights) {
  mixKeys.forEach((key) => {
    ref.mixInputs[key].value = String(mix[key]);
  });
  updateTimbreVisuals(ref);
}

function parseCustomMixText(value: string, fallback: MixWeights): MixWeights {
  const parts = value.split(/[,\s]+/).filter(Boolean);
  return normalizeMix(parts.map((part) => Number(part)), fallback);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProject(
  rawProject: unknown,
  fallbackTitle = "untitled",
): Omit<ScorePayload, "filename"> {
  if (!isRecord(rawProject)) {
    throw new Error("Music JSON must be an object.");
  }

  const title =
    typeof rawProject.title === "string" && rawProject.title.trim()
      ? rawProject.title.trim()
      : fallbackTitle;
  const key =
    typeof rawProject.key === "string" && rawProject.key.trim()
      ? rawProject.key.trim()
      : "c major";
  const timeSignature =
    typeof rawProject.time_signature === "string" && rawProject.time_signature.trim()
      ? rawProject.time_signature.trim()
      : "4/4";

  const rawParts = Array.isArray(rawProject.parts) ? rawProject.parts : [];
  const parts: PartPayload[] = [];
  for (let index = 0; index < 4; index += 1) {
    const rawPart = isRecord(rawParts[index]) ? rawParts[index] : {};
    const name =
      typeof rawPart.name === "string" && rawPart.name.trim()
        ? rawPart.name.trim()
        : `part ${index + 1}`;
    const { preset, mix } = timbreState(rawPart.timbre);
    const timbre: Timbre = preset === "custom" ? { preset, mix } : preset;
    parts.push({ name, timbre, score: scoreText(rawPart.score) });
  }

  return {
    title,
    key,
    time_signature: timeSignature,
    bpm: clampBpm(Number(rawProject.bpm)),
    sample_rate: clampSampleRate(Number(rawProject.sample_rate)),
    transpose: clampTranspose(Number(rawProject.transpose)),
    parts,
  };
}

function applyProject(project: Omit<ScorePayload, "filename">) {
  titleElement.value = project.title || "untitled";
  keyElement.value = project.key || "c major";
  timeSignatureElement.value = project.time_signature || "4/4";
  bpmElement.value = String(clampBpm(project.bpm));
  sampleRateElement.value = String(clampSampleRate(project.sample_rate));
  transposeElement.value = String(clampTranspose(project.transpose));

  const normalized = [...project.parts];
  while (normalized.length < partRefs.length) {
    normalized.push({
      name: `part ${normalized.length + 1}`,
      timbre: "triangle",
      score: "",
    });
  }
  normalized.slice(0, partRefs.length).forEach((part, index) => {
    const ref = partRefs[index];
    const { preset, mix } = timbreState(part.timbre);
    ref.name.value = part.name || `part ${index + 1}`;
    ref.timbre.value = preset;
    setCustomMix(ref, mix);
    ref.score.value = part.score || "";
  });
}

function getPayload(): RenderRequest {
  return {
    title: titleText(),
    key: keyElement.value.trim() || "c major",
    time_signature: timeSignatureElement.value.trim() || "4/4",
    parts: partPayloads(),
    filename: filenameFromTitle(".wav"),
    sample_rate: clampSampleRate(Number(sampleRateElement.value)),
    bpm: clampBpm(Number(bpmElement.value)),
    transpose: clampTranspose(Number(transposeElement.value)),
    use_cpp: true,
  };
}

async function apiGet<T>(path: string): Promise<T> {
  let lastError: string | null = null;
  for (let i = 0; i < apiRoots.length; i += 1) {
    const root = apiRoots[i];
    try {
      const response = await fetch(`${root}${path}`);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Request failed: ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    } catch (error) {
      if (i < apiRoots.length - 1 && error instanceof TypeError) {
        lastError = "Could not reach local API server (is it running on 127.0.0.1:8000?)";
        continue;
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }
  throw new Error("Failed to reach API.");
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let lastError: string | null = null;
  for (let i = 0; i < apiRoots.length; i += 1) {
    const root = apiRoots[i];
    try {
      const response = await fetch(`${root}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Request failed: ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    } catch (error) {
      if (i < apiRoots.length - 1 && error instanceof TypeError) {
        lastError = "Could not reach local API server (is it running on 127.0.0.1:8000?)";
        continue;
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }
  throw new Error("Failed to reach API.");
}

async function refreshSheets() {
  const { files } = await apiGet<{ files: string[] }>("/api/sheets");
  sheetSelect.innerHTML = `<option value="">Select score</option>`;
  files.forEach((filename) => {
    const option = document.createElement("option");
    option.value = filename;
    option.textContent = stripExtension(filename, ".json");
    sheetSelect.appendChild(option);
  });
  setStatus(`Loaded ${files.length} sample score(s).`);
}

async function loadSheet() {
  if (!sheetSelect.value) {
    setStatus("Pick a sample score first.");
    return;
  }
  const data = await apiGet<ScorePayload>(
    `/api/sheets/${encodeURIComponent(sheetSelect.value)}`,
  );
  applyProject(data);
  state.selectedSheet = data.filename;
  setStatus(`Loaded sample ${data.filename}`);
}

async function loadLocalScore() {
  const file = localScoreFileInput.files?.[0];
  if (!file) {
    return;
  }
  if (!file.name.toLowerCase().endsWith(".json")) {
    setStatus("Choose a .json music file.");
    localScoreFileInput.value = "";
    return;
  }

  const project = normalizeProject(
    JSON.parse(await file.text()),
    stripExtension(file.name, ".json"),
  );
  applyProject(project);
  state.selectedSheet = file.name;
  sheetSelect.value = "";
  localScoreFileInput.value = "";
  setStatus(`Loaded local ${file.name}`);
}

async function saveSheet() {
  const filename = filenameFromTitle(".json");
  const blob = new Blob(
    [`${JSON.stringify(buildProject(), null, 2)}\n`],
    { type: "application/json;charset=utf-8" },
  );
  downloadBlob(blob, filename);
  setStatus(`Saved ${filename} to local`);
}

async function renderWav() {
  const payload = getPayload();
  const response = await apiPost<RenderResponse>("/api/render", payload);
  audioPlayer.src = audioUrlWithCache(response.audio_url);
  audioPlayer.play().catch(() => {});
  setStatus(`Rendered ${response.filename}`);
}

async function saveWav() {
  const payload = getPayload();
  const response = await apiPost<RenderResponse>("/api/render", payload);
  const filename = filenameFromTitle(".wav");
  const audioUrl = audioUrlWithCache(response.audio_url);
  audioPlayer.src = audioUrl;
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download WAV: ${audioResponse.statusText}`);
  }
  downloadBlob(await audioResponse.blob(), filename);
  setStatus(`Saved ${filename} to local`);
}

function selectedLine(textarea: HTMLTextAreaElement): string {
  const { value, selectionStart, selectionEnd } = textarea;
  if (selectionStart !== selectionEnd) {
    return value.slice(selectionStart, selectionEnd).trim();
  }

  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", selectionStart);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return value.slice(lineStart, lineEnd).trim();
}

async function playSelectedLine() {
  const index = state.activePartIndex;
  const line = selectedLine(partRefs[index].score);
  if (!line) {
    setStatus(`Part ${index + 1}: select a line or place the cursor on one.`);
    return;
  }
  const payload: PreviewRequest = {
    timbre: timbrePayload(partRefs[index]),
    line,
    sample_rate: clampSampleRate(Number(sampleRateElement.value)),
    bpm: clampBpm(Number(bpmElement.value)),
    transpose: clampTranspose(Number(transposeElement.value)),
    use_cpp: true,
  };
  const response = await apiPost<RenderResponse>("/api/preview-line", payload);
  audioPlayer.src = audioUrlWithCache(response.audio_url);
  audioPlayer.play().catch(() => {});
  setStatus(`Played preview for part ${index + 1}`);
}

function previewSelectedLine() {
  playSelectedLine().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
}

function renderPartInputs() {
  for (let i = 0; i < 4; i += 1) {
    const section = document.createElement("section");
    section.className = "part";

    const header = document.createElement("div");
    header.className = "part-header";

    const name = document.createElement("input");
    name.type = "text";
    name.value = `part ${i + 1}`;
    name.ariaLabel = `Part ${i + 1} name`;

    const timbre = document.createElement("select");
    timbrePresets.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (value === "triangle") option.selected = true;
      timbre.appendChild(option);
    });

    const mixPanel = document.createElement("div");
    mixPanel.className = "custom-mix";

    const mixInputs = {} as Record<keyof MixWeights, HTMLInputElement>;
    mixKeys.forEach((key) => {
      const label = document.createElement("label");
      label.className = "mix-slider";
      const text = document.createElement("span");
      text.textContent = key;
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.value = String(presetMixes.triangle[key]);
      input.addEventListener("input", () => {
        const ref = partRefs[i];
        ref.timbre.value = "custom";
        setCustomMix(ref, mixFromInputs(ref));
      });
      label.appendChild(text);
      label.appendChild(input);
      mixPanel.appendChild(label);
      mixInputs[key] = input;
    });

    const mixText = document.createElement("input");
    mixText.className = "mix-values";
    mixText.value = mixKeys.map((key) => presetMixes.triangle[key]).join(", ");
    mixText.placeholder = "sine, square, triangle, saw";
    mixText.addEventListener("change", () => {
      const ref = partRefs[i];
      ref.timbre.value = "custom";
      setCustomMix(
        ref,
        parseCustomMixText(mixText.value, mixFromInputs(ref)),
      );
    });

    const mixDetails = document.createElement("details");
    mixDetails.className = "mix-details";
    const mixSummary = document.createElement("summary");
    mixSummary.textContent = "mix";
    mixDetails.appendChild(mixSummary);
    mixDetails.appendChild(mixText);

    const plotGrid = document.createElement("div");
    plotGrid.className = "timbre-plots";

    const wavePlot = document.createElement("figure");
    const timbreCanvas = document.createElement("canvas");
    timbreCanvas.ariaLabel = "timbre over one period";
    const waveCaption = document.createElement("figcaption");
    waveCaption.textContent = "wave";
    wavePlot.appendChild(timbreCanvas);
    wavePlot.appendChild(waveCaption);

    const spectrumPlot = document.createElement("figure");
    const spectrumCanvas = document.createElement("canvas");
    spectrumCanvas.ariaLabel = "frequency spectrum";
    const spectrumCaption = document.createElement("figcaption");
    spectrumCaption.textContent = "spectrum";
    spectrumPlot.appendChild(spectrumCanvas);
    spectrumPlot.appendChild(spectrumCaption);

    plotGrid.appendChild(wavePlot);
    plotGrid.appendChild(spectrumPlot);
    mixDetails.appendChild(plotGrid);
    mixDetails.addEventListener("toggle", () => {
      if (mixDetails.open) {
        updateTimbreVisuals(partRefs[i]);
      }
    });
    mixPanel.appendChild(mixDetails);

    timbre.addEventListener("change", () => {
      const ref = partRefs[i];
      const preset = normalizePreset(timbre.value);
      if (preset !== "custom") {
        setCustomMix(ref, presetMixes[preset]);
      }
    });

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Example: 2c 2d 2eb 2g | 2f 2g";
    textarea.value = "";
    textarea.addEventListener("focus", () => {
      state.activePartIndex = i;
    });
    textarea.addEventListener("select", () => {
      state.activePartIndex = i;
    });
    textarea.addEventListener("click", () => {
      state.activePartIndex = i;
    });
    textarea.addEventListener("keyup", () => {
      state.activePartIndex = i;
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.altKey && event.key === "Enter") {
        event.preventDefault();
        state.activePartIndex = i;
        previewSelectedLine();
      }
    });

    header.appendChild(name);
    header.appendChild(timbre);

    section.appendChild(header);
    section.appendChild(mixPanel);
    section.appendChild(textarea);
    partsContainer.appendChild(section);

    partRefs.push({
      name,
      timbre,
      mixPanel,
      mixInputs,
      mixText,
      timbreCanvas,
      spectrumCanvas,
      score: textarea,
    });
    setCustomMix(partRefs[i], presetMixes.triangle);
  }
  syncPartEditorHeights();
}

renderPartInputs();

window.addEventListener("resize", () => {
  partRefs.forEach(updateTimbreVisuals);
});

const resizeHandle = document.createElement("div");
resizeHandle.className = "parts-resize-handle";
resizeHandle.title = "Drag to resize all parts";
resizeHandle.innerHTML = `<span aria-hidden="true"></span>`;
partsContainer.after(resizeHandle);

let resizeStartY = 0;
let resizeStartHeight = state.partEditorHeight;

resizeHandle.addEventListener("pointerdown", (event) => {
  resizeStartY = event.clientY;
  resizeStartHeight = state.partEditorHeight;
  resizeHandle.setPointerCapture(event.pointerId);
});

resizeHandle.addEventListener("pointermove", (event) => {
  if (!resizeHandle.hasPointerCapture(event.pointerId)) {
    return;
  }
  state.partEditorHeight = Math.max(130, resizeStartHeight + event.clientY - resizeStartY);
  syncPartEditorHeights();
});

resizeHandle.addEventListener("pointerup", (event) => {
  resizeHandle.releasePointerCapture(event.pointerId);
});

loadButton.addEventListener("click", () => {
  loadSheet().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

localScoreButton.addEventListener("click", () => {
  localScoreFileInput.click();
});

localScoreFileInput.addEventListener("change", () => {
  loadLocalScore().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

previewButton.addEventListener("click", () => {
  previewSelectedLine();
});

saveButton.addEventListener("click", () => {
  saveSheet().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

saveWavButton.addEventListener("click", () => {
  saveWav().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

renderButton.addEventListener("click", () => {
  renderWav().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

refreshSheets().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
