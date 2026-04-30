#include <cmath>
#include <cstddef>
#include <algorithm>
#ifdef DEBUG
#include <iomanip>
#include <cassert>
#endif
#include <cstdint> // added for uint8_t, uint32_t, etc.
#include "sigen.h"

uint32_t g_sample_rate = DEFAULT_SAMPLE_RATE;
uint32_t g_bpm = DEFAULT_BPM;
int32_t g_transpose = DEFAULT_TRANSPOSE;

f_lut_t note_t::construct_lut() {
    f_lut_t f_lut = {
        {"C-", -10}, {"C", -9}, {"C+", -8},
        {"D-",  -8}, {"D", -7}, {"D+", -6},
        {"E-",  -6}, {"E", -5}, {"E+", -4},
        {"F-",  -5}, {"F", -4}, {"F+", -3},
        {"G-",  -3}, {"G", -2}, {"G+", -1},
        {"A-",  -1}, {"A",  0}, {"A+",  1},
        {"B-",   1}, {"B",  2}, {"B+",  3},
    };

    for (auto &i: f_lut) { i.second = 440.0 * pow(2.0, i.second/12); }

    return f_lut;
}

// TODO: remove octave from class and calculate frequency before construction?
note_t::note_t(timbre_t t, int l, std::string n, int o) {
    static f_lut_t f_lut = construct_lut();
    timbre = t;
    length = l;
    name   = n;
    octave = o;
    freq   = f_lut[n] * pow(2.0, octave-4 + g_transpose/12.0);
}

// TODO: pass in 2 data points instead of the whole piece if that's faster?
std::vector<int16_t> lowpass(std::vector<int16_t> &pcm_data) {
    std::vector<int16_t> pcm_out;
    // time constant RC = 1/(2πf)
    const float RC = 1/(2*M_PI*LPF_FC);
    // smoothing factor α = dt/(RC+dt)
    const float alpha = 1 / (RC*g_sample_rate + 1);
    int16_t prev_out = 0;
    // y[i] = α * x[i] + (1-α) * y[i-1]
    for (const auto &sample: pcm_data) {
        pcm_out.push_back((alpha * sample) + ((1-alpha) * prev_out));
        prev_out = pcm_out.back();
    }
    return pcm_out;
}

float envelope_gain(int i, int s_len, envelope_t envelope) {
    int attack = std::max(0, static_cast<int>(envelope.attack_ms*g_sample_rate/1000.0f));
    int decay = std::max(0, static_cast<int>(envelope.decay_ms*g_sample_rate/1000.0f));
    int release = std::max(0, static_cast<int>(envelope.release_ms*g_sample_rate/1000.0f));
    float sustain = std::clamp(envelope.sustain, 0.0f, 1.0f);
    int release_start = std::max(0, s_len - release);

    if (attack > 0 && i < attack) {
        return static_cast<float>(i) / attack;
    }
    if (decay > 0 && i < attack + decay) {
        float progress = static_cast<float>(i - attack) / decay;
        return 1.0f - (1.0f - sustain) * std::clamp(progress, 0.0f, 1.0f);
    }
    if (release > 0 && i >= release_start) {
        float progress = static_cast<float>(i - release_start) / release;
        return sustain * (1.0f - std::clamp(progress, 0.0f, 1.0f));
    }
    return sustain;
}

float pseudo_noise(int i, float freq) {
    float value = sin((i + 1) * 12.9898f + freq * 78.233f) * 43758.5453f;
    return 2.0f * (value - floor(value)) - 1.0f;
}

float mix_sample(mix_t mix, float phase, float freq, int i) {
    float total_weight = mix.sine + mix.square + mix.triangle + mix.saw;
    if (total_weight <= 0.0f) { return 0.0f; }

    float sine_weight = mix.sine / total_weight;
    float square_weight = mix.square / total_weight;
    float triangle_weight = mix.triangle / total_weight;
    float saw_weight = mix.saw / total_weight;
    float sine = (float)SIN_AMP * sin(2.0*M_PI*freq*i/g_sample_rate);
    float square = phase < 0.5f ? SQR_AMP : -SQR_AMP;
    float triangle = (1.0f - 4.0f * std::fabs(phase - 0.5f)) * TRI_AMP;
    float saw = (2.0f * phase - 1.0f) * SAW_AMP;

    return sine_weight * sine
         + square_weight * square
         + triangle_weight * triangle
         + saw_weight * saw;
}

float partials_sample(const std::vector<float> &partials, float phase) {
    float total_weight = 0.0f;
    for (float partial: partials) {
        total_weight += partial;
    }
    if (total_weight <= 0.0f) { return 0.0f; }

    float sample = 0.0f;
    for (std::size_t index = 0; index < partials.size(); ++index) {
        float harmonic = static_cast<float>(index + 1);
        sample += (partials[index] / total_weight)
                * (float)SIN_AMP
                * sin(2.0*M_PI*harmonic*phase);
    }
    return sample;
}

float timbre_sample(timbre_t timbre, int i, float freq) {
    if (freq <= 0.0f) { return 0.0f; }

    float vibrato_ratio = 1.0f;
    if (timbre.vibrato > 0.0f) {
        float lfo = sin(2.0*M_PI*5.5f*i/g_sample_rate);
        vibrato_ratio = pow(2.0f, (timbre.vibrato * lfo) / 12.0f);
    }
    float effective_freq = freq * vibrato_ratio;
    float phase = std::fmod(effective_freq * i / g_sample_rate, 1.0f);
    float sample = 0.0f;

    if (timbre.source == source_t::partials) {
        sample = partials_sample(timbre.partials, phase);
    } else {
        sample = mix_sample(timbre.mix, phase, effective_freq, i);
    }

    if (timbre.noise > 0.0f) {
        sample += timbre.noise * SIN_AMP * pseudo_noise(i, freq);
    }
    return sample;
}

// write one note with note_t
void play(std::vector<int16_t> &pcm_data, int &ptr, note_t note, bool first) {
    play(pcm_data, ptr, note.timbre, note.length, note.freq, first);
}

// write one note with note parameters
// signal generator -> optional filters -> envelope -> output
void play(std::vector<int16_t> &pcm_data, int &ptr, timbre_t timbre,
          int length, float freq, bool first) {

    #ifdef DEBUG
    assert(length != 0);
    #endif

    float sample = 0.0;
    float gain;
    int16_t pcm_out;
    float smqvr = 15.0/g_bpm;
    int s_len      = rint(smqvr*length*g_sample_rate); // length in number of samples
    float nyquist = g_sample_rate / 2.0f;
    bool highpass_enabled = timbre.filter.highpass_enabled
                         && timbre.filter.highpass > 0.0f
                         && timbre.filter.highpass < nyquist;
    bool lowpass_enabled = timbre.filter.lowpass_enabled
                        && timbre.filter.lowpass > 0.0f
                        && timbre.filter.lowpass < nyquist;
    float hp_rc = highpass_enabled ? 1.0f/(2.0f*M_PI*timbre.filter.highpass) : 0.0f;
    float lp_rc = lowpass_enabled ? 1.0f/(2.0f*M_PI*timbre.filter.lowpass) : 0.0f;
    float dt = 1.0f/g_sample_rate;
    float hp_alpha = highpass_enabled ? hp_rc/(hp_rc + dt) : 0.0f;
    float lp_alpha = lowpass_enabled ? dt/(lp_rc + dt) : 0.0f;
    float hp_prev_in = 0.0f;
    float hp_prev_out = 0.0f;
    float lp_prev_out = 0.0f;

    #ifdef DEBUG
    assert(first || (
        (ptr + s_len - 1) >= 0 &&
        static_cast<std::size_t>(ptr + s_len - 1) < pcm_data.size()
    ));
    #endif
    for (int i = 0; i < s_len; ++i) {
        sample = timbre_sample(timbre, i, freq);

        if (highpass_enabled) {
            float filtered = hp_alpha * (hp_prev_out + sample - hp_prev_in);
            hp_prev_in = sample;
            hp_prev_out = filtered;
            sample = filtered;
        }

        if (lowpass_enabled) {
            lp_prev_out = lp_prev_out + lp_alpha * (sample - lp_prev_out);
            sample = lp_prev_out;
        }

        gain = freq <= 0.0f ? 0.0f : envelope_gain(i, s_len, timbre.envelope);

        // write or overwrite data depending on if its first stave
        pcm_out = std::clamp(
            static_cast<int>(gain * sample),
            -32768,
            32767
        );
        if (first) {
            pcm_data.push_back(pcm_out);
        } else {
            pcm_data[ptr + i] = std::clamp(
                static_cast<int>(pcm_data[ptr + i]) + static_cast<int>(pcm_out),
                -32768,
                32767
            );
        }
    }
    ptr += s_len;
}

#ifdef DEBUG
std::ostream &operator<<(std::ostream &os, mix_t mix) {
    os << "mix("
       << mix.sine << ','
       << mix.square << ','
       << mix.triangle << ','
       << mix.saw << ')';
    return os;
}

std::ostream &operator<<(std::ostream &os, timbre_t const &timbre) {
    if (timbre.source == source_t::partials) {
        os << "partials(";
        for (std::size_t i = 0; i < timbre.partials.size(); ++i) {
            if (i > 0) { os << ','; }
            os << timbre.partials[i];
        }
        os << ')';
    } else {
        os << timbre.mix;
    }
    return os;
}

std::ostream &operator<<(std::ostream &os, note_t const &note) {
    os << std::setw(28) << note.timbre
       << std::setw(3) << note.length << ' '
       << std::left << std::setw(2) << note.name << std::right
       << std::setw(7) << std::fixed << std::setprecision(1) << note.freq
       << std::setw(2) << note.octave << std::endl;
    return os;
}

std::ostream &operator<<(std::ostream &os, std::vector<note_t> const &stave) {
    for (const auto &note: stave) {
        os << note;
    }
    return os;
}

std::ostream &operator<<(std::ostream &os, std::vector<std::vector<note_t>> const &score) {
    for (const auto &stave: score) {
        os << "=== stave break ===" << std::endl;
        os << stave << std::endl;
    }
    return os;
}
#endif
