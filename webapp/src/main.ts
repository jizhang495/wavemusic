import "./styles.css";

type Waveform = "triangle" | "sine" | "square" | "sawtooth";

interface PartPayload {
  name: string;
  waveform: Waveform;
  score: string;
}

interface ProjectPartPayload {
  name?: string;
  waveform?: string;
  score?: string | string[];
}

interface MusicProject {
  bpm: number;
  sample_rate: number;
  parts: ProjectPartPayload[];
}

interface RenderRequest {
  parts: PartPayload[];
  filename: string;
  sample_rate: number;
  bpm: number;
  use_cpp: boolean;
}

interface PreviewRequest {
  waveform: Waveform;
  line: string;
  sample_rate: number;
  bpm: number;
  use_cpp: boolean;
}

interface RenderResponse {
  filename: string;
  audio_url: string;
  score: string;
}

interface ScorePayload {
  filename: string;
  bpm: number;
  sample_rate: number;
  parts: PartPayload[];
}

type ElementRef = {
  name: HTMLInputElement;
  waveform: HTMLSelectElement;
  score: HTMLTextAreaElement;
};

const waveforms: Waveform[] = ["triangle", "sine", "square", "sawtooth"];
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
  outputFilename: "m.wav",
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
      <span>Save filename</span>
      <input id="save-filename" value="untitled.json" placeholder="untitled.json" />
    </label>
    <button id="save-sheet" type="button">Save score</button>
    <label>
      <span>Output WAV filename</span>
      <input id="output-filename" value="m.wav" placeholder="m.wav" />
    </label>
    <button id="save-wav" type="button">Save WAV</button>
    <label>
      <span>BPM</span>
      <input id="bpm-input" type="number" min="20" max="300" value="100" />
    </label>
    <label>
      <span>Sample Rate</span>
      <input id="sample-rate" type="number" min="8000" max="96000" step="1000" value="44100" />
    </label>
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
const outputFilenameElement = app.querySelector<HTMLInputElement>("#output-filename")!;
const sheetSelect = app.querySelector<HTMLSelectElement>("#sheet-select")!;
const bpmElement = app.querySelector<HTMLInputElement>("#bpm-input")!;
const sampleRateElement = app.querySelector<HTMLInputElement>("#sample-rate")!;
const saveFilenameElement = app.querySelector<HTMLInputElement>("#save-filename")!;
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

function partPayloads(): PartPayload[] {
  return partRefs.map((ref, index) => ({
    name: ref.name.value.trim() || `part ${index + 1}`,
    waveform: ref.waveform.value as Waveform,
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
    bpm: clampBpm(Number(bpmElement.value)),
    sample_rate: clampSampleRate(Number(sampleRateElement.value)),
    parts: partRefs.map((ref, index) => ({
      name: ref.name.value.trim() || `part ${index + 1}`,
      waveform: ref.waveform.value,
      score: scoreLines(ref.score.value),
    })),
  };
}

function ensureExtension(filename: string, extension: string): string {
  const trimmed = filename.trim();
  const fallback = `untitled${extension}`;
  const safeName = trimmed || fallback;
  return safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`;
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

function normalizeWaveform(value: string): Waveform {
  const normalized = value.trim().toLowerCase();
  if (normalized === "saw") {
    return "sawtooth";
  }
  if (waveforms.includes(normalized as Waveform)) {
    return normalized as Waveform;
  }
  return "triangle";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProject(rawProject: unknown): Omit<ScorePayload, "filename"> {
  if (!isRecord(rawProject)) {
    throw new Error("Music JSON must be an object.");
  }

  const rawParts = Array.isArray(rawProject.parts) ? rawProject.parts : [];
  const parts: PartPayload[] = [];
  for (let index = 0; index < 4; index += 1) {
    const rawPart = isRecord(rawParts[index]) ? rawParts[index] : {};
    const name =
      typeof rawPart.name === "string" && rawPart.name.trim()
        ? rawPart.name.trim()
        : `part ${index + 1}`;
    const waveform = normalizeWaveform(
      typeof rawPart.waveform === "string" ? rawPart.waveform : "",
    );
    parts.push({ name, waveform, score: scoreText(rawPart.score) });
  }

  return {
    bpm: clampBpm(Number(rawProject.bpm)),
    sample_rate: clampSampleRate(Number(rawProject.sample_rate)),
    parts,
  };
}

function applyProject(project: Omit<ScorePayload, "filename">) {
  bpmElement.value = String(clampBpm(project.bpm));
  sampleRateElement.value = String(clampSampleRate(project.sample_rate));

  const normalized = [...project.parts];
  while (normalized.length < partRefs.length) {
    normalized.push({
      name: `part ${normalized.length + 1}`,
      waveform: "triangle",
      score: "",
    });
  }
  normalized.slice(0, partRefs.length).forEach((part, index) => {
    const ref = partRefs[index];
    ref.name.value = part.name || `part ${index + 1}`;
    ref.waveform.value = part.waveform;
    ref.score.value = part.score || "";
  });
}

function getPayload(): RenderRequest {
  return {
    parts: partPayloads(),
    filename: outputFilenameElement.value || "m.wav",
    sample_rate: clampSampleRate(Number(sampleRateElement.value)),
    bpm: clampBpm(Number(bpmElement.value)),
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
    option.textContent = filename;
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
  saveFilenameElement.value = data.filename;
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

  const project = normalizeProject(JSON.parse(await file.text()));
  applyProject(project);
  saveFilenameElement.value = file.name;
  state.selectedSheet = file.name;
  sheetSelect.value = "";
  localScoreFileInput.value = "";
  setStatus(`Loaded local ${file.name}`);
}

async function saveSheet() {
  const filename = ensureExtension(saveFilenameElement.value, ".json");
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
  state.outputFilename = response.filename;
  setStatus(`Rendered ${response.filename}`);
}

async function saveWav() {
  const payload = getPayload();
  const response = await apiPost<RenderResponse>("/api/render", payload);
  const filename = ensureExtension(outputFilenameElement.value || response.filename, ".wav");
  const audioUrl = audioUrlWithCache(response.audio_url);
  audioPlayer.src = audioUrl;
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download WAV: ${audioResponse.statusText}`);
  }
  downloadBlob(await audioResponse.blob(), filename);
  state.outputFilename = response.filename;
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
    waveform: partRefs[index].waveform.value as Waveform,
    line,
    sample_rate: clampSampleRate(Number(sampleRateElement.value)),
    bpm: clampBpm(Number(bpmElement.value)),
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

    const waveform = document.createElement("select");
    waveforms.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (value === "triangle") option.selected = true;
      waveform.appendChild(option);
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
    header.appendChild(waveform);

    section.appendChild(header);
    section.appendChild(textarea);
    partsContainer.appendChild(section);

    partRefs.push({ name, waveform, score: textarea });
  }
  syncPartEditorHeights();
}

renderPartInputs();

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
