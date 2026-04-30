# Timbre JSON Format

WaveMusic currently stores each part's tone color in the `waveform` JSON field.
This is a simple timbre format based on mixing four base waveforms. Future
versions may add a richer `timbre` field for partials, filtering, envelopes,
noise, and vibrato.

The current `waveform` field is the user-facing version of what the C++ engine
receives as a `.score` header:

```text
wave <sine> <square> <triangle> <saw>:
```

The JSON format is easier for users, the UI, and AI generation. Python
normalizes it before rendering.

## Current Format

The simplest form is a preset string:

```json
{
  "name": "lead",
  "waveform": "triangle",
  "score": ["2c4 d e f | 4g r"]
}
```

Current preset names:

- `sine`
- `square`
- `triangle`
- `saw`
- `soft organ`
- `warm synth organ`

For custom mixes, use an object:

```json
{
  "name": "lead",
  "waveform": {
    "preset": "custom",
    "mix": {
      "sine": 0.4,
      "square": 0.15,
      "triangle": 0.3,
      "saw": 0.15
    }
  },
  "score": ["2c4 d e f | 4g r"]
}
```

`mix` values are clamped to `0..1`. The order used by `.score` is:

```text
sine square triangle saw
```

So the JSON example above becomes:

```text
wave 0.4 0.15 0.3 0.15:
```

The C++ engine normalizes the four weights by their sum before synthesis. That
means `wave 1 1 1 1:` changes tone color without making output four times
louder. A mix of all zeros is silence.

## What The Four Waves Do

- `sine`: smoothest tone, only the fundamental. It is clean but can sound thin.
- `square`: hollow, bright, strong odd harmonics. Useful for retro lead tones.
- `triangle`: soft, rounded, weaker odd harmonics. Often pleasant for simple
  melodies.
- `saw`: bright, rich, all harmonics. Useful for string-like or synth-like
  tones, but can sound harsh without filtering.

The organ presets are simple blends of those base waves:

```json
"soft organ": {
  "sine": 0.55,
  "square": 0.1,
  "triangle": 0.35,
  "saw": 0
}
```

```json
"warm synth organ": {
  "sine": 0.4,
  "square": 0.15,
  "triangle": 0.3,
  "saw": 0.15
}
```

They are not physical instrument models. They are stable, simple tones that are
easy to render quickly and tend to be comfortable for the ear.

## UI Visualization

The UI's expandable `mix` section shows two plots.

### Wave Plot

The wave plot draws one period of the mixed waveform.

For each horizontal pixel, the UI computes a phase from `0..1`, generates the
four base waves at that phase, mixes them by the current slider values, and
divides by the total mix weight:

```text
sample =
  (sine_weight * sine
   + square_weight * square
   + triangle_weight * triangle
   + saw_weight * saw)
  / total_weight
```

The plot is a shape preview. It does not include note pitch, sample rate, BPM,
the C++ amplitude constants, attack/release filtering, or low-pass filtering.

### Spectrum Plot

The spectrum plot shows relative harmonic content.

The UI samples one period at 256 points. For harmonics `1..16`, it computes a
small DFT-style magnitude:

```text
real += sample * cos(angle)
imag += sample * sin(angle)
magnitude = hypot(real, imag)
```

Each bar answers: "how much of harmonic N is present in this one-period
waveform?"

- Harmonic 1 is the fundamental pitch.
- Harmonic 2 is one octave above.
- Harmonic 3 is an octave plus a fifth.
- Higher harmonics add brightness and edge.

The bars are normalized so the largest visible harmonic has full height. The
plot shows relative color, not absolute loudness, and it is not an analysis of
the rendered WAV file.

## Future Timbre Format

A richer future format could add a `timbre` object. This is not implemented
yet, but this shape would be much more expressive than mixing four fixed waves:

```json
{
  "name": "lead",
  "timbre": {
    "type": "additive",
    "partials": [1.0, 0.45, 0.3, 0.18, 0.12, 0.08, 0.05],
    "noise": 0.02,
    "lowpass": 4500,
    "envelope": {
      "attack_ms": 35,
      "decay_ms": 80,
      "sustain": 0.85,
      "release_ms": 120
    },
    "vibrato": {
      "depth": 0
    }
  },
  "score": ["2c4 d e f | 4g r"]
}
```

Possible meanings:

- `type`: synthesis method. `additive` means building tone from harmonic
  partials.
- `partials`: harmonic amplitudes. The first value is the fundamental, the
  second is harmonic 2, and so on.
- `noise`: small non-pitched component for breath, bow, or attack texture.
- `lowpass`: high-frequency cutoff in Hz. Lower values sound warmer and less
  harsh.
- `envelope`: attack, decay, sustain, and release shape.
- `vibrato`: periodic pitch movement. `depth: 0` means no vibrato.

## What Makes A Tone Good For The Ear

The most important additions would be:

- `envelope`: prevents clicks and makes notes feel played rather than switched
  on and off. Attack and release matter a lot.
- `lowpass`: controls harsh high harmonics, especially for saw and square-like
  tones.
- `partials`: gives more control than the four-wave mix, while still being fast
  and predictable.
- normalization: keeps different timbres from jumping wildly in loudness.

Small `noise` can add life, but too much becomes hiss. Vibrato can make long
notes more expressive, but it is not required for a pleasant organ-like sound.

## Toward Baroque Violin

A baroque violin-like tone needs more than a static waveform, but a useful
minimum could be:

- `type: "additive"` with many harmonic partials, because bowed strings are
  harmonically rich.
- moderate `lowpass`, roughly in the `3000..6000` Hz range, to avoid a harsh
  synthetic edge.
- small `noise`, around `0.01..0.04`, to suggest bow contact.
- a bow-like envelope: short but not instant attack, high sustain, and a natural
  release.
- `vibrato.depth: 0`, because the target is baroque violin without vibrato.

The hardest part is that real violin timbre changes over time during the bow
attack, sustain, and release. The future `envelope` and `partials` may need to
become time-varying to get closer than an organ-like approximation.
