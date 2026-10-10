# Generates the 3 sine-wave WAV files used by music.py (written to /tmp/music).
import os, wave, struct, math
os.makedirs("/tmp/music", exist_ok=True)
def tone(name, hz, secs):
    w = wave.open(f"/tmp/music/{name}", "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
    w.writeframes(b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * hz * i / 22050))) for i in range(int(22050 * secs)))); w.close()
tone("Alpha Band - Dawn.wav", 440, 12); tone("Alpha Band - Dusk.wav", 523, 10); tone("Solo Piece.wav", 330, 8)
