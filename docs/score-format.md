# Internal `.score` Format

`.score` is the internal render format consumed by the C++ engine. It is not the
user-facing project format. User, UI, and AI-generated music should be stored as
JSON, then normalized by Python before rendering.

The goal is to keep C++ concise and fast. Python should handle bad user input,
missing fields, defaults, JSON validation, and project metadata. C++ should
receive a strict `.score` stream that is already safe to parse.

## Structure

A `.score` file is a sequence of waveform sections:

```text
wave 0 1 0 0:
2c4 g e f | 4g 4r

wave 0 0 1 0:
2c3 g c4 g
```

Each section starts with one waveform header:

```text
wave <sine> <square> <triangle> <saw>:
```

The four values are weights from `0` to `1`. The C++ engine normalizes them, so
`wave 1 1 1 1:` changes tone without making the output four times louder.

Named legacy headers are still accepted by the C++ parser for convenience:

```text
sine:
square:
triangle:
saw:
```

Python should emit `wave ...:` headers.

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
- `|` is allowed as a visual barline and has no render effect.
- Whitespace separates tokens.
- Python should emit lower-case notes and `wave ...:` headers.

For deterministic rendering, Python should ensure the first note-like token in
each non-empty section includes both length and octave, for example `2c4` or
`4r4`. The current C++ parser inherits omitted length and octave from previous
tokens in that section.

## Python Responsibilities

Before writing `.score`, Python should:

- Normalize waveform presets and custom mixes to `wave <sine> <square>
  <triangle> <saw>:` headers.
- Drop or reject unsupported score tokens.
- Ensure every rendered part starts with a valid waveform header.
- Ensure the first note/rest in a non-empty part establishes length and octave.
- Preserve user line breaks where useful, but rely on whitespace as the parser
  boundary.
- Pass render metadata such as `bpm` and `sample_rate` through engine arguments,
  not through `.score`.
- Keep non-render metadata such as `title`, `key`, and `time_signature` in JSON.

If future features affect audio, such as volume, pan, transpose, dynamics, or
custom timbre, the JSON-to-`.score` conversion should add an explicit render
representation for those features before C++ is expected to handle them.
