from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

MIX_ORDER = ("sine", "square", "triangle", "saw")
TIMBRE_PRESETS = {
    "sine": {"sine": 1.0, "square": 0.0, "triangle": 0.0, "saw": 0.0},
    "square": {"sine": 0.0, "square": 1.0, "triangle": 0.0, "saw": 0.0},
    "triangle": {"sine": 0.0, "square": 0.0, "triangle": 1.0, "saw": 0.0},
    "saw": {"sine": 0.0, "square": 0.0, "triangle": 0.0, "saw": 1.0},
    "soft organ": {"sine": 0.55, "square": 0.10, "triangle": 0.35, "saw": 0.0},
    "bright organ": {"sine": 0.30, "square": 0.20, "triangle": 0.20, "saw": 0.30},
    "reed organ": {"sine": 0.20, "square": 0.45, "triangle": 0.10, "saw": 0.25},
    "mellow organ": {"sine": 0.70, "square": 0.05, "triangle": 0.25, "saw": 0.0},
    "string organ": {"sine": 0.25, "square": 0.05, "triangle": 0.30, "saw": 0.40},
    "warm synth organ": {
        "sine": 0.40,
        "square": 0.15,
        "triangle": 0.30,
        "saw": 0.15,
    },
}
DEFAULT_TIMBRE = "triangle"
DEFAULT_BPM = 100
DEFAULT_SAMPLE_RATE = 44100
DEFAULT_TRANSPOSE = 0
MIN_TRANSPOSE = -48
MAX_TRANSPOSE = 48
DEFAULT_TITLE = "untitled"
DEFAULT_KEY = "c major"
DEFAULT_TIME_SIGNATURE = "4/4"
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


def clamp_float(value: Any, *, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default

    if not math.isfinite(parsed):
        return default
    if parsed < minimum:
        return minimum
    if parsed > maximum:
        return maximum
    return parsed


def normalize_timbre_preset(value: Any) -> str:
    preset = str(value or DEFAULT_TIMBRE).strip().lower().replace("_", " ")
    if preset == "sawtooth":
        return "saw"
    if preset in TIMBRE_PRESETS or preset == "custom":
        return preset
    return DEFAULT_TIMBRE


def normalize_mix(
    value: Any,
    *,
    fallback: Mapping[str, float] | None = None,
) -> dict[str, float]:
    fallback = fallback or TIMBRE_PRESETS[DEFAULT_TIMBRE]
    if isinstance(value, Mapping):
        return {
            name: clamp_float(
                value.get(name),
                default=fallback.get(name, 0.0),
                minimum=0.0,
                maximum=1.0,
            )
            for name in MIX_ORDER
        }
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return {
            name: clamp_float(
                value[index] if index < len(value) else None,
                default=fallback.get(name, 0.0),
                minimum=0.0,
                maximum=1.0,
            )
            for index, name in enumerate(MIX_ORDER)
        }
    return dict(fallback)


def normalize_timbre(timbre: Any) -> str | dict[str, Any]:
    if isinstance(timbre, Mapping):
        preset = normalize_timbre_preset(timbre.get("preset"))
        if preset == "custom":
            return {
                "preset": "custom",
                "mix": normalize_mix(
                    timbre.get("mix"),
                    fallback=TIMBRE_PRESETS["warm synth organ"],
                ),
            }
        return preset
    return normalize_timbre_preset(timbre)


def timbre_mix(timbre: Any) -> dict[str, float]:
    normalized = normalize_timbre(timbre)
    if isinstance(normalized, Mapping):
        return normalize_mix(normalized.get("mix"))
    return dict(TIMBRE_PRESETS.get(normalized, TIMBRE_PRESETS[DEFAULT_TIMBRE]))


def mix_header(timbre: Any) -> str:
    mix = timbre_mix(timbre)
    values = " ".join(f"{mix[name]:g}" for name in MIX_ORDER)
    return f"mix {values}:"


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


def normalize_project(
    raw_project: Any,
    *,
    fallback_title: str = DEFAULT_TITLE,
) -> dict[str, Any]:
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
                "timbre": normalize_timbre(raw_part.get("timbre")),
                "score": score_text(raw_part.get("score", "")),
            }
        )

    title = str(raw_project.get("title") or fallback_title).strip() or DEFAULT_TITLE
    key = str(raw_project.get("key") or DEFAULT_KEY).strip() or DEFAULT_KEY
    time_signature = (
        str(raw_project.get("time_signature") or DEFAULT_TIME_SIGNATURE).strip()
        or DEFAULT_TIME_SIGNATURE
    )

    return {
        "title": title,
        "key": key,
        "time_signature": time_signature,
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
        "transpose": clamp_int(
            raw_project.get("transpose"),
            default=DEFAULT_TRANSPOSE,
            minimum=MIN_TRANSPOSE,
            maximum=MAX_TRANSPOSE,
        ),
        "parts": parts,
    }


def load_project(path: Path) -> dict[str, Any]:
    try:
        raw_project = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid music JSON: {exc}") from exc
    return normalize_project(raw_project, fallback_title=path.stem)


def compose_score(parts: Sequence[Any]) -> str:
    normalized_parts = list(parts or [])[:PART_COUNT]
    while len(normalized_parts) < PART_COUNT:
        normalized_parts.append({})

    blocks = []
    for part in normalized_parts:
        mix = mix_header(_field(part, "timbre"))
        part_text = part_score_text(part)
        if part_text:
            blocks.append(f"{mix}\n{part_text}")
        else:
            blocks.append(mix)
    return "\n\n".join(blocks)
