#ifndef SIGEN_H
#define SIGEN_H

#include <iostream>
#include <unordered_map>
#include <string>
#include <vector>
#include <cstdint> // added for uint8_t, uint32_t, etc.
#define _USE_MATH_DEFINES
#include <cmath>   // added for M_PI, sin()
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif


#define DEFAULT_SAMPLE_RATE 44100
#define DEFAULT_BPM 100
#define DEFAULT_TRANSPOSE 0
// Amplitudes defined for constant RMS
#define SIN_AMP 2828
#define SQR_AMP 2000
#define TRI_AMP 3464
#define SAW_AMP 3464
// cut off frequency of LPF
#define LPF_FC 10000

extern uint32_t g_sample_rate;
extern uint32_t g_bpm;
extern int32_t g_transpose;

struct mix_t {
    float sine;
    float square;
    float triangle;
    float saw;
};

struct filter_t {
    bool highpass_enabled;
    float highpass;
    bool lowpass_enabled;
    float lowpass;
};

struct envelope_t {
    float attack_ms;
    float decay_ms;
    float sustain;
    float release_ms;
};

enum class source_t {
    mix,
    partials,
};

struct timbre_t {
    source_t source;
    mix_t mix;
    std::vector<float> partials;
    filter_t filter;
    envelope_t envelope;
    float noise;
    float vibrato;
};

typedef std::unordered_map<std::string, float> f_lut_t;

class note_t {
private:
    // build frequency look-up table
    static f_lut_t construct_lut();

public:
    timbre_t     timbre;
    int          length;
    std::string  name;
    int          octave;
    float        freq;

    note_t(timbre_t t, int l, std::string n, int o);
};

#ifdef DEBUG
std::ostream &operator<<(std::ostream &os, mix_t mix);
std::ostream &operator<<(std::ostream &os, timbre_t const &timbre);
std::ostream &operator<<(std::ostream &os, note_t const &note);
std::ostream &operator<<(std::ostream &os, std::vector<note_t> const &stave);
std::ostream &operator<<(std::ostream &os, std::vector<std::vector<note_t>> const &score);
#endif

std::vector<int16_t> lowpass(std::vector<int16_t> &pcm_data);
float envelope_gain(int i, int s_len, envelope_t envelope);
void play(std::vector<int16_t> &pcm_data, int &ptr, note_t note, bool first);
void play(std::vector<int16_t> &pcm_data, int &ptr, timbre_t timbre, int length,
          float freq, bool first);

#endif
