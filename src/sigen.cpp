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
note_t::note_t(wave_t w, int l, std::string n, int o) {
    static f_lut_t f_lut = construct_lut();
    wave   = w;
    length = l;
    name   = n;
    octave = o;
    freq   = f_lut[n] * pow(2.0, octave-4);
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

// TODO: add decay and sustain and rename to ADSR
float filter(int i, int s_len) {
    // assume 99% volume change by 0.02s
    // k = -0.02/ln(0.01) = 0.004343
    float k = -(0.02*g_sample_rate/log(0.01));
    int atk_start  = 0.02*g_sample_rate;
    #ifdef DEBUG
    assert(s_len > 2*atk_start);
    #endif
    int rel_start = s_len - atk_start;
    int j = i; // cast to signed int
    float gain;
    if (i < atk_start) {
        // attack curve
        // y = 1 - e^(-t/k)
        gain = 1.0-exp(-j/k);
    } else if (i > rel_start) {
        // release curve in seconds
        // y = e^(-((t-0.02)/k))
        gain = exp(-((j-rel_start)/k));
    } else {
        // flat sustain
        gain = 1.0;
    }
    return gain;
}

// write one note with note_t
void play(std::vector<int16_t> &pcm_data, int &ptr, note_t note, bool first) {
    play(pcm_data, ptr, note.wave, note.length, note.freq, first);
}

// write one note with note parameters
// signal generator -> attack/release gain filter -> output
void play(std::vector<int16_t> &pcm_data, int &ptr, wave_t wave,
          int length, float freq, bool first) {

    float total_weight = wave.sine + wave.square + wave.triangle + wave.saw;
    #ifdef DEBUG
    assert(length != 0);
    if (total_weight > 0.0f) { assert(freq != 0.0); }
    #endif

    float sample = 0.0;
    float gain;
    int16_t pcm_out;
    float smqvr = 15.0/g_bpm;
    int s_len      = rint(smqvr*length*g_sample_rate); // length in number of samples
    float period   = total_weight > 0.0f ? g_sample_rate/freq : 1.0f;
    float sine_weight = 0.0;
    float square_weight = 0.0;
    float triangle_weight = 0.0;
    float saw_weight = 0.0;

    if (total_weight > 0.0f) {
        sine_weight = wave.sine / total_weight;
        square_weight = wave.square / total_weight;
        triangle_weight = wave.triangle / total_weight;
        saw_weight = wave.saw / total_weight;
    }

    #ifdef DEBUG
    assert(first || (
        (ptr + s_len - 1) >= 0 &&
        static_cast<std::size_t>(ptr + s_len - 1) < pcm_data.size()
    ));
    #endif
    for (int i = 0; i < s_len; ++i) {
        sample = 0.0;
        if (total_weight > 0.0f) {
            float phase = std::fmod(i, period) / period;
            float sine = (float)SIN_AMP * sin(2.0*M_PI*freq*i/g_sample_rate);
            float square = phase < 0.5f ? SQR_AMP : -SQR_AMP;
            float triangle = (1.0f - 4.0f * std::fabs(phase - 0.5f)) * TRI_AMP;
            float saw = (2.0f * phase - 1.0f) * SAW_AMP;

            sample = sine_weight * sine
                   + square_weight * square
                   + triangle_weight * triangle
                   + saw_weight * saw;
        }

        // apply attack/release filter
        if (total_weight == 0.0f) {
            gain = 0;
        } else {
            gain = filter(i, s_len);
        }

        // write or overwrite data depending on if its first stave
        pcm_out = gain * sample;
        if (first) {
            pcm_data.push_back(pcm_out);
        } else {
            pcm_data[ptr + i] += pcm_out;
        }
    }
    ptr += s_len;
}

#ifdef DEBUG
std::ostream &operator<<(std::ostream &os, wave_t wave) {
    os << "wave("
       << wave.sine << ','
       << wave.square << ','
       << wave.triangle << ','
       << wave.saw << ')';
    return os;
}

std::ostream &operator<<(std::ostream &os, note_t const &note) {
    os << std::setw(28) << note.wave
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
