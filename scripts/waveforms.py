import math
# import numpy as np

def sine_wave(t, freq):
    wavefunction = math.sin(2 * math.pi * freq * t)
    return wavefunction

def sine_wave_n(n, sample_rate, freq):
    wavefunction = math.sin(2 * math.pi * freq * n / sample_rate)
    return wavefunction

# def square_wave(t, freq):
#     phase = int(2 * freq * t) % 2
#     wavefunction = 1 if phase == 0 else -1
#     return wavefunction

def square_wave(t, freq):
    period = 1 / freq
    phase = t % period
    return 1 if phase < period / 2 else -1

def square_wave_n(n, sample_rate, freq):
    samples_per_cycle = sample_rate / freq
    return 1 if int(n % samples_per_cycle) < (samples_per_cycle / 2) else -1

# def triangle_wave(t, freq):
#     period = 1 / freq
#     phase = t % period
#     if phase < period / 2:
#         return 2 * phase / period - 1
#     else:
#         return 1 - 2 * (phase - period / 2) / period

def triangle_wave(t, freq):
    return 2 * abs(2 * (freq * t - math.floor(freq * t + 0.5))) - 1

def triangle_wave_n(n, sample_rate, freq):
    samples_per_cycle = sample_rate / freq
    phase = n % samples_per_cycle
    if phase < samples_per_cycle / 2:
        return 2 * phase / samples_per_cycle - 1
    else:
        return 1 - 2 * (phase - samples_per_cycle / 2) / samples_per_cycle

def saw_wave(t, freq):
    period = 1 / freq
    phase = t % period
    return 2 * (phase / period) - 1

def saw_wave_n(n, sample_rate, freq):
    samples_per_cycle = sample_rate / freq
    phase = n % samples_per_cycle
    return 2 * (phase / samples_per_cycle) - 1
