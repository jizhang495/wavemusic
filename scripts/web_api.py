from __future__ import annotations

import shutil
import time
import uuid
from pathlib import Path
from typing import List, Optional
import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from scripts.music import Music
from src.simple import main_pybind

BASE_DIR = Path(__file__).resolve().parent.parent
SHEETS_DIR = BASE_DIR / "sheets"
GENERATED_DIR = BASE_DIR / "build" / "webapi"
DIST_DIR = BASE_DIR / "webapp" / "dist"

SHEETS_DIR.mkdir(exist_ok=True)
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_WAVEFORMS = ("triangle", "sine", "square", "sawtooth")
DEFAULT_WAVEFORM = "triangle"
PART_COUNT = 4
SCORE_SPLIT_PATTERN = re.compile(r"(?=\b(?:triangle|sine|square|saw|sawtooth):)", re.IGNORECASE)
MIN_WAV_BYTES = 44

app = FastAPI(title="WaveMusic API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _safe_part_text(value: str, *, fallback: str) -> str:
    safe = Path((value or fallback).strip()).name
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", safe)
    if not safe:
        safe = fallback
    return safe


def _safe_wav_name(value: str, fallback: str) -> str:
    safe = _safe_part_text(value, fallback=fallback)
    if not safe.lower().endswith(".wav"):
        safe = f"{safe}.wav"
    return safe


def _safe_sheet_name(value: str, fallback: str) -> str:
    safe = _safe_part_text(value, fallback=fallback)
    if not safe.lower().endswith(".wmusic"):
        safe = f"{safe}.wmusic"
    return safe


def _load_sheet_file(filename: str) -> Path:
    safe_name = Path((filename or "").strip()).name
    if not safe_name:
        safe_name = f"{uuid.uuid4().hex}.wmusic"
    if "/" in safe_name or "\\" in safe_name:
        raise HTTPException(status_code=400, detail="Invalid score filename.")
    if not safe_name.lower().endswith(".wmusic"):
        safe_name = f"{safe_name}.wmusic"
    return SHEETS_DIR / safe_name


def _normalize_waveform(waveform: str) -> str:
    normalized = (waveform or DEFAULT_WAVEFORM).strip().lower()
    if normalized == "saw":
        return "sawtooth"
    if normalized not in ALLOWED_WAVEFORMS:
        return DEFAULT_WAVEFORM
    return normalized


def _compose_score(parts: List["Part"]) -> str:
    normalized_parts = [Part(waveform=part.waveform, score=part.score) for part in (parts or [])[:PART_COUNT]]
    while len(normalized_parts) < PART_COUNT:
        normalized_parts.append(Part())

    blocks = []
    for part in normalized_parts:
        waveform = _normalize_waveform(part.waveform)
        score = part.score.strip()
        if score:
            blocks.append(f"{waveform}: {score}")
        else:
            blocks.append(f"{waveform}:")
    return "\n".join(blocks)


def _split_parts(score_text: str) -> List["Part"]:
    blocks = [block.strip() for block in SCORE_SPLIT_PATTERN.split(score_text) if block.strip()]
    if not blocks:
        return [Part() for _ in range(PART_COUNT)]

    result = []
    for index in range(PART_COUNT):
        block = blocks[index] if index < len(blocks) else ""
        if ":" in block:
            waveform, score = block.split(":", 1)
            result.append(Part(waveform=_normalize_waveform(waveform), score=score.strip()))
        else:
            result.append(Part(score=block))
    return result


def _score_file(filename: str) -> Path:
    return SHEETS_DIR / _safe_sheet_name(filename, fallback=f"{uuid.uuid4().hex}.wmusic")


def _audio_file(filename: str) -> Path:
    return GENERATED_DIR / _safe_wav_name(filename, fallback=f"{uuid.uuid4().hex}.wav")


def _wav_has_audio(path: Path) -> bool:
    return path.exists() and path.stat().st_size > MIN_WAV_BYTES


def _render_score_to_file(
    score_text: str,
    filename: str,
    *,
    sample_rate: int = 44100,
    bpm: int = 100,
    use_cpp: bool = True,
) -> Path:
    if not score_text.strip():
        raise HTTPException(status_code=400, detail="Score is empty.")

    audio_path = _audio_file(filename)
    score_path = GENERATED_DIR / f"{audio_path.stem}.wmusic"
    score_path.write_text(score_text + "\n", encoding="utf-8")

    if audio_path.exists():
        audio_path.unlink()

    if use_cpp:
        render_started_at = time.time()
        try:
            main_pybind(["1", str(score_path), "--no-play", f"--out={audio_path}"])
        except Exception:
            pass

        if not _wav_has_audio(audio_path):
            fallback_candidates = [GENERATED_DIR / "m.wav", BASE_DIR / "m.wav"]
            for candidate in fallback_candidates:
                if _wav_has_audio(candidate) and candidate.stat().st_mtime >= render_started_at:
                    shutil.copyfile(candidate, audio_path)
                    break

        if not _wav_has_audio(audio_path):
            Music(score_text).write_wav(filename=str(audio_path), sample_rate=sample_rate, bpm=bpm)
    else:
        Music(score_text).write_wav(filename=str(audio_path), sample_rate=sample_rate, bpm=bpm)

    if not _wav_has_audio(audio_path):
        raise HTTPException(status_code=500, detail="Failed to generate WAV output.")

    return audio_path


class Part(BaseModel):
    waveform: str = Field(default=DEFAULT_WAVEFORM)
    score: str = Field(default="")


class RenderRequest(BaseModel):
    parts: List[Part] = Field(default_factory=lambda: [Part() for _ in range(PART_COUNT)])
    filename: str = Field(default="m.wav")
    sample_rate: int = Field(default=44100)
    bpm: int = Field(default=100)
    use_cpp: bool = Field(default=True)


class PreviewRequest(BaseModel):
    waveform: str = Field(default=DEFAULT_WAVEFORM)
    line: str = Field(default="")
    sample_rate: int = Field(default=44100)
    bpm: int = Field(default=100)
    use_cpp: bool = Field(default=True)


class RenderResponse(BaseModel):
    filename: str
    audio_url: str
    score: str
    use_cpp: bool


class SaveRequest(BaseModel):
    filename: str = Field(default="score.wmusic")
    score: str


class ScoreResponse(BaseModel):
    filename: str
    score: str
    parts: List[Part]


@app.get("/api/health")
def get_health():
    return {"status": "ok"}


@app.get("/api/sheets")
def list_sheets():
    files = sorted([path.name for path in SHEETS_DIR.glob("*.wmusic")])
    return {"files": files}


@app.get("/api/sheets/{filename}", response_model=ScoreResponse)
def load_sheet(filename: str):
    path = _load_sheet_file(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Score file not found.")
    score = path.read_text(encoding="utf-8")
    return ScoreResponse(filename=path.name, score=score, parts=_split_parts(score))


@app.post("/api/sheets", response_model=ScoreResponse)
def save_sheet(payload: SaveRequest):
    path = _score_file(payload.filename)
    path.write_text(payload.score, encoding="utf-8")
    return ScoreResponse(filename=path.name, score=payload.score, parts=_split_parts(payload.score))


@app.post("/api/render", response_model=RenderResponse)
def render_score(payload: RenderRequest):
    score_text = _compose_score(payload.parts)
    if not score_text.strip():
        raise HTTPException(status_code=400, detail="No parts to render.")

    audio_path = _render_score_to_file(
        score_text,
        filename=payload.filename,
        sample_rate=payload.sample_rate,
        bpm=payload.bpm,
        use_cpp=payload.use_cpp,
    )

    return RenderResponse(
        filename=audio_path.name,
        audio_url=f"/api/audio/{audio_path.name}",
        score=score_text,
        use_cpp=payload.use_cpp,
    )


@app.post("/api/preview-line", response_model=RenderResponse)
def preview_line(payload: PreviewRequest):
    line = payload.line.strip()
    if not line:
        raise HTTPException(status_code=400, detail="Line is empty.")
    part = Part(waveform=payload.waveform, score=line)
    score_text = _compose_score([part])
    audio_path = _render_score_to_file(
        score_text,
        filename=f"preview-{uuid.uuid4().hex}.wav",
        sample_rate=payload.sample_rate,
        bpm=payload.bpm,
        use_cpp=payload.use_cpp,
    )
    return RenderResponse(
        filename=audio_path.name,
        audio_url=f"/api/audio/{audio_path.name}",
        score=score_text,
        use_cpp=payload.use_cpp,
    )


@app.get("/api/audio/{filename}")
def download_audio(filename: str):
    path = _audio_file(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found.")
    return FileResponse(path, media_type="audio/wav", filename=path.name)


@app.get("/")
def root():
    if (DIST_DIR / "index.html").exists():
        return FileResponse(DIST_DIR / "index.html")
    return {"status": "ok", "message": "WaveMusic API is running."}


if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
