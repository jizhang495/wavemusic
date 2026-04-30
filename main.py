#!/usr/bin/env python3
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from src.simple import main_pybind
from scripts.music import Music
from scripts.project import (
    DEFAULT_BPM,
    DEFAULT_SAMPLE_RATE,
    compose_score,
    load_project,
)


BASE_DIR = Path(__file__).resolve().parent
WEBAPP_DIR = BASE_DIR / "webapp"
WEBAPP_DIST_INDEX = WEBAPP_DIR / "dist" / "index.html"


def _frontend_source_files():
    source_files = [
        WEBAPP_DIR / "index.html",
        WEBAPP_DIR / "package.json",
        WEBAPP_DIR / "package-lock.json",
        WEBAPP_DIR / "vite.config.ts",
    ]
    source_dir = WEBAPP_DIR / "src"
    if source_dir.exists():
        source_files.extend(path for path in source_dir.rglob("*") if path.is_file())
    return source_files


def _frontend_needs_build():
    if not WEBAPP_DIST_INDEX.exists():
        return True
    dist_mtime = WEBAPP_DIST_INDEX.stat().st_mtime
    return any(
        path.exists() and path.stat().st_mtime > dist_mtime
        for path in _frontend_source_files()
    )


def _run_web():
    if _frontend_needs_build():
        if shutil.which("npm") is None:
            raise RuntimeError(
                "npm is required to build the web frontend. "
                "Install Node.js, then run this again."
            )
        if not (WEBAPP_DIR / "node_modules").exists():
            subprocess.run(["npm", "install"], cwd=WEBAPP_DIR, check=True)
        subprocess.run(["npm", "run", "build"], cwd=WEBAPP_DIR, check=True)

    import uvicorn
    print("WaveMusic web app: http://127.0.0.1:8000")
    uvicorn.run("scripts.web_api:app", host="127.0.0.1", port=8000, reload=False)


def main(*args):
    if not args:
        _run_web()
        return

    # Command line interface for generating music
    print("Hello from wavemusic!")
    if args[0] == "cli":
        pass
    else:
        should_play = "--no-play" not in args and "--silent" not in args
        output_filename = next(
            (arg.removeprefix("--out=") for arg in args if arg.startswith("--out=")),
            None,
        )
        try:
            project_file = Path(
                args[0].replace(" ", "").replace("\n", "").replace("\r", "")
            )
            project = load_project(project_file)
            score = compose_score(project["parts"])
            bpm = project["bpm"]
            sample_rate = project["sample_rate"]
            print(f"Score loaded from {project_file}")
        except FileNotFoundError:
            print(f"File {project_file} not found. Using default score.")
            score = "wave 0 0 1 0:\n2c4 2d 2e 2f | 4g 4r"
            bpm = DEFAULT_BPM
            sample_rate = DEFAULT_SAMPLE_RATE
        except ValueError as e:
            print(f"Error loading score: {e}")
            return
        print(score)
        try:
            with tempfile.TemporaryDirectory(prefix="wavemusic-") as score_dir:
                score_path = Path(score_dir) / "main.score"
                score_path.write_text(score + "\n", encoding="utf-8")
                engine_args = [
                    "1",
                    str(score_path),
                    f"--sample-rate={sample_rate}",
                    f"--bpm={bpm}",
                ]
                if not should_play:
                    engine_args.append("--no-play")
                if output_filename:
                    engine_args.append(f"--out={output_filename}")
                main_pybind(engine_args)
            print("Rendered score." if not should_play else "Playing score...")
            return
        except Exception as e:
            print(f"Error playing score: {e}")
            return

    score = input("Enter your score (enter :q to finish entry): ")
    if score == ":q":
        print("No score entered. Exiting...")
        return
    Music(score).playscore(filename="temp.wav", sample_rate=44100, bpm=100)
    input_score = ""
    while input_score != ":q":
        score += input_score + " "
        input_score = input()
        Music(input_score).playscore(filename="temp.wav", sample_rate=44100, bpm=100)
    score = score.replace("|", "")  # remove the bar lines
    if score is None or score == "":
        print("No score entered. Exiting...")
        return
    score_file = "sheets/temp.score"
    with open(score_file, "w") as f:
        f.write(score)
    print("Score saved to sheets/temp.score")
    try:
        main_pybind(["1", score_file]) # why need to pass another argument?
        # Music(score).playscore(filename="m.wav", sample_rate=44100, bpm=100)
        print("Playing score...")
    except Exception as e:
        print(f"Error playing score: {e}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        main(*sys.argv[1:])
    else:
        main()
