# Timbre JSON Format

WaveMusic stores each part's tone color in the `timbre` JSON field. The current
format supports either a four-wave mix or additive partials, with optional
filtering, envelope, noise, and vibrato.

The current `timbre` field is the user-facing version of what the C++ engine
receives as a `.score` header:

```text
mix <sine> <square> <triangle> <saw>:
partials <harmonic-1> <harmonic-2> ...:
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

For additive synthesis, use `partials` instead of `mix`:

```json
{
  "name": "lead",
  "timbre": {
    "preset": "custom",
    "partials": [1.0, 0.55, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05]
  },
  "score": ["2c4 d e f | 4g r"]
}
```

The first partial is the fundamental, the second is harmonic 2, and so on.
`mix` and `partials` should be mutually exclusive in one `timbre` object.

## What The Four Waves Do

- `sine`: smoothest tone, only the fundamental. It is clean but can sound thin.
- `square`: hollow, bright, strong odd harmonics. Useful for retro lead tones.
- `triangle`: soft, rounded, weaker odd harmonics. Often pleasant for simple
  melodies.
- `saw`: bright, rich, all harmonics. Useful for string-like or synth-like
  tones, but can sound harsh without filtering.

The organ presets start from those base-wave mixes, then add mild filtering and
note shaping. They can still be written as compact preset strings in JSON;
Python expands them before rendering.

| Preset | Mix: sine square triangle saw | Filter | Envelope: attack decay sustain release | Extra | Character |
| --- | --- | --- | --- | --- | --- |
| `soft organ` | `0.55 0.10 0.35 0.00` | lowpass `5200` | `18 0 1.00 90` | none | rounded and gentle |
| `bright organ` | `0.30 0.20 0.20 0.30` | highpass `60`, lowpass `7800` | `12 0 1.00 70` | none | clearer edge and more upper harmonics |
| `reed organ` | `0.20 0.45 0.10 0.25` | highpass `120`, lowpass `6200` | `25 0 1.00 100` | noise `0.01` | nasal, reedy, stronger odd harmonics |
| `mellow organ` | `0.70 0.05 0.25 0.00` | lowpass `4200` | `25 0 1.00 120` | none | smooth and low-fatigue |
| `string organ` | `0.25 0.05 0.30 0.40` | highpass `100`, lowpass `5000` | `35 0 0.95 160` | noise `0.005` | brighter, more string-pad-like |
| `warm synth organ` | `0.40 0.15 0.30 0.15` | lowpass `6000` | `22 0 0.98 120` | vibrato `0.03` | balanced warm synth-organ tone |

Additional presets use additive partials. These are still synthetic recipes,
but they are better starting points for acoustic-like timbres than a four-wave
mix.

| Preset | Source | Filter | Envelope: attack decay sustain release | Extra | Character |
| --- | --- | --- | --- | --- | --- |
| `baroque violin` | 12 partials | highpass `120`, lowpass `4500` | `35 70 0.88 140` | noise `0.025`, vibrato `0` | bowed string approximation without vibrato |
| `viola da gamba` | 8 partials | highpass `80`, lowpass `3800` | `45 90 0.82 180` | noise `0.018` | darker bowed bass/alto string color |
| `recorder` | 6 partials | highpass `200`, lowpass `6500` | `18 40 0.96 90` | noise `0.015` | breathy, direct wind tone |
| `lute` | 8 partials | highpass `90`, lowpass `5000` | `4 160 0.25 90` | noise `0.006` | plucked, quick-decay tone |
| `harpsichord` | 10 partials | highpass `80`, lowpass `7500` | `2 220 0.18 80` | noise `0.004` | bright plucked keyboard tone |

They are not physical instrument models. They are stable, simple recipes that
are easy to render quickly and tend to be comfortable for the ear.

## UI Visualization

The UI's expandable `timbre` section shows source controls, filters, plots, and
advanced shaping controls.

### Wave Plot

The wave plot draws one period of the selected source waveform. For `mix`, it
uses the four base waves. For `partials`, it sums sine harmonics.

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

If highpass or lowpass is enabled, the plot applies a simple first-order filter
preview at a reference pitch. The plot is still a shape preview: it does not
include BPM, the C++ amplitude constants, envelope, vibrato, or noise.

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

## Filters And Motion

Optional shaping fields can be layered on top of either `mix` or `partials`:

```json
{
  "name": "lead",
  "timbre": {
    "preset": "custom",
    "partials": [1.0, 0.45, 0.3, 0.18, 0.12, 0.08, 0.05],
    "noise": 0.02,
    "filter": {
      "highpass": 120,
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

Meanings:

- `preset`: named starting point. `custom` means the part supplies its own
  source settings.
- `mix`: weighted sine, square, triangle, and saw.
- `partials`: harmonic amplitudes. The first value is the fundamental, the
  second is harmonic 2, and so on. This is additive synthesis.
- `filter`: tonal shaping after the source is generated.
- `filter.highpass`: low-frequency cutoff in Hz. Useful for removing mud.
- `filter.lowpass`: high-frequency cutoff in Hz. Lower values sound warmer and
  less harsh. It should be higher than `highpass` when both are used.
- `noise`: small non-pitched component for breath, bow, or attack texture.
- `envelope`: attack, decay, sustain, and release shape.
- `vibrato`: periodic pitch movement in semitones. `depth: 0` means no vibrato.

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

A baroque violin-like tone needs more than a static waveform. The current
`baroque violin` preset uses the useful minimum:

- many harmonic `partials`, because bowed strings are harmonically rich.
- moderate `lowpass`, roughly in the `3000..6000` Hz range, to avoid a harsh
  synthetic edge.
- small `noise`, around `0.01..0.04`, to suggest bow contact.
- a bow-like envelope: short but not instant attack, high sustain, and a natural
  release.
- no vibrato, because the target is baroque violin without modern continuous
  vibrato.

The hardest part is that real violin timbre changes over time during the bow
attack, sustain, and release. The current `envelope` and `partials` are static;
future versions may need time-varying partials or filters to get closer than an
organ-like approximation.
