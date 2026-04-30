import math
from scripts.utils import note_name_to_freq
from scripts.waveforms import (
    saw_wave_n,
    sine_wave_n,
    square_wave_n,
    triangle_wave_n,
)

class Note:
    """ "length" is measured as multiples of a semiquaver
    "note" takes either the note name or frequency (Hz) of the note
    (feature to be added)
    "r" is used as the note name of rests
    """
    def __init__(self, shape="t", length=2, name="r", octave=4):
        self.shape = shape
        self.length = length
        self.name = name
        self.octave = octave
        self.frequency = None

    def __str__(self):
        return f"{self.shape}{self.length}{self.name}{self.octave}"

    def update(self, string):
        # string = string.strip()
        # if is_integer(string[0]):
        #     if is_integer(string[1]):
        #         self.length = int(string[:2])
        #         string = string[2:]
        #     else:
        #         self.length = int(string[0])
        #         string = string[1:]
        # if is_integer(string[-1]):
        #     self.octave = int(string[-1])
        #     string = string[:-1]
        self.name = string
        freq_expt = note_name_to_freq(self.name)
        if freq_expt is not None:
            self.frequency = 440 * math.pow(2, freq_expt / 12 + self.octave - 4)

    def update_shape(self, shape):
        if shape in ["s", "q", "t", "w"]:
            self.shape = shape
        else:
            raise ValueError(f"Invalid shape: {shape}. Expected 's', 'q', 't', 'w'.")

    def note_to_wave(self, sample_rate, bpm=100, transpose=0):
        semiquaver = 15 / bpm #s
        frames = int(self.length * semiquaver * sample_rate)
        value = []
        if self.frequency is None or self.name == "r":
            for _i in range(frames):
                value.append(0)
        else:
            frequency = self.frequency * math.pow(2, transpose / 12)
            if self.shape == "s": # sine wave
                for n in range(frames):
                    value.append(
                        int(4000 * sine_wave_n(n, sample_rate, frequency))
                    )
            elif self.shape == "q": # square wave
                for i in range(frames):
                    value.append(
                        int(1000 * square_wave_n(i, sample_rate, frequency))
                    )
            elif self.shape == "t": # triangle wave
                for i in range(frames):
                    value.append(
                        int(2000 * triangle_wave_n(i, sample_rate, frequency))
                    )
            elif self.shape == "w": # saw wave
                for i in range(frames):
                    value.append(int(2000 * saw_wave_n(i, sample_rate, frequency)))

        return value
