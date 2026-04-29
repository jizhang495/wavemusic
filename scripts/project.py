from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

ALLOWED_WAVEFORMS = ("triangle", "sine", "square", "sawtooth")
DEFAULT_WAVEFORM = "triangle"
DEFAULT_BPM = 100
DEFAULT_SAMPLE_RATE = 44100
PART_COUNT = 4


def clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    if parsed < minimum:
        return minimum
    if parsed > maximum:
        return maximum
    return parsed


def normalize_waveform(waveform: Any) -> str:
    normalized = str(waveform or DEFAULT_WAVEFORM).strip().lower()
    if normalized == "saw":
        return "sawtooth"
    if normalized not in ALLOWED_WAVEFORMS:
        return DEFAULT_WAVEFORM
    return normalized


def score_lines(score: Any) -> list[str]:
    if score is None:
        return []
    if isinstance(score, str):
        return score.splitlines()
    if isinstance(score, Sequence) and not isinstance(score, bytes | bytearray):
        return [str(line).rstrip() for line in score]
    return [str(score)]


def score_text(score: Any) -> str:
    return "\n".join(score_lines(score)).strip()


def _field(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        return value.get(key, default)
    return getattr(value, key, default)


def part_score_text(part: Any) -> str:
    return score_text(_field(part, "score", ""))


def normalize_project(raw_project: Any) -> dict[str, Any]:
    if not isinstance(raw_project, Mapping):
        raise ValueError("Music JSON must be an object.")

    raw_parts = raw_project.get("parts", [])
    if not isinstance(raw_parts, Sequence) or isinstance(
        raw_parts,
        str | bytes | bytearray,
    ):
        raw_parts = []

    parts = []
    for index in range(PART_COUNT):
        raw_part = raw_parts[index] if index < len(raw_parts) else {}
        if not isinstance(raw_part, Mapping):
            raw_part = {}

        default_name = f"part {index + 1}"
        name = str(raw_part.get("name") or default_name).strip() or default_name
        parts.append(
            {
                "name": name,
                "waveform": normalize_waveform(raw_part.get("waveform")),
                "score": score_text(raw_part.get("score", "")),
            }
        )

    return {
        "bpm": clamp_int(
            raw_project.get("bpm"),
            default=DEFAULT_BPM,
            minimum=20,
            maximum=300,
        ),
        "sample_rate": clamp_int(
            raw_project.get("sample_rate"),
            default=DEFAULT_SAMPLE_RATE,
            minimum=8000,
            maximum=96000,
        ),
        "parts": parts,
    }


def load_project(path: Path) -> dict[str, Any]:
    try:
        raw_project = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid music JSON: {exc}") from exc
    return normalize_project(raw_project)


def compose_score(parts: Sequence[Any]) -> str:
    normalized_parts = list(parts or [])[:PART_COUNT]
    while len(normalized_parts) < PART_COUNT:
        normalized_parts.append({})

    blocks = []
    for part in normalized_parts:
        waveform = normalize_waveform(_field(part, "waveform"))
        part_text = part_score_text(part)
        if part_text:
            blocks.append(f"{waveform}:\n{part_text}")
        else:
            blocks.append(f"{waveform}:")
    return "\n\n".join(blocks)
