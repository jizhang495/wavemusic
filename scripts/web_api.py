from __future__ import annotations

from contextlib import suppress
import os
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path
import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from scripts.music import Music
from scripts.project import (
    DEFAULT_BPM,
    DEFAULT_SAMPLE_RATE,
    DEFAULT_WAVEFORM,
    PART_COUNT,
    clamp_int,
    compose_score,
    load_project,
    normalize_waveform,
    part_score_text,
)
from src.simple import main_pybind

BASE_DIR = Path(__file__).resolve().parent.parent
SHEETS_DIR = BASE_DIR / "sheets"
GENERATED_DIR = Path(
    os.environ.get(
        "WAVEMUSIC_GENERATED_DIR",
        str(Path(tempfile.gettempdir()) / "wavemusic"),
    )
)
DIST_DIR = BASE_DIR / "webapp" / "dist"
GENERATED_TTL_SECONDS = int(os.environ.get("WAVEMUSIC_GENERATED_TTL_SECONDS", "3600"))
GENERATED_CLEANUP_INTERVAL_SECONDS = int(
    os.environ.get("WAVEMUSIC_GENERATED_CLEANUP_INTERVAL_SECONDS", "300")
)

SHEETS_DIR.mkdir(exist_ok=True)
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

MIN_WAV_BYTES = 44
GENERATED_SUFFIXES = {".wav", ".score"}
_last_generated_cleanup = 0.0
_render_lock = threading.Lock()

app = FastAPI(title="WaveMusic API", version="0.1.0")


def _cors_origins() -> list[str]:
    raw_origins = os.environ.get("WAVEMUSIC_CORS_ORIGINS", "")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["*"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
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
    if not safe.lower().endswith(".json"):
        safe = f"{safe}.json"
    return safe


def _load_sheet_file(filename: str) -> Path:
    safe_name = Path((filename or "").strip()).name
    if not safe_name:
        safe_name = f"{uuid.uuid4().hex}.json"
    if "/" in safe_name or "\\" in safe_name:
        raise HTTPException(status_code=400, detail="Invalid score filename.")
    if not safe_name.lower().endswith(".json"):
        safe_name = f"{safe_name}.json"
    return SHEETS_DIR / safe_name


def _audio_file(filename: str) -> Path:
    raw_name = (filename or "").strip()
    safe_name = Path(raw_name).name
    if not safe_name or safe_name != raw_name or not safe_name.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Invalid audio filename.")
    return GENERATED_DIR / safe_name


def _cleanup_generated_files() -> None:
    global _last_generated_cleanup

    now = time.time()
    if GENERATED_TTL_SECONDS <= 0:
        return
    if now - _last_generated_cleanup < GENERATED_CLEANUP_INTERVAL_SECONDS:
        return

    _last_generated_cleanup = now
    cutoff = now - GENERATED_TTL_SECONDS
    for path in GENERATED_DIR.iterdir():
        if not path.is_file() or path.suffix.lower() not in GENERATED_SUFFIXES:
            continue
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
        except OSError:
            pass


def _temp_render_paths() -> tuple[Path, Path]:
    stem = f"render-{int(time.time())}-{uuid.uuid4().hex}"
    return GENERATED_DIR / f"{stem}.score", GENERATED_DIR / f"{stem}.wav"


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
    sample_rate = clamp_int(
        sample_rate,
        default=DEFAULT_SAMPLE_RATE,
        minimum=8000,
        maximum=96000,
    )
    bpm = clamp_int(bpm, default=DEFAULT_BPM, minimum=20, maximum=300)

    if not score_text.strip():
        raise HTTPException(status_code=400, detail="Score is empty.")

    _cleanup_generated_files()
    score_path, audio_path = _temp_render_paths()

    with _render_lock:
        score_path.write_text(score_text + "\n", encoding="utf-8")

        if use_cpp:
            render_started_at = time.time()
            with suppress(Exception):
                main_pybind(
                    [
                        "1",
                        str(score_path),
                        "--no-play",
                        f"--out={audio_path}",
                        f"--sample-rate={sample_rate}",
                        f"--bpm={bpm}",
                    ]
                )

            if not _wav_has_audio(audio_path):
                fallback_candidates = [GENERATED_DIR / "m.wav", BASE_DIR / "m.wav"]
                for candidate in fallback_candidates:
                    if (
                        _wav_has_audio(candidate)
                        and candidate.stat().st_mtime >= render_started_at
                    ):
                        shutil.copyfile(candidate, audio_path)
                        break

            if not _wav_has_audio(audio_path):
                Music(score_text).write_wav(
                    filename=str(audio_path),
                    sample_rate=sample_rate,
                    bpm=bpm,
                )
        else:
            Music(score_text).write_wav(
                filename=str(audio_path),
                sample_rate=sample_rate,
                bpm=bpm,
            )

    if not _wav_has_audio(audio_path):
        raise HTTPException(status_code=500, detail="Failed to generate WAV output.")

    return audio_path


class Part(BaseModel):
    name: str = Field(default="")
    waveform: str = Field(default=DEFAULT_WAVEFORM)
    score: str = Field(default="")


def _default_parts() -> list[Part]:
    return [Part(name=f"part {index + 1}") for index in range(PART_COUNT)]


class RenderRequest(BaseModel):
    parts: list[Part] = Field(default_factory=_default_parts)
    filename: str = Field(default="m.wav")
    sample_rate: int = Field(default=DEFAULT_SAMPLE_RATE)
    bpm: int = Field(default=DEFAULT_BPM)
    use_cpp: bool = Field(default=True)


class PreviewRequest(BaseModel):
    waveform: str = Field(default=DEFAULT_WAVEFORM)
    line: str = Field(default="")
    sample_rate: int = Field(default=DEFAULT_SAMPLE_RATE)
    bpm: int = Field(default=DEFAULT_BPM)
    use_cpp: bool = Field(default=True)


class RenderResponse(BaseModel):
    filename: str
    audio_url: str
    score: str
    use_cpp: bool


class SaveRequest(BaseModel):
    filename: str = Field(default="score.json")
    bpm: int = Field(default=DEFAULT_BPM)
    sample_rate: int = Field(default=DEFAULT_SAMPLE_RATE)
    parts: list[Part] = Field(default_factory=_default_parts)


class ScoreResponse(BaseModel):
    filename: str
    bpm: int
    sample_rate: int
    parts: list[Part]


@app.get("/api/health")
def get_health():
    return {"status": "ok"}


@app.get("/api/sheets")
def list_sheets():
    files = sorted([path.name for path in SHEETS_DIR.glob("*.json")])
    return {"files": files}


@app.get("/api/sheets/{filename}", response_model=ScoreResponse)
def load_sheet(filename: str):
    path = _load_sheet_file(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Score file not found.")
    try:
        project = load_project(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ScoreResponse(filename=path.name, **project)


@app.post("/api/sheets", response_model=ScoreResponse)
def save_sheet(payload: SaveRequest):
    raise HTTPException(
        status_code=405,
        detail=(
            "Server-side score saving is disabled. "
            "Use the browser Save score button to save locally."
        ),
    )


@app.post("/api/render", response_model=RenderResponse)
def render_score(payload: RenderRequest):
    score_text = compose_score(payload.parts)
    if not any(part_score_text(part) for part in payload.parts):
        raise HTTPException(status_code=400, detail="No parts to render.")

    audio_path = _render_score_to_file(
        score_text,
        filename=payload.filename,
        sample_rate=payload.sample_rate,
        bpm=payload.bpm,
        use_cpp=payload.use_cpp,
    )

    return RenderResponse(
        filename=_safe_wav_name(payload.filename, fallback="m.wav"),
        audio_url=f"/api/audio/{audio_path.name}",
        score=score_text,
        use_cpp=payload.use_cpp,
    )


@app.post("/api/preview-line", response_model=RenderResponse)
def preview_line(payload: PreviewRequest):
    line = payload.line.strip()
    if not line:
        raise HTTPException(status_code=400, detail="Line is empty.")
    part = Part(
        name="preview",
        waveform=normalize_waveform(payload.waveform),
        score=line,
    )
    score_text = compose_score([part])
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
