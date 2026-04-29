# WaveMusic
Writing music audio files using sine, square, triangular and sawtooth wave

## Quick Start

### Prerequisites

- Linux/WSL
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js/npm
- g++
- pybind11 build deps

```bash
sudo apt install python3-dev g++ cmake pybind11-dev
```

### Run The App

```bash
uv sync
uv run setup.py build_ext --inplace
uv run main.py
```
Open http://127.0.0.1:8000.

## Architecture

- C++ audio engine
- Python web/API layer
- TypeScript web frontend

Architecture of audio engine
```



                                  main()
                             ┌──────────────────────────┐
                             │                          │
                             │   Write WAV              │
                             │   header                 │
               sigen.cpp     │                          │
                             │     │                    │
┌──────────────────────────┐ │     ▼                    │
│                          │ │                          │
│ play()       Generate    │ │   Parse        parse()   │
│              signals   ◄─┼─┼── score                  │
│                          │ │                          │
│                 │        │ │     │                    │
│                 ▼        │ │     │                    │
│                          │ │     │                    │
│ filter()     A/R filter  │ │     │                    │
│                          │ │     │                    │
│                 │        │ │     │                    │
│                 ▼        │ │     ▼                    │
│                          │ │                          │
│ lowpass()    Low pass  ──┼─┼─► Write                  │
│              filter      │ │   notes                  │
│                          │ │                          │
└──────────────────────────┘ │     │                    │
                             │     ▼                    │
                             │                          │
                             │   Insert data size       │
                             │   in WAV header          │
                             │                          │
                             │     │                    │
                             │     ▼                    │
                             │                          │
                             │   Playback               │
                             │   with                   │
                             │   system Call            │
                             │                          │
                             └──────────────────────────┘
```

## Development

### C++ Audio Engine

To build and run directly:
```bash
make simple
./simple sheets/<title>.wmusic
```

for debug mode:
```bash
make refresh DEBUG=1
./simple sheets/<title>.wmusic
```

### Python API Layer

Uses FastAPI, pybind.

The *wave* module in the Python standard library provides a convenient interface to the WAV sound format.
References:
<https://docs.python.org/3/library/wave.html>
<https://www.tutorialspoint.com/read-and-write-wav-files-using-python-wave>

To run the python script:
```bash
uv run main.py
```
To use command-line interface:
```bash
uv run main.py cli
```
To generate WAV from score:
```bash
uv run main.py sheets/<title>.wmusic
```

### Web frontend

Run the app:
```bash
uv run main.py
```

Then open `http://127.0.0.1:8000`.

This starts the Python API and serves the built TypeScript frontend from the
same local server. The first run builds the frontend automatically if
`webapp/dist` does not exist.

For frontend development, run the API in one terminal and Vite in another:
```bash
uv run uvicorn scripts.web_api:app --host 127.0.0.1 --port 8000 --reload
cd webapp && npm run dev
```
Then open `http://127.0.0.1:5173`.


## Roadmap

Python TODO list:

 - [ ] time different implementations main_cpp.py, main_list.py, main_np.py and compare with C++
 - [ ] write tests
 - [ ] add docs
 - [x] use C++ code as a backend
 - [x] add waveforms.py to store functions for each waveform
 - [ ] add Entry with up/down for transpose
 - [ ] use () to pass frequecies or chords
 - [ ] add bpm and sample rate selection
 - [ ] use numpy for faster performance
 - [ ] the functions can be added to produce complex timber and polyphony
 - [ ] add loudness: ff, f, fp, p, pp
 - [ ] add dynamics: cresc, dim
 - [ ] add timber
 - [x] GUI (maybe try webapp next? Electrojs?)
 - [ ] add polyphony (fugue)
 - [ ] live waveform plotting matplotlib like oscilloscope
 - [x] playsound on the go with Enter (plays the line just completed)
 - [ ] threading, running playsound at background (already okay with vlc open)

C++ TODO list:

 - [x] consistent note length
 - [ ] functional REPL
 - [x] triangle wave generation
 - [x] polyphony doesn't sound out of tune anymore?
 - [x] saw and square waves sounds bad, add LPF to soften it
