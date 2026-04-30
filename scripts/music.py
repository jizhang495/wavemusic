import wave
import struct
from scripts.note import Note
from scripts.utils import is_integer
from scripts.utils import play_wav
ps = None # placeholder for playsound import

class Music:
    """ This class is used to represent a piece of music.
    It contains a list of notes and a method to play the music.
    """
    def __init__(self, score: str):
        self.score = score.replace("|", "") # remove the bar lines
        self.notes = []
        self.score_to_notes()

    def __str__(self):
        return self.score

    def score_to_notes(self):
        notelist = self.score.split()
        shape = "t"  # default shape
        length = 2  # default length
        octave = 4  # default octave

        for n in notelist:
            n = n.strip()
            # When encountering label words, update shape.
            if n[-1] == ":":
                if n == "sine:":
                    shape = "s"
                elif n == "square:":
                    shape = "q"
                elif n == "triangle:":
                    shape = "t"
                elif n in {"saw:", "sawtooth:"}:
                    shape = "w"
                continue

            # update shape, length and octave if they are present in the note
            if n[0] in ["s", "q", "t", "w"]:
                shape = n[0]
                n = n[1:]
            if is_integer(n[0]):
                if is_integer(n[1]):
                    length = int(n[:2])
                    n = n[2:]
                else:
                    length = int(n[0])
                    n = n[1:]
            if is_integer(n[-1]):
                octave = int(n[-1])
                n = n[:-1]

            note_obj = Note(shape=shape, length=length, octave=octave)
            note_obj.update(n)  # update the note name and frequency
            self.notes.append(note_obj)

    def write_wav(self, filename="m.wav", sample_rate=44100, bpm=100): #44100 Hz
        rawdata = []
        for note_obj in self.notes:
            rawdata.extend(note_obj.note_to_wave(sample_rate=sample_rate, bpm=bpm))

        with wave.open(filename, "wb") as f:
            f.setnchannels(1)  # mono
            f.setsampwidth(2)  # 2 bytes (16 bits)
            f.setframerate(sample_rate)
            f.writeframes(struct.pack("<" + "h" * len(rawdata), *rawdata))
            # f.writeframesraw(b"".join([struct.pack("<h", d) for d in rawdata]))
            # for d in rawdata:
            #     f.writeframesraw(struct.pack("<h", d))

    def playscore(self, filename="m.wav", sample_rate=44100, bpm=100):
        self.write_wav(filename=filename, sample_rate=sample_rate, bpm=bpm)
        play_wav(filename=filename)

    def play_from_playsound(self, filename="m.wav", sample_rate=44100, bpm=100):
        """Play the music using playsound after writing WAV.
        """
        global ps
        if ps is None:
            from playsound import playsound
            ps = playsound
        self.write_wav(filename=filename, sample_rate=sample_rate, bpm=bpm)
        ps(filename=filename)
