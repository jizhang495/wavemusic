import "./styles.css";

type Waveform = "triangle" | "sine" | "square" | "sawtooth";

interface PartPayload {
  waveform: Waveform;
  score: string;
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
  score: string;
  parts: PartPayload[];
}

type ElementRef = {
  waveform: HTMLSelectElement;
  score: HTMLTextAreaElement;
};

const waveforms: Waveform[] = ["triangle", "sine", "square", "sawtooth"];
const apiRoots = (() => {
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
};

const container = document.createElement("div");
container.innerHTML = `
  <h1 class="title">WaveMusic Web</h1>
  <p class="subtitle">Create scores, save/load files, and render WAV audio from your browser.</p>
  <section class="toolbar">
    <label>
      <span>Output WAV filename</span>
      <input id="output-filename" value="m.wav" placeholder="m.wav" />
    </label>
    <label>
      <span>Load score</span>
      <select id="sheet-select">
        <option value="">Select score</option>
      </select>
    </label>
    <label>
      <span>BPM</span>
      <input id="bpm-input" type="number" min="20" max="300" value="100" />
    </label>
    <label>
      <span>Sample rate</span>
      <input id="sample-rate" type="number" min="8000" max="96000" step="1000" value="44100" />
    </label>
  </section>
  <section class="toolbar">
    <button id="refresh-sheets" type="button">Refresh sheet list</button>
    <button id="load-sheet" type="button">Load selected sheet</button>
    <button id="save-sheet" type="button">Save current score</button>
  </section>
  <section class="toolbar">
    <label>
      <span>Save filename</span>
      <input id="save-filename" value="untitled.wmusic" placeholder="untitled.wmusic" />
    </label>
    <label>
      <span>Status</span>
      <span id="status" class="status">Idle</span>
    </label>
  </section>
  <section class="playback-bar">
    <button id="preview-line" type="button">Preview selected</button>
    <button id="render" type="button">Render WAV</button>
    <audio id="audio-player" controls></audio>
  </section>
  <section class="parts" id="parts"></section>
`;
app.appendChild(container);

const statusElement = app.querySelector<HTMLElement>("#status")!;
const outputFilenameElement = app.querySelector<HTMLInputElement>("#output-filename")!;
const sheetSelect = app.querySelector<HTMLSelectElement>("#sheet-select")!;
const bpmElement = app.querySelector<HTMLInputElement>("#bpm-input")!;
const sampleRateElement = app.querySelector<HTMLInputElement>("#sample-rate")!;
const saveFilenameElement = app.querySelector<HTMLInputElement>("#save-filename")!;
const audioPlayer = app.querySelector<HTMLAudioElement>("#audio-player")!;
const refreshButton = app.querySelector<HTMLButtonElement>("#refresh-sheets")!;
const loadButton = app.querySelector<HTMLButtonElement>("#load-sheet")!;
const previewButton = app.querySelector<HTMLButtonElement>("#preview-line")!;
const saveButton = app.querySelector<HTMLButtonElement>("#save-sheet")!;
const renderButton = app.querySelector<HTMLButtonElement>("#render")!;
const partsContainer = app.querySelector<HTMLElement>("#parts")!;

function setStatus(message: string) {
  statusElement.textContent = message;
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
  return partRefs.map((ref) => ({
    waveform: ref.waveform.value as Waveform,
    score: ref.score.value.trim(),
  }));
}

function buildScoreText(): string {
  return partPayloads()
    .map(({ waveform, score }) => `${waveform}: ${score}`)
    .join("\n");
}

function applyPartPayloads(parts: PartPayload[]) {
  const normalized = [...parts];
  while (normalized.length < partRefs.length) {
    normalized.push({ waveform: "triangle", score: "" });
  }
  normalized.slice(0, partRefs.length).forEach((part, index) => {
    const ref = partRefs[index];
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
  setStatus(`Loaded ${files.length} sheet(s).`);
}

async function loadSheet() {
  if (!sheetSelect.value) {
    setStatus("Pick a score first.");
    return;
  }
  const data = await apiGet<ScorePayload>(`/api/sheets/${encodeURIComponent(sheetSelect.value)}`);
  applyPartPayloads(data.parts);
  state.selectedSheet = data.filename;
  setStatus(`Loaded ${data.filename}`);
}

async function saveSheet() {
  const filename = saveFilenameElement.value.trim() || "untitled.wmusic";
  const payload: ScorePayload = {
    filename,
    score: buildScoreText(),
    parts: partPayloads(),
  };
  const saved = await apiPost<ScorePayload>("/api/sheets", payload);
  await refreshSheets();
  sheetSelect.value = saved.filename;
  setStatus(`Saved ${saved.filename}`);
}

async function renderWav() {
  const payload = getPayload();
  const response = await apiPost<RenderResponse>("/api/render", payload);
  audioPlayer.src = `${response.audio_url}?_=${Date.now()}`;
  audioPlayer.play().catch(() => {});
  state.outputFilename = response.filename;
  setStatus(`Rendered ${response.filename}`);
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
  audioPlayer.src = `${response.audio_url}?_=${Date.now()}`;
  audioPlayer.play().catch(() => {});
  setStatus(`Played preview for part ${index + 1}`);
}

function renderPartInputs() {
  for (let i = 0; i < 4; i += 1) {
    const section = document.createElement("section");
    section.className = "part";

    const label = document.createElement("label");
    label.textContent = `Part ${i + 1}`;

    const waveformLabel = document.createElement("span");
    waveformLabel.textContent = "Waveform";

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

    const waveformRow = document.createElement("div");
    waveformRow.style.display = "grid";
    waveformRow.style.gridTemplateColumns = "1fr 2fr";
    waveformRow.style.gap = "0.4rem";
    waveformRow.appendChild(waveformLabel);
    waveformRow.appendChild(waveform);

    section.appendChild(label);
    section.appendChild(waveformRow);
    section.appendChild(textarea);
    partsContainer.appendChild(section);

    partRefs.push({ waveform, score: textarea });
  }
}

renderPartInputs();

refreshButton.addEventListener("click", () => {
  refreshSheets().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

loadButton.addEventListener("click", () => {
  loadSheet().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

previewButton.addEventListener("click", () => {
  playSelectedLine().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

saveButton.addEventListener("click", () => {
  saveSheet().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

renderButton.addEventListener("click", () => {
  renderWav().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
});

refreshSheets().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
