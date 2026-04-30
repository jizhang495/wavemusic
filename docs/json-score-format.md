# JSON Score Format

WaveMusic project files are JSON files stored in `sheets/`. This is the
user-facing score format for the web UI, command line renderer, and future AI
score generation.

Python normalizes JSON before rendering. The C++ engine does not read JSON
directly; it receives an internal `.score` stream generated from the JSON.

## Top-Level Shape

```json
{
  "title": "short chorale",
  "key": "c major",
  "time_signature": "4/4",
  "bpm": 100,
  "sample_rate": 44100,
  "transpose": 0,
  "parts": [
    {
      "name": "soprano",
      "timbre": "reed organ",
      "score": ["4c4 d e f | 8g"]
    }
  ]
}
```

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Used by the UI and default save filenames. |
| `key` | string | Metadata for the score. It does not transpose notes. |
| `time_signature` | string | Metadata for the score. It does not change duration math yet. |
| `bpm` | integer | Clamped to `20..300`. |
| `sample_rate` | integer | Clamped to `8000..96000`; `44100` is the normal default. |
| `transpose` | integer | Semitone offset, clamped to `-48..48`. |
| `parts` | array | Current UI and renderer use four parts. Extra parts are ignored; missing parts are filled as empty. |

## Part Shape

Each part has:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Display name in the UI. |
| `timbre` | string or object | Preset name, custom mix, or custom partials. See [timbre.md](timbre.md). |
| `score` | string or array of strings | The compact note syntax. The UI saves this as an array of lines. |

Recommended part names for four-part music are `soprano`, `alto`, `tenor`,
and `bass`, or practical names like `melody`, `countermelody`, `harmony`, and
`bass`.

## Timbre

Use one of the implemented preset strings:

- `sine`
- `square`
- `triangle`
- `saw`
- `soft organ`
- `bright organ`
- `reed organ`
- `mellow organ`
- `string organ`
- `warm synth organ`

For a four-part organ-style texture, a useful default is:

```json
[
  { "name": "soprano", "timbre": "reed organ" },
  { "name": "alto", "timbre": "bright organ" },
  { "name": "tenor", "timbre": "soft organ" },
  { "name": "bass", "timbre": "mellow organ" }
]
```

Custom mixes are also supported:

```json
{
  "preset": "custom",
  "mix": {
    "sine": 0.4,
    "square": 0.15,
    "triangle": 0.3,
    "saw": 0.15
  }
}
```

For additive synthesis, use `partials` instead of `mix`:

```json
{
  "preset": "custom",
  "partials": [1.0, 0.55, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05],
  "filter": {
    "highpass": 120,
    "lowpass": 4500
  },
  "noise": 0.02,
  "envelope": {
    "attack_ms": 25,
    "decay_ms": 60,
    "sustain": 0.9,
    "release_ms": 120
  },
  "vibrato": {
    "depth": 0
  }
}
```

`mix` and `partials` are mutually exclusive. `filter`, `noise`, `envelope`, and
`vibrato` are optional. Omit `highpass` or `lowpass` when that filter is not
used; do not use fake cutoff values like `lowpass: 0`.

## Score Syntax

Score tokens have this shape:

```text
<length><note><octave>
```

Examples:

```text
4c4
d
e-
2f+
4r
8b-3
```

Rules:

- Notes are `a` through `g`.
- Use `+` for sharp and `-` for flat, for example `f+` or `b-`.
- Use `r` for a rest.
- Use lower-case note names.
- Whitespace separates tokens.
- `|` is an optional visual barline and has no render effect.
- `length` is optional after a previous token has established it.
- `octave` is optional after a previous note has established it.
- The first note-like token in each non-empty part should include both length
  and octave, for example `4c4`.

Lengths are measured in sixteenth-note units:

| Length | Common Meaning |
| ---: | --- |
| `1` | sixteenth note |
| `2` | eighth note |
| `3` | dotted eighth note |
| `4` | quarter note |
| `6` | dotted quarter note |
| `8` | half note |
| `12` | dotted half note |
| `16` | whole note |

The current renderer does not enforce measure length against
`time_signature`. The time signature is metadata for now; score tokens decide
audio duration.

## Barlines And Ties

Barlines are only for readability. The renderer ignores `|`, and WaveMusic does
not currently have a tie symbol.

When a note spans across a measure boundary, combine the tied durations into
one longer note and skip the barline inside that sustained note.

Prefer this:

```text
12c4 4d | 8e f
```

Do not split a sustained note just to show the barline:

```text
8c4 | 4c d | 8e f
```

Also avoid empty or standalone barlines:

```text
| 16r
```

Use a rest or simply omit the visual barline:

```text
16r
```

For generated or imported scores, it is better to preserve the correct audio
duration and omit some barlines than to force every measure boundary into the
text.

## Good JSON For AI Generation

When asking an AI model to generate a WaveMusic score, give it these rules:

- Return valid JSON only, with no Markdown wrapper.
- Include `title`, `key`, `time_signature`, `bpm`, `sample_rate`, `transpose`,
  and `parts`.
- Generate exactly four parts unless asked otherwise.
- Each part must have `name`, `timbre`, and `score`.
- Make `score` an array of short strings, one phrase or a few measures per
  string.
- Use only the note syntax documented above.
- Use lower-case note names.
- Use `+` for sharps and `-` for flats.
- Use `r` for rests.
- Start each non-empty part with a token that has both length and octave.
- Barlines are optional. Omit them when notes span measures.
- Do not invent unsupported fields for dynamics, lyrics, articulations, or
  ornaments unless the code has added support for them.
- For custom timbre, use either `mix` or `partials`, not both.
- If using filters, make `lowpass` higher than `highpass`.

Prompt template:

```text
Create a WaveMusic JSON score. Return valid JSON only.

Schema:
- title: string
- key: string
- time_signature: string
- bpm: integer from 20 to 300
- sample_rate: 44100
- transpose: integer semitones, usually 0
- parts: exactly four objects, each with name, timbre, score

Timbre presets:
sine, square, triangle, saw, soft organ, bright organ, reed organ,
mellow organ, string organ, warm synth organ.

Custom timbre:
- Use either mix {sine, square, triangle, saw} or partials [harmonic amplitudes].
- Optional filter may contain highpass and/or lowpass cutoff Hz.
- Optional envelope is attack_ms, decay_ms, sustain, release_ms.
- Optional vibrato is {depth}; depth is semitones.
- Optional noise is 0..1.

Score syntax:
Tokens are <length><note><octave>. Length is in sixteenth-note units.
Notes are a-g, with + for sharp and - for flat. Rest is r.
Length and octave may be omitted only when inherited from the previous token.
The first token in each part must include length and octave.
Barlines | are optional visual separators. Omit barlines when sustained notes
span measures.

Write a short four-part piece in <style/key/mood>.
```

## Validation Checklist

Before adding a generated score to `sheets/`:

```bash
uv run python -m json.tool sheets/name.json
uv run main.py sheets/name.json --silent --out=/tmp/name.wav
```

The first command checks JSON syntax. The second command checks that the score
normalizes and renders through the current audio engine.
