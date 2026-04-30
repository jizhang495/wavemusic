# Timbre JSON Format

WaveMusic currently stores each part's tone color in the `timbre` JSON field.
This is a simple timbre format based on mixing four base waveforms. Future
versions may add richer fields under `timbre` for partials, filtering,
envelopes, noise, and vibrato.

The current `timbre` field is the user-facing version of what the C++ engine
receives as a `.score` header:

```text
mix <sine> <square> <triangle> <saw>:
```

The JSON format is easier for users, the UI, and AI generation. Python
normalizes it before rendering.

## Current Format

The simplest form is a preset string:

```json
{
  "name": "lead",
  "timbre": "triangle",
  "score": ["2c4 d e f | 4g r"]
}
```

Current preset names:

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

For custom mixes, use an object:

```json
{
  "name": "lead",
  "timbre": {
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
mix 0.4 0.15 0.3 0.15:
```

The C++ engine normalizes the four weights by their sum before synthesis. That
means `mix 1 1 1 1:` changes tone color without making output four times
louder. A mix of all zeros is silence.

## What The Four Waves Do

- `sine`: smoothest tone, only the fundamental. It is clean but can sound thin.
- `square`: hollow, bright, strong odd harmonics. Useful for retro lead tones.
- `triangle`: soft, rounded, weaker odd harmonics. Often pleasant for simple
  melodies.
- `saw`: bright, rich, all harmonics. Useful for string-like or synth-like
  tones, but can sound harsh without filtering.

The organ presets are simple blends of those base waves:

| Preset | Sine | Square | Triangle | Saw | Character |
| --- | ---: | ---: | ---: | ---: | --- |
| `soft organ` | 0.55 | 0.10 | 0.35 | 0.00 | rounded and gentle |
| `bright organ` | 0.30 | 0.20 | 0.20 | 0.30 | clearer edge and more upper harmonics |
| `reed organ` | 0.20 | 0.45 | 0.10 | 0.25 | nasal, reedy, stronger odd harmonics |
| `mellow organ` | 0.70 | 0.05 | 0.25 | 0.00 | smooth and low-fatigue |
| `string organ` | 0.25 | 0.05 | 0.30 | 0.40 | brighter, more string-pad-like |
| `warm synth organ` | 0.40 | 0.15 | 0.30 | 0.15 | balanced warm synth-organ tone |

They are not physical instrument models. They are stable, simple tones that are
easy to render quickly and tend to be comfortable for the ear.

## UI Visualization

The UI's expandable `waveform` section shows the mix values, sliders, and two
plots.

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

## Future Timbre Fields

A richer future `timbre` object can keep `preset`, then use either `mix` or
`partials` as the tone source. `filter`, `noise`, `envelope`, and `vibrato`
would be optional shaping layers on top. Today, WaveMusic renders `preset` and
`mix`; the other fields are planned.

```json
{
  "name": "lead",
  "timbre": {
    "preset": "custom",
    "partials": [1.0, 0.45, 0.3, 0.18, 0.12, 0.08, 0.05],
    "noise": 0.02,
    "filter": {
      "lowpass": 4500
    },
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

- `preset`: named starting point. `custom` means the part supplies its own
  source settings.
- `mix`: current implemented source: weighted sine, square, triangle, and saw.
- `partials`: harmonic amplitudes. The first value is the fundamental, the
  second is harmonic 2, and so on. This would be additive synthesis.
- `filter`: tonal shaping after the source is generated.
- `filter.lowpass`: high-frequency cutoff in Hz. Lower values sound warmer and
  less harsh.
- `noise`: small non-pitched component for breath, bow, or attack texture.
- `envelope`: attack, decay, sustain, and release shape.
- `vibrato`: periodic pitch movement. `depth: 0` means no vibrato.

`mix` and `partials` should be mutually exclusive in one `timbre` object. If
both are present, the importer should either reject the object or choose a
documented priority.

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

- many harmonic `partials`, because bowed strings are harmonically rich.
- moderate `lowpass`, roughly in the `3000..6000` Hz range, to avoid a harsh
  synthetic edge.
- small `noise`, around `0.01..0.04`, to suggest bow contact.
- a bow-like envelope: short but not instant attack, high sustain, and a natural
  release.
- `vibrato.depth: 0`, because the target is baroque violin without vibrato.

The hardest part is that real violin timbre changes over time during the bow
attack, sustain, and release. The future `envelope` and `partials` may need to
become time-varying to get closer than an organ-like approximation.
