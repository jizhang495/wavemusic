import "./styles.css";
import aiSystemPrompt from "../../prompts/wavemusic-json-system-prompt.txt?raw";

type TimbrePreset =
  | "sine"
  | "square"
  | "triangle"
  | "saw"
  | "soft organ"
  | "bright organ"
  | "reed organ"
  | "mellow organ"
  | "string organ"
  | "warm synth organ"
  | "baroque violin"
  | "viola da gamba"
  | "recorder"
  | "lute"
  | "harpsichord"
  | "custom";

type MixWeights = {
  sine: number;
  square: number;
  triangle: number;
  saw: number;
};

type TimbreSource = "mix" | "partials";

type FilterSettings = {
  highpass?: number;
  lowpass?: number;
};

type EnvelopeSettings = {
  attack_ms: number;
  decay_ms: number;
  sustain: number;
  release_ms: number;
};

type PresetTimbre = {
  source?: TimbreSource;
  mix?: MixWeights;
  partials?: number[];
  filter?: FilterSettings;
  envelope?: EnvelopeSettings;
  noise?: number;
  vibratoDepth?: number;
};

type TimbreObject = {
  preset: TimbrePreset;
  mix?: MixWeights;
  partials?: number[];
  filter?: FilterSettings;
  noise?: number;
  envelope?: EnvelopeSettings;
  vibrato?: {
    depth: number;
  };
};

type Timbre = TimbrePreset | TimbreObject;

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
  mixDetails: HTMLDetailsElement;
  sourceInputs: Record<TimbreSource, HTMLInputElement>;
  mixInputs: Record<keyof MixWeights, HTMLInputElement>;
  mixText: HTMLInputElement;
  partialsText: HTMLInputElement;
  highpassValue: HTMLInputElement;
  lowpassValue: HTMLInputElement;
  advancedEnabled: HTMLInputElement;
  advancedPanel: HTMLElement;
  attackValue: HTMLInputElement;
  decayValue: HTMLInputElement;
  sustainValue: HTMLInputElement;
  releaseValue: HTMLInputElement;
  vibratoValue: HTMLInputElement;
  noiseValue: HTMLInputElement;
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
  "bright organ",
  "reed organ",
  "mellow organ",
  "string organ",
  "warm synth organ",
  "baroque violin",
  "viola da gamba",
  "recorder",
  "lute",
  "harpsichord",
  "custom",
];
const mixKeys: Array<keyof MixWeights> = ["sine", "square", "triangle", "saw"];
const defaultPartials = [1, 0.45, 0.3, 0.18, 0.12, 0.08, 0.05];
const defaultEnvelope: EnvelopeSettings = {
  attack_ms: 20,
  decay_ms: 0,
  sustain: 1,
  release_ms: 20,
};
const referencePlotFrequency = 440;
const defaultMix: MixWeights = { sine: 0.4, square: 0.15, triangle: 0.3, saw: 0.15 };
const presetTimbres: Record<TimbrePreset, PresetTimbre> = {
  sine: { mix: { sine: 1, square: 0, triangle: 0, saw: 0 } },
  square: { mix: { sine: 0, square: 1, triangle: 0, saw: 0 } },
  triangle: { mix: { sine: 0, square: 0, triangle: 1, saw: 0 } },
  saw: { mix: { sine: 0, square: 0, triangle: 0, saw: 1 } },
  "soft organ": {
    mix: { sine: 0.55, square: 0.1, triangle: 0.35, saw: 0 },
    filter: { lowpass: 5200 },
    envelope: { attack_ms: 18, decay_ms: 0, sustain: 1, release_ms: 90 },
  },
  "bright organ": {
    mix: { sine: 0.3, square: 0.2, triangle: 0.2, saw: 0.3 },
    filter: { highpass: 60, lowpass: 7800 },
    envelope: { attack_ms: 12, decay_ms: 0, sustain: 1, release_ms: 70 },
  },
  "reed organ": {
    mix: { sine: 0.2, square: 0.45, triangle: 0.1, saw: 0.25 },
    filter: { highpass: 120, lowpass: 6200 },
    envelope: { attack_ms: 25, decay_ms: 0, sustain: 1, release_ms: 100 },
    noise: 0.01,
  },
  "mellow organ": {
    mix: { sine: 0.7, square: 0.05, triangle: 0.25, saw: 0 },
    filter: { lowpass: 4200 },
    envelope: { attack_ms: 25, decay_ms: 0, sustain: 1, release_ms: 120 },
  },
  "string organ": {
    mix: { sine: 0.25, square: 0.05, triangle: 0.3, saw: 0.4 },
    filter: { highpass: 100, lowpass: 5000 },
    envelope: { attack_ms: 35, decay_ms: 0, sustain: 0.95, release_ms: 160 },
    noise: 0.005,
  },
  "warm synth organ": {
    mix: { sine: 0.4, square: 0.15, triangle: 0.3, saw: 0.15 },
    filter: { lowpass: 6000 },
    envelope: { attack_ms: 22, decay_ms: 0, sustain: 0.98, release_ms: 120 },
    vibratoDepth: 0.03,
  },
  "baroque violin": {
    source: "partials",
    partials: [1, 0.56, 0.38, 0.28, 0.2, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.025],
    filter: { highpass: 120, lowpass: 4500 },
    envelope: { attack_ms: 35, decay_ms: 70, sustain: 0.88, release_ms: 140 },
    noise: 0.025,
  },
  "viola da gamba": {
    source: "partials",
    partials: [1, 0.48, 0.32, 0.22, 0.16, 0.11, 0.08, 0.055],
    filter: { highpass: 80, lowpass: 3800 },
    envelope: { attack_ms: 45, decay_ms: 90, sustain: 0.82, release_ms: 180 },
    noise: 0.018,
  },
  recorder: {
    source: "partials",
    partials: [1, 0.22, 0.08, 0.04, 0.02, 0.012],
    filter: { highpass: 200, lowpass: 6500 },
    envelope: { attack_ms: 18, decay_ms: 40, sustain: 0.96, release_ms: 90 },
    noise: 0.015,
  },
  lute: {
    source: "partials",
    partials: [1, 0.55, 0.38, 0.24, 0.16, 0.1, 0.065, 0.04],
    filter: { highpass: 90, lowpass: 5000 },
    envelope: { attack_ms: 4, decay_ms: 160, sustain: 0.25, release_ms: 90 },
    noise: 0.006,
  },
  harpsichord: {
    source: "partials",
    partials: [1, 0.7, 0.55, 0.42, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05],
    filter: { highpass: 80, lowpass: 7500 },
    envelope: { attack_ms: 2, decay_ms: 220, sustain: 0.18, release_ms: 80 },
    noise: 0.004,
  },
  custom: { mix: defaultMix },
};
const presetMixes: Record<TimbrePreset, MixWeights> = {
  sine: presetTimbres.sine.mix ?? defaultMix,
  square: presetTimbres.square.mix ?? defaultMix,
  triangle: presetTimbres.triangle.mix ?? defaultMix,
  saw: presetTimbres.saw.mix ?? defaultMix,
  "soft organ": presetTimbres["soft organ"].mix ?? defaultMix,
  "bright organ": presetTimbres["bright organ"].mix ?? defaultMix,
  "reed organ": presetTimbres["reed organ"].mix ?? defaultMix,
  "mellow organ": presetTimbres["mellow organ"].mix ?? defaultMix,
  "string organ": presetTimbres["string organ"].mix ?? defaultMix,
  "warm synth organ": presetTimbres["warm synth organ"].mix ?? defaultMix,
  "baroque violin": presetTimbres["baroque violin"].mix ?? defaultMix,
  "viola da gamba": presetTimbres["viola da gamba"].mix ?? defaultMix,
  recorder: presetTimbres.recorder.mix ?? defaultMix,
  lute: presetTimbres.lute.mix ?? defaultMix,
  harpsichord: presetTimbres.harpsichord.mix ?? defaultMix,
  custom: presetTimbres.custom.mix ?? defaultMix,
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
      <p class="subtitle">Create scores with abc's, and render WAV audio.</p>
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
  <section class="toolbar ai-row">
    <label class="ai-prompt-field">
      <span>Generate with AI</span>
      <input id="ai-prompt" placeholder="Describe your music" />
    </label>
    <button id="copy-ai-prompt" type="button">Copy prompt</button>
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
    <button id="render" type="button">Render WAV (Ctrl/Cmd+Enter)</button>
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
const aiPromptElement = app.querySelector<HTMLInputElement>("#ai-prompt")!;
const copyAiPromptButton = app.querySelector<HTMLButtonElement>("#copy-ai-prompt")!;
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

function buildAiPrompt(): string {
  const userInput = aiPromptElement.value.trim()
    || "Write a short four-part piece.";
  return [
    "Generate a JSON file for a four-part WaveMusic music piece.",
    "Follow the schema and system prompt exactly.",
    "",
    "<system prompt>",
    aiSystemPrompt.trim(),
    "</system prompt>",
    "",
    "<user input>",
    userInput,
    "</user input>",
  ].join("\n");
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

async function copyAiPrompt() {
  await copyTextToClipboard(buildAiPrompt());
  setStatus("Copied AI generation prompt.");
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

function clampPositive(value: number, maximum = 96000): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > maximum) return maximum;
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

function normalizePartials(value: unknown): number[] {
  if (Array.isArray(value)) {
    const partials = value
      .slice(0, 32)
      .map((partial) => clampUnit(Number(partial)));
    if (partials.some((partial) => partial > 0)) {
      return partials;
    }
  }
  return [...defaultPartials];
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

function normalizeFilter(value: unknown): FilterSettings {
  if (!isRecord(value)) {
    return {};
  }
  const highpass = clampPositive(Number(value.highpass));
  const lowpass = clampPositive(Number(value.lowpass));
  const filter: FilterSettings = {};
  if (highpass > 0) {
    filter.highpass = highpass;
  }
  if (lowpass > 0 && lowpass > highpass) {
    filter.lowpass = lowpass;
  }
  return filter;
}

function normalizeEnvelope(value: unknown): EnvelopeSettings {
  if (!isRecord(value)) {
    return { ...defaultEnvelope };
  }
  return {
    attack_ms: clampPositive(Number(value.attack_ms ?? defaultEnvelope.attack_ms), 5000),
    decay_ms: clampPositive(Number(value.decay_ms ?? defaultEnvelope.decay_ms), 5000),
    sustain: clampUnit(Number(value.sustain ?? defaultEnvelope.sustain)),
    release_ms: clampPositive(Number(value.release_ms ?? defaultEnvelope.release_ms), 5000),
  };
}

function normalizeVibrato(value: unknown): number {
  if (isRecord(value)) {
    return clampPositive(Number(value.depth), 2);
  }
  return clampPositive(Number(value), 2);
}

function parsePartialsText(value: string, fallback = defaultPartials): number[] {
  const partials = value
    .split(/[,\s]+/)
    .filter(Boolean)
    .slice(0, 32)
    .map((part) => clampUnit(Number(part)));
  return partials.some((partial) => partial > 0) ? partials : [...fallback];
}

type TimbreUiState = {
  preset: TimbrePreset;
  source: TimbreSource;
  mix: MixWeights;
  partials: number[];
  filter: FilterSettings;
  advanced: boolean;
  envelope: EnvelopeSettings;
  vibratoDepth: number;
  noise: number;
};

function presetState(preset: TimbrePreset): TimbreUiState {
  const config = presetTimbres[preset] ?? presetTimbres.triangle;
  const source = config.source ?? (config.partials ? "partials" : "mix");
  return {
    preset,
    source,
    mix: { ...(config.mix ?? defaultMix) },
    partials: [...(config.partials ?? defaultPartials)],
    filter: { ...(config.filter ?? {}) },
    advanced: Boolean(config.envelope || config.noise || config.vibratoDepth),
    envelope: { ...defaultEnvelope, ...(config.envelope ?? {}) },
    vibratoDepth: config.vibratoDepth ?? 0,
    noise: config.noise ?? 0,
  };
}

function timbreState(value: unknown): TimbreUiState {
  if (isRecord(value)) {
    const preset = normalizePreset(value.preset);
    const base = presetState(preset);
    const source = "partials" in value
      ? "partials"
      : "mix" in value
        ? "mix"
        : base.source;
    const hasAdvanced =
      "envelope" in value || "vibrato" in value || "noise" in value;
    return {
      preset,
      source,
      mix: normalizeMix(value.mix, base.mix),
      partials: normalizePartials(value.partials),
      filter: "filter" in value ? normalizeFilter(value.filter) : { ...base.filter },
      advanced: hasAdvanced || base.advanced,
      envelope: "envelope" in value
        ? normalizeEnvelope(value.envelope)
        : { ...base.envelope },
      vibratoDepth: "vibrato" in value
        ? normalizeVibrato(value.vibrato)
        : base.vibratoDepth,
      noise: "noise" in value
        ? clampUnit(Number(value.noise ?? 0))
        : base.noise,
    };
  }
  const preset = normalizePreset(value);
  return presetState(preset);
}

function mixFromInputs(ref: ElementRef): MixWeights {
  return {
    sine: clampUnit(Number(ref.mixInputs.sine.value)),
    square: clampUnit(Number(ref.mixInputs.square.value)),
    triangle: clampUnit(Number(ref.mixInputs.triangle.value)),
    saw: clampUnit(Number(ref.mixInputs.saw.value)),
  };
}

function partialsFromInput(ref: ElementRef): number[] {
  return parsePartialsText(ref.partialsText.value);
}

function filterFromInputs(ref: ElementRef): FilterSettings {
  const highpass = clampPositive(Number(ref.highpassValue.value));
  const rawLowpass = ref.lowpassValue.value.trim();
  const lowpass = rawLowpass ? clampPositive(Number(rawLowpass)) : 0;
  const filter: FilterSettings = {};
  if (highpass > 0) {
    filter.highpass = highpass;
  }
  if (lowpass > 0 && lowpass > highpass) {
    filter.lowpass = lowpass;
  }
  return filter;
}

function envelopeFromInputs(ref: ElementRef): EnvelopeSettings {
  return {
    attack_ms: clampPositive(Number(ref.attackValue.value), 5000),
    decay_ms: clampPositive(Number(ref.decayValue.value), 5000),
    sustain: clampUnit(Number(ref.sustainValue.value)),
    release_ms: clampPositive(Number(ref.releaseValue.value), 5000),
  };
}

function timbreSource(ref: ElementRef): TimbreSource {
  return ref.sourceInputs.partials.checked ? "partials" : "mix";
}

function nearlyEqual(left: number | undefined, right: number | undefined): boolean {
  return Math.abs((left ?? 0) - (right ?? 0)) < 0.000001;
}

function mixesEqual(left: MixWeights, right: MixWeights): boolean {
  return mixKeys.every((key) => nearlyEqual(left[key], right[key]));
}

function partialsEqual(left: number[], right: number[]): boolean {
  return left.length === right.length
    && left.every((value, index) => nearlyEqual(value, right[index]));
}

function filtersEqual(left: FilterSettings, right: FilterSettings): boolean {
  return nearlyEqual(left.highpass, right.highpass)
    && nearlyEqual(left.lowpass, right.lowpass);
}

function envelopesEqual(left: EnvelopeSettings, right: EnvelopeSettings): boolean {
  return nearlyEqual(left.attack_ms, right.attack_ms)
    && nearlyEqual(left.decay_ms, right.decay_ms)
    && nearlyEqual(left.sustain, right.sustain)
    && nearlyEqual(left.release_ms, right.release_ms);
}

function timbreMatchesPreset(state: TimbreUiState, preset: TimbrePreset): boolean {
  if (preset === "custom") return false;
  const base = presetState(preset);
  const sourceMatches = state.source === "partials"
    ? partialsEqual(state.partials, base.partials)
    : mixesEqual(state.mix, base.mix);
  return state.source === base.source
    && sourceMatches
    && filtersEqual(state.filter, base.filter)
    && state.advanced === base.advanced
    && envelopesEqual(state.envelope, base.envelope)
    && nearlyEqual(state.vibratoDepth, base.vibratoDepth)
    && nearlyEqual(state.noise, base.noise);
}

function timbreControlsMatchPreset(ref: ElementRef, preset: TimbrePreset): boolean {
  return timbreMatchesPreset({
    preset,
    source: timbreSource(ref),
    mix: mixFromInputs(ref),
    partials: partialsFromInput(ref),
    filter: filterFromInputs(ref),
    advanced: ref.advancedEnabled.checked,
    envelope: envelopeFromInputs(ref),
    vibratoDepth: clampPositive(Number(ref.vibratoValue.value), 2),
    noise: clampUnit(Number(ref.noiseValue.value)),
  }, preset);
}

function timbrePayload(ref: ElementRef): Timbre {
  const preset = normalizePreset(ref.timbre.value);
  if (timbreControlsMatchPreset(ref, preset)) {
    return preset;
  }

  const source = timbreSource(ref);
  const filter = filterFromInputs(ref);
  const hasFilter = filter.highpass !== undefined || filter.lowpass !== undefined;
  const timbre: TimbreObject = { preset };

  if (source === "partials") {
    timbre.preset = "custom";
    timbre.partials = partialsFromInput(ref);
  } else if (preset === "custom") {
    timbre.mix = mixFromInputs(ref);
  }

  if (hasFilter) {
    timbre.filter = filter;
  }

  if (ref.advancedEnabled.checked) {
    timbre.envelope = envelopeFromInputs(ref);
    timbre.noise = clampUnit(Number(ref.noiseValue.value));
    timbre.vibrato = {
      depth: clampPositive(Number(ref.vibratoValue.value), 2),
    };
  }

  if (Object.keys(timbre).length > 1 || preset === "custom") {
    return timbre;
  }
  return preset;
}

function timbrePayloadFromState(state: TimbreUiState): Timbre {
  if (timbreMatchesPreset(state, state.preset)) {
    return state.preset;
  }

  const hasFilter = state.filter.highpass !== undefined || state.filter.lowpass !== undefined;
  const timbre: TimbreObject = { preset: state.preset };
  if (state.source === "partials") {
    timbre.preset = "custom";
    timbre.partials = state.partials;
  } else if (state.preset === "custom") {
    timbre.mix = state.mix;
  }
  if (hasFilter) {
    timbre.filter = state.filter;
  }
  if (state.advanced) {
    timbre.envelope = state.envelope;
    timbre.noise = state.noise;
    timbre.vibrato = { depth: state.vibratoDepth };
  }
  if (Object.keys(timbre).length > 1 || state.preset === "custom") {
    return timbre;
  }
  return state.preset;
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

function partialsWaveSample(phase: number, partials: number[]): number {
  const total = partials.reduce((sum, partial) => sum + partial, 0);
  if (total <= 0) return 0;
  return partials.reduce(
    (sample, partial, index) =>
      sample + (partial / total) * Math.sin(2 * Math.PI * (index + 1) * phase),
    0,
  );
}

function currentTimbreState(ref: ElementRef): TimbreUiState {
  return {
    preset: normalizePreset(ref.timbre.value),
    source: timbreSource(ref),
    mix: mixFromInputs(ref),
    partials: partialsFromInput(ref),
    filter: filterFromInputs(ref),
    advanced: ref.advancedEnabled.checked,
    envelope: envelopeFromInputs(ref),
    vibratoDepth: clampPositive(Number(ref.vibratoValue.value), 2),
    noise: clampUnit(Number(ref.noiseValue.value)),
  };
}

function sourceWaveSample(phase: number, state: TimbreUiState): number {
  return state.source === "partials"
    ? partialsWaveSample(phase, state.partials)
    : mixedWaveSample(phase, state.mix);
}

function filteredWaveSamples(state: TimbreUiState, sampleCount: number): number[] {
  const totalSamples = sampleCount * 4;
  const sampleRate = referencePlotFrequency * sampleCount;
  const dt = 1 / sampleRate;
  const highpass = state.filter.highpass;
  const lowpass = state.filter.lowpass;
  const highpassEnabled = highpass !== undefined && highpass > 0 && highpass < sampleRate / 2;
  const lowpassEnabled = lowpass !== undefined && lowpass > 0 && lowpass < sampleRate / 2;
  const hpAlpha = highpassEnabled
    ? (1 / (2 * Math.PI * highpass)) / ((1 / (2 * Math.PI * highpass)) + dt)
    : 0;
  const lpAlpha = lowpassEnabled
    ? dt / ((1 / (2 * Math.PI * lowpass)) + dt)
    : 0;
  let hpPrevIn = 0;
  let hpPrevOut = 0;
  let lpPrevOut = 0;
  const output: number[] = [];

  for (let i = 0; i < totalSamples; i += 1) {
    const phase = (i % sampleCount) / sampleCount;
    let sample = sourceWaveSample(phase, state);
    if (highpassEnabled) {
      const filtered = hpAlpha * (hpPrevOut + sample - hpPrevIn);
      hpPrevIn = sample;
      hpPrevOut = filtered;
      sample = filtered;
    }
    if (lowpassEnabled) {
      lpPrevOut = lpPrevOut + lpAlpha * (sample - lpPrevOut);
      sample = lpPrevOut;
    }
    if (i >= totalSamples - sampleCount) {
      output.push(sample);
    }
  }
  return output;
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

function drawTimbre(canvas: HTMLCanvasElement, state: TimbreUiState) {
  const resized = resizeCanvas(canvas);
  if (!resized) return;
  const { ctx, width, height } = resized;
  const mid = height / 2;
  const samples = filteredWaveSamples(state, Math.max(64, width));

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
    const sample = samples[Math.min(samples.length - 1, x)] ?? 0;
    const y = mid - sample * (height * 0.38);
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function spectrumValues(state: TimbreUiState): number[] {
  const sampleCount = 256;
  const harmonicCount = 16;
  const values: number[] = [];
  const samples = filteredWaveSamples(state, sampleCount);

  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    let real = 0;
    let imag = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      const phase = i / sampleCount;
      const sample = samples[i] ?? sourceWaveSample(phase, state);
      const angle = -2 * Math.PI * harmonic * phase;
      real += sample * Math.cos(angle);
      imag += sample * Math.sin(angle);
    }
    values.push((2 * Math.hypot(real, imag)) / sampleCount);
  }

  const max = Math.max(...values, 1);
  return values.map((value) => value / max);
}

function drawSpectrum(canvas: HTMLCanvasElement, state: TimbreUiState) {
  const resized = resizeCanvas(canvas);
  if (!resized) return;
  const { ctx, width, height } = resized;
  const values = spectrumValues(state);
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
  const state = currentTimbreState(ref);
  ref.mixText.value = mixKeys.map((key) => state.mix[key]).join(", ");
  ref.partialsText.value = state.partials.join(", ");
  drawTimbre(ref.timbreCanvas, state);
  drawSpectrum(ref.spectrumCanvas, state);
}

function setCustomMix(ref: ElementRef, mix: MixWeights) {
  mixKeys.forEach((key) => {
    ref.mixInputs[key].value = String(mix[key]);
  });
  updateTimbreVisuals(ref);
}

function setPartials(ref: ElementRef, partials: number[]) {
  ref.partialsText.value = partials.join(", ");
  updateTimbreVisuals(ref);
}

function setFilterControls(ref: ElementRef, filter: FilterSettings) {
  ref.highpassValue.value = String(filter.highpass ?? 0);
  ref.lowpassValue.value = filter.lowpass === undefined ? "" : String(filter.lowpass);
  syncFilterControls(ref);
}

function setAdvancedControls(ref: ElementRef, state: TimbreUiState) {
  ref.advancedEnabled.checked = state.advanced;
  ref.attackValue.value = String(state.envelope.attack_ms);
  ref.decayValue.value = String(state.envelope.decay_ms);
  ref.sustainValue.value = String(state.envelope.sustain);
  ref.releaseValue.value = String(state.envelope.release_ms);
  ref.vibratoValue.value = String(state.vibratoDepth);
  ref.noiseValue.value = String(state.noise);
  syncAdvancedControls(ref);
}

function syncSourceControls(ref: ElementRef) {
  const source = timbreSource(ref);
  const mixDisabled = source !== "mix";
  const partialsDisabled = source !== "partials";
  ref.mixText.disabled = mixDisabled;
  mixKeys.forEach((key) => {
    ref.mixInputs[key].disabled = mixDisabled;
  });
  ref.partialsText.disabled = partialsDisabled;
  ref.mixPanel.classList.toggle("source-partials", source === "partials");
  ref.mixPanel.classList.toggle("source-mix", source === "mix");
  updateTimbreVisuals(ref);
}

function syncFilterControls(ref: ElementRef) {
  const highpass = clampPositive(Number(ref.highpassValue.value));
  ref.lowpassValue.min = String(highpass + 1);
  updateTimbreVisuals(ref);
}

function syncAdvancedControls(ref: ElementRef) {
  const enabled = ref.advancedEnabled.checked;
  ref.advancedPanel.classList.toggle("is-disabled", !enabled);
  [
    ref.attackValue,
    ref.decayValue,
    ref.sustainValue,
    ref.releaseValue,
    ref.vibratoValue,
    ref.noiseValue,
  ].forEach((input) => {
    input.disabled = !enabled;
  });
}

function setTimbreControls(ref: ElementRef, state: TimbreUiState) {
  ref.timbre.value = state.preset;
  ref.sourceInputs[state.source].checked = true;
  setCustomMix(ref, state.mix);
  setPartials(ref, state.partials);
  setFilterControls(ref, state.filter);
  setAdvancedControls(ref, state);
  syncSourceControls(ref);
}

function setMixDetailsOpen(ref: ElementRef, open: boolean) {
  ref.mixDetails.open = open;
  if (open) {
    requestAnimationFrame(() => updateTimbreVisuals(ref));
  }
}

function markTimbreCustom(ref: ElementRef) {
  ref.timbre.value = "custom";
  setMixDetailsOpen(ref, true);
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
    const state = timbreState(rawPart.timbre);
    const timbre = isRecord(rawPart.timbre)
      ? timbrePayloadFromState(state)
      : state.preset;
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
    const state = timbreState(part.timbre);
    ref.name.value = part.name || `part ${index + 1}`;
    setTimbreControls(ref, state);
    setMixDetailsOpen(ref, state.preset === "custom");
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

function renderWavWithStatus() {
  renderWav().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
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

    const sourceInputs = {} as Record<TimbreSource, HTMLInputElement>;
    const mixDetails = document.createElement("details");
    mixDetails.className = "mix-details";
    const mixSummary = document.createElement("summary");
    mixSummary.textContent = "timbre";
    mixDetails.appendChild(mixSummary);

    const mixRow = document.createElement("label");
    mixRow.className = "source-row mix-values-row";
    const mixRadio = document.createElement("input");
    mixRadio.type = "radio";
    mixRadio.name = `timbre-source-${i}`;
    mixRadio.value = "mix";
    mixRadio.checked = true;
    sourceInputs.mix = mixRadio;
    const mixTextLabel = document.createElement("span");
    mixTextLabel.textContent = "mix";
    const mixText = document.createElement("input");
    mixText.className = "mix-values";
    mixText.value = mixKeys.map((key) => presetMixes.triangle[key]).join(", ");
    mixText.placeholder = "sine, square, triangle, saw";
    mixRow.appendChild(mixRadio);
    mixRow.appendChild(mixTextLabel);
    mixRow.appendChild(mixText);
    mixDetails.appendChild(mixRow);

    const mixInputs = {} as Record<keyof MixWeights, HTMLInputElement>;
    const mixSliderGroup = document.createElement("div");
    mixSliderGroup.className = "mix-sliders";
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
        markTimbreCustom(ref);
        ref.sourceInputs.mix.checked = true;
        setCustomMix(ref, mixFromInputs(ref));
        syncSourceControls(ref);
      });
      label.appendChild(text);
      label.appendChild(input);
      mixSliderGroup.appendChild(label);
      mixInputs[key] = input;
    });
    mixDetails.appendChild(mixSliderGroup);

    mixText.addEventListener("change", () => {
      const ref = partRefs[i];
      markTimbreCustom(ref);
      ref.sourceInputs.mix.checked = true;
      setCustomMix(
        ref,
        parseCustomMixText(mixText.value, mixFromInputs(ref)),
      );
      syncSourceControls(ref);
    });

    const partialsRow = document.createElement("label");
    partialsRow.className = "source-row partials-row";
    const partialsRadio = document.createElement("input");
    partialsRadio.type = "radio";
    partialsRadio.name = `timbre-source-${i}`;
    partialsRadio.value = "partials";
    sourceInputs.partials = partialsRadio;
    const partialsLabel = document.createElement("span");
    partialsLabel.textContent = "partials";
    const partialsText = document.createElement("input");
    partialsText.className = "partials-values";
    partialsText.value = defaultPartials.join(", ");
    partialsText.placeholder = "1, 0.45, 0.3, 0.18";
    partialsRow.appendChild(partialsRadio);
    partialsRow.appendChild(partialsLabel);
    partialsRow.appendChild(partialsText);
    mixDetails.appendChild(partialsRow);

    [mixRadio, partialsRadio].forEach((radio) => {
      radio.addEventListener("change", () => {
        const ref = partRefs[i];
        markTimbreCustom(ref);
        syncSourceControls(ref);
      });
    });

    partialsText.addEventListener("change", () => {
      const ref = partRefs[i];
      markTimbreCustom(ref);
      ref.sourceInputs.partials.checked = true;
      setPartials(ref, parsePartialsText(partialsText.value));
      syncSourceControls(ref);
    });

    const highpassRow = document.createElement("label");
    highpassRow.className = "filter-row";
    const highpassLabel = document.createElement("span");
    highpassLabel.textContent = "highpass";
    const highpassValue = document.createElement("input");
    highpassValue.type = "number";
    highpassValue.min = "0";
    highpassValue.max = "96000";
    highpassValue.step = "1";
    highpassValue.value = "0";
    const highpassReset = document.createElement("button");
    highpassReset.type = "button";
    highpassReset.textContent = "reset";
    highpassRow.appendChild(highpassLabel);
    highpassRow.appendChild(highpassValue);
    highpassRow.appendChild(highpassReset);
    mixDetails.appendChild(highpassRow);

    const lowpassRow = document.createElement("label");
    lowpassRow.className = "filter-row";
    const lowpassLabel = document.createElement("span");
    lowpassLabel.textContent = "lowpass";
    const lowpassValue = document.createElement("input");
    lowpassValue.type = "number";
    lowpassValue.min = "1";
    lowpassValue.max = "96000";
    lowpassValue.step = "1";
    lowpassValue.value = "";
    const lowpassReset = document.createElement("button");
    lowpassReset.type = "button";
    lowpassReset.textContent = "reset";
    lowpassRow.appendChild(lowpassLabel);
    lowpassRow.appendChild(lowpassValue);
    lowpassRow.appendChild(lowpassReset);
    mixDetails.appendChild(lowpassRow);

    highpassReset.addEventListener("click", () => {
      const ref = partRefs[i];
      markTimbreCustom(ref);
      ref.highpassValue.value = "0";
      syncFilterControls(ref);
    });
    lowpassReset.addEventListener("click", () => {
      const ref = partRefs[i];
      markTimbreCustom(ref);
      ref.lowpassValue.value = "";
      syncFilterControls(ref);
    });

    [highpassValue, lowpassValue].forEach((input) => {
      input.addEventListener("input", () => {
        const ref = partRefs[i];
        markTimbreCustom(ref);
        syncFilterControls(ref);
      });
      input.addEventListener("change", () => {
        const ref = partRefs[i];
        markTimbreCustom(ref);
        syncFilterControls(ref);
      });
    });

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

    const advancedToggle = document.createElement("label");
    advancedToggle.className = "advanced-toggle";
    const advancedEnabled = document.createElement("input");
    advancedEnabled.type = "checkbox";
    const advancedText = document.createElement("span");
    advancedText.textContent = "Advanced settings";
    advancedToggle.appendChild(advancedEnabled);
    advancedToggle.appendChild(advancedText);
    mixDetails.appendChild(advancedToggle);

    const advancedPanel = document.createElement("div");
    advancedPanel.className = "advanced-panel";

    const attackValue = document.createElement("input");
    attackValue.type = "number";
    attackValue.min = "0";
    attackValue.max = "5000";
    attackValue.step = "1";
    attackValue.value = String(defaultEnvelope.attack_ms);
    const decayValue = document.createElement("input");
    decayValue.type = "number";
    decayValue.min = "0";
    decayValue.max = "5000";
    decayValue.step = "1";
    decayValue.value = String(defaultEnvelope.decay_ms);
    const sustainValue = document.createElement("input");
    sustainValue.type = "number";
    sustainValue.min = "0";
    sustainValue.max = "1";
    sustainValue.step = "0.01";
    sustainValue.value = String(defaultEnvelope.sustain);
    const releaseValue = document.createElement("input");
    releaseValue.type = "number";
    releaseValue.min = "0";
    releaseValue.max = "5000";
    releaseValue.step = "1";
    releaseValue.value = String(defaultEnvelope.release_ms);
    const vibratoValue = document.createElement("input");
    vibratoValue.type = "number";
    vibratoValue.min = "0";
    vibratoValue.max = "2";
    vibratoValue.step = "0.01";
    vibratoValue.value = "0";
    const noiseValue = document.createElement("input");
    noiseValue.type = "number";
    noiseValue.min = "0";
    noiseValue.max = "1";
    noiseValue.step = "0.01";
    noiseValue.value = "0";

    [
      ["attack/ms", attackValue],
      ["decay/ms", decayValue],
      ["sustain", sustainValue],
      ["release/ms", releaseValue],
      ["vibrato", vibratoValue],
      ["noise", noiseValue],
    ].forEach(([labelText, input]) => {
      const label = document.createElement("label");
      label.className = "advanced-row";
      const span = document.createElement("span");
      span.textContent = labelText as string;
      label.appendChild(span);
      label.appendChild(input as HTMLInputElement);
      advancedPanel.appendChild(label);
    });

    advancedEnabled.addEventListener("change", () => {
      const ref = partRefs[i];
      markTimbreCustom(ref);
      syncAdvancedControls(ref);
    });
    [
      attackValue,
      decayValue,
      sustainValue,
      releaseValue,
      vibratoValue,
      noiseValue,
    ].forEach((input) => {
      input.addEventListener("input", () => markTimbreCustom(partRefs[i]));
      input.addEventListener("change", () => markTimbreCustom(partRefs[i]));
    });
    mixDetails.appendChild(advancedPanel);

    mixDetails.addEventListener("toggle", () => {
      if (mixDetails.open) {
        updateTimbreVisuals(partRefs[i]);
      }
    });
    mixPanel.appendChild(mixDetails);

    timbre.addEventListener("change", () => {
      const ref = partRefs[i];
      const preset = normalizePreset(timbre.value);
      const wasOpen = ref.mixDetails.open;
      if (preset === "custom") {
        setMixDetailsOpen(ref, true);
      } else {
        const state = presetState(preset);
        setTimbreControls(ref, state);
        setMixDetailsOpen(ref, wasOpen);
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
      mixDetails,
      sourceInputs,
      mixInputs,
      mixText,
      partialsText,
      highpassValue,
      lowpassValue,
      advancedEnabled,
      advancedPanel,
      attackValue,
      decayValue,
      sustainValue,
      releaseValue,
      vibratoValue,
      noiseValue,
      timbreCanvas,
      spectrumCanvas,
      score: textarea,
    });
    setTimbreControls(partRefs[i], timbreState("triangle"));
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

copyAiPromptButton.addEventListener("click", () => {
  copyAiPrompt().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
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

renderButton.addEventListener("click", renderWavWithStatus);

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter"
    && (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && !event.repeat
  ) {
    event.preventDefault();
    renderWavWithStatus();
  }
});

refreshSheets().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
