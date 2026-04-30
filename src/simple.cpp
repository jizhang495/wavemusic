#include <iostream>
#include <fstream>
#include <string>
#include <sstream>
#ifdef DEBUG
#include <cassert>
#endif
#include <vector>
#include <regex>
#include <cstdint> // added for uint8_t, uint32_t, etc.
#include <string>
#include <cctype>
#include <cstdlib>
#include <cmath>

#include "sigen.h"

#define FILE_NAME "m.wav"

typedef struct Wav_Header {
    uint8_t  riff[4]       = {'R', 'I', 'F', 'F'};
    uint32_t file_size     = 0;                  // calculate and fill in later
    uint8_t  wave[4]       = {'W', 'A', 'V', 'E'};
    uint8_t  fmt[4]        = {'f', 'm', 't', ' '};
    uint32_t fmt_size      = 16;
    uint16_t wav_format    = 1;                  // PCM
    uint16_t channel_cnt   = 1;
    uint32_t sample_freq   = DEFAULT_SAMPLE_RATE;
    uint32_t data_rate     = DEFAULT_SAMPLE_RATE * 2; // 2 bytes per sample
    uint16_t block_align   = 2;                  // 16-bit mono
    uint16_t bits_per_samp = 16;
    uint8_t  data[4]       = {'d', 'a', 't', 'a'};
    uint32_t data_size     = 0;                  // calculate and fill in later
} wav_hdr_t;

typedef std::vector<std::vector<note_t>> score_t;

wave_t make_wave(float sine, float square, float triangle, float saw) {
    return {sine, square, triangle, saw};
}

wave_t preset_wave(const std::string &name) {
    if (name == "sine") {
        return make_wave(1.0f, 0.0f, 0.0f, 0.0f);
    } else if (name == "square") {
        return make_wave(0.0f, 1.0f, 0.0f, 0.0f);
    } else if (name == "triangle") {
        return make_wave(0.0f, 0.0f, 1.0f, 0.0f);
    } else if (name == "saw" || name == "sawtooth") {
        return make_wave(0.0f, 0.0f, 0.0f, 1.0f);
    }
    return make_wave(0.0f, 0.0f, 1.0f, 0.0f);
}

wave_t rest_wave() {
    return make_wave(0.0f, 0.0f, 0.0f, 0.0f);
}

std::string lower_token(std::string token) {
    for (auto &c: token) {
        c = std::tolower(static_cast<unsigned char>(c));
    }
    return token;
}

bool strip_trailing_colon(std::string &token) {
    if (!token.empty() && token.back() == ':') {
        token.pop_back();
        return true;
    }
    return false;
}

float parse_wave_weight(std::string token) {
    strip_trailing_colon(token);
    char *end = nullptr;
    float value = std::strtof(token.c_str(), &end);
    if (end == token.c_str()) {
        return 0.0f;
    }
    if (!std::isfinite(value)) {
        return 0.0f;
    }
    if (value < 0.0f) {
        return 0.0f;
    }
    if (value > 1.0f) {
        return 1.0f;
    }
    return value;
}

void push_stave_if_needed(score_t &score, std::vector<note_t> &stave) {
    if (!stave.empty()) {
        score.push_back(stave);
        stave.clear();
    }
}

// parse input string to score_t
score_t parse(std::string str_in) {
    std::regex rgx_delim("[\\s|\\|]+");
    std::regex rgx_note("(\\d+)?([A-Ga-gRr][+-]?)(\\d+)?");
    std::smatch matches;
    std::vector<note_t> stave;
    std::vector<std::vector<note_t>> score;
    std::vector<std::string> tokens;

    std::sregex_token_iterator iter(str_in.begin(), str_in.end(), rgx_delim, -1);
    std::sregex_token_iterator end;

    for (; iter != end; ++iter) {
        std::string token = *iter;
        if (!token.empty()) {
            tokens.push_back(token);
        }
    }

    wave_t w = rest_wave();
    int l = 0;
    std::string n;
    int o = 4;

    for (std::size_t i = 0; i < tokens.size(); ++i) {
        std::string token = tokens[i];
        std::string header = lower_token(token);
        // instrument headers
        if (header == "wave" && i + 4 < tokens.size()) {
            w = make_wave(
                parse_wave_weight(tokens[i + 1]),
                parse_wave_weight(tokens[i + 2]),
                parse_wave_weight(tokens[i + 3]),
                parse_wave_weight(tokens[i + 4])
            );
            push_stave_if_needed(score, stave);
            i += 4;
        } else if (header.back() == ':') {
            strip_trailing_colon(header);
            if (header == "sine" || header == "square" ||
                header == "triangle" || header == "saw" ||
                header == "sawtooth") {
                w = preset_wave(header);
                push_stave_if_needed(score, stave);
            }
        // notes
        } else {
            if (std::regex_match(token, matches, rgx_note)) {
                // note name, allow lower case
                n = matches[2];
                for (auto &c: n) {
                    c = std::toupper(static_cast<unsigned char>(c));
                }
                // length
                if (matches[1] != "") { l = std::stoi(matches[1]); }
                // octave
                if (matches[3] != "") { o = std::stoi(matches[3]); }

                // rests
                if (n == "R") {
                    stave.push_back({rest_wave(), l, n, o});
                } else {
                    stave.push_back({w, l, n, o});
                }
            }
        }
    }
    push_stave_if_needed(score, stave);
    return score;
};

void set_uint_arg(const std::string &value, uint32_t &target) {
    try {
        unsigned long parsed = std::stoul(value);
        if (parsed > 0) {
            target = static_cast<uint32_t>(parsed);
        }
    } catch (...) {}
}

int playscore(int argc, char **argv) {
    #ifdef DEBUG
    static_assert(sizeof(wav_hdr_t) == 44, "wav_hdr_t size error");
    #endif

    std::string score_filename;
    std::string output_filename = FILE_NAME;
    bool should_play = true;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];

        if (arg == "--no-play" || arg == "--silent") {
            should_play = false;
            continue;
        }

        if (arg.rfind("--out=", 0) == 0) {
            output_filename = arg.substr(6);
            continue;
        }

        if (arg.rfind("--score=", 0) == 0) {
            score_filename = arg.substr(8);
            continue;
        }

        if (arg.rfind("--sample-rate=", 0) == 0) {
            set_uint_arg(arg.substr(14), g_sample_rate);
            continue;
        }

        if (arg.rfind("--bpm=", 0) == 0) {
            set_uint_arg(arg.substr(6), g_bpm);
            continue;
        }

        if (score_filename.empty()) {
            score_filename = arg;
        } else if (output_filename == FILE_NAME) {
            output_filename = arg;
        }
    }

    if (score_filename.empty()) {
        std::cerr << "score file required" << std::endl;
        return 1;
    }

    // write file
    wav_hdr_t wav_hdr;
    wav_hdr.sample_freq = g_sample_rate;
    wav_hdr.data_rate = g_sample_rate * 2;
    uint32_t data_size;
    std::vector<int16_t> pcm_data;
    std::vector<int16_t> pcm_out;
    int ptr = 0;

    std::ofstream f;
    f.open(output_filename, std::ios::binary);
    f.write(reinterpret_cast<const char *>(&wav_hdr), sizeof(wav_hdr_t));

    // Reads score
    // No guards against these bad inputs, won't fix just git gud plz
    //   - first note without octave value
    //   - invalid instrument/note name
    //   - first stave not longest
    //   - bad barline positions (parser ignores barlines)
    // TODO: add persistent length settings
    std::ifstream f_score;
    f_score.open(score_filename);
    if (!f_score) {
        std::cerr << "could not open score file: " << score_filename << std::endl;
        return 1;
    }
    std::stringstream sstr_in;
    sstr_in << f_score.rdbuf();
    f_score.close();
    std::string str_in = sstr_in.str();

    score_t score = parse(str_in);
    #ifdef DEBUG
    std::cout << score;
    #endif

    // data_size depends on length of first stave
    bool first = true;
    for (const auto &stave: score) {
        for (const auto &note: stave) {
            play(pcm_data, ptr, note, first);
        }
        first = false;
        ptr = 0;
    }

    // apply a low pass filter
    pcm_out = lowpass(pcm_data);

    // TODO: change all pcm_data before this point to be float/doubles
    for (const auto &sample: pcm_out) {
        f.write(reinterpret_cast<const char *>(&sample), sizeof(int16_t));
    }
    data_size = pcm_out.size() * sizeof(int16_t);

    // calculate header and overwrite with correct size bits
    wav_hdr.data_size = data_size;
    wav_hdr.file_size = data_size + 32;
    f.seekp(0);
    f.write(reinterpret_cast<const char *>(&wav_hdr), sizeof(wav_hdr_t));
    f.close();

    // play wav with system call
    bool played = false;

    if (should_play) {
        #ifdef __APPLE__
        int rvalue = system(std::string("afplay \"" + output_filename + "\" &").c_str());
        if(rvalue == 0) { played = true; }

        #elif __linux__
        // check if aplay exists
        int rvalue = system("command -v aplay > /dev/null");
        if (rvalue == 0) {
            rvalue = system(std::string("aplay \"" + output_filename + "\" &").c_str());
            if(rvalue == 0) { played = true; }
        }

        #elif _WIN32
        // Windows: use VLC for async playback
        std::string cmd = "start /B vlc --intf dummy --play-and-exit \"" + output_filename + "\"";
        int rvalue = system(cmd.c_str());
        if (rvalue == 0) { played = true; }

        #endif
    }

    if (should_play && !played) {
        std::cout << "unsupported OS, please manually start playback of " << output_filename << std::endl;
    }

    return 0;
}

#ifndef BUILD_PYBIND
int main(int argc, char **argv) {
    return playscore(argc, argv);
}
#endif

// Pybind11 module

#ifdef BUILD_PYBIND
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

int main_pybind(std::vector<std::string> args) {
    std::vector<char*> cstrs;
    for (auto& s : args)
        cstrs.push_back(const_cast<char*>(s.c_str()));

    cstrs.push_back(nullptr);  // optional if legacy code expects null-terminated argv

    int argc = static_cast<int>(args.size());
    char** argv = cstrs.data();

    return playscore(argc, argv);
}

PYBIND11_MODULE(simple, m) {
    m.def("main_pybind", &main_pybind, "Play a score");
}
#endif // BUILD_PYBIND
