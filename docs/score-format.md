# Internal `.score` Format

`.score` is the internal render format consumed by the C++ engine. It is not the
user-facing project format. User, UI, and AI-generated music should be stored as
JSON, then normalized by Python before rendering. See
[json-score-format.md](json-score-format.md) for the user-facing JSON schema and
AI generation guidance.

The goal is to keep C++ concise and fast. Python should handle bad user input,
missing fields, defaults, JSON validation, and project metadata. C++ should
receive a strict `.score` stream that is already safe to parse.

## Structure

A `.score` file is a sequence of timbre sections:

```text
mix 0 1 0 0:
2c4 g e f | 4g 4r

partials 1 0.55 0.35 0.25 highpass 120 lowpass 4500:
2c3 g c4 g
```

Each section starts with one timbre header. Current source types are `mix` and
`partials`.

### Mix

```text
mix <sine> <square> <triangle> <saw>:
```

The four values are weights from `0` to `1`. The C++ engine normalizes them, so
`mix 1 1 1 1:` changes tone without making the output four times louder.

### Partials

```text
partials <harmonic-1> <harmonic-2> ...:
```

Each value is the amplitude of one harmonic partial from `0` to `1`. The first
value is the fundamental, the second is harmonic 2, and so on. The C++ engine
normalizes partial weights by their sum.

### Optional Timbre Fields

Both `mix` and `partials` headers may include optional fields before the final
colon:

```text
mix 0.25 0.05 0.3 0.4 highpass 120 lowpass 4500 noise 0.02 envelope 25 60 0.9 120 vibrato 0.1:
```

Supported fields:

| Field | Values | Meaning |
| --- | --- | --- |
| `highpass` | cutoff Hz | First-order highpass filter. Omit for no highpass. |
| `lowpass` | cutoff Hz | First-order lowpass filter. Omit for no lowpass. |
| `noise` | `0..1` | Adds deterministic noise texture. |
| `envelope` | `attack_ms decay_ms sustain release_ms` | ADSR-like note envelope. |
| `vibrato` | semitones | Fixed-rate vibrato depth. `0` means no vibrato. |

`lowpass` should be higher than `highpass` when both are present. Neutral
settings should usually be omitted rather than written as sentinel values.

Named legacy headers are still accepted by the C++ parser for convenience:

```text
sine:
square:
triangle:
saw:
```

Python should emit `mix ...:` or `partials ...:` headers.

## Notes

Notes use this shape:

```text
<length><note><octave>
```

Examples:

```text
2c4
g
e-
4r
2b-3
```

Rules:

- `length` is optional after it has been established.
- `octave` is optional after it has been established.
- `note` is `a` through `g`, optionally followed by `+` or `-`.
- `r` is a rest.
- `|` is allowed as a visual barline and has no render effect. It may be
  omitted when a sustained note spans a measure boundary.
- Whitespace separates tokens.
- Python should emit lower-case notes and `mix ...:` or `partials ...:` headers.

For deterministic rendering, Python should ensure the first note-like token in
each non-empty section includes both length and octave, for example `2c4` or
`4r4`. The current C++ parser inherits omitted length and octave from previous
tokens in that section.

## Python Responsibilities

Before writing `.score`, Python should:

- Normalize timbre presets and custom mixes to either `mix <sine> <square>
  <triangle> <saw>:` or `partials ...:` headers. Presets may also expand to
  optional filter, envelope, noise, or vibrato tokens.
- Normalize custom partials to strict `partials ...:` headers.
- Add optional `highpass`, `lowpass`, `noise`, `envelope`, and `vibrato`
  fields when the JSON timbre asks for them directly or through a preset.
- Drop or reject unsupported score tokens.
- Ensure every rendered part starts with a valid timbre header.
- Ensure the first note/rest in a non-empty part establishes length and octave.
- Preserve user line breaks where useful, but rely on whitespace as the parser
  boundary.
- Pass render metadata such as `bpm` and `sample_rate` through engine arguments,
  not through `.score`.
- Keep non-render metadata such as `title`, `key`, and `time_signature` in JSON.

If future features affect audio, such as volume, pan, or dynamics, the
JSON-to-`.score` conversion should add an explicit render representation for
those features before C++ is expected to handle them.
