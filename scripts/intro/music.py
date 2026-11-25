#!/usr/bin/env python3
"""Render Zapstick's original 120-second instrumental (stdlib + ffmpeg).

Usage: python3 scripts/intro/music.py [/tmp/zapstick-intro-music.wav]
No recordings, samples or downloaded music. Fixed seed and score are reproducible.
96 BPM makes each four-bar phrase exactly ten seconds for the twelve scenes.
The final stereo PCM16 WAV is 44.1 kHz, 120 seconds, normalized to -22 LUFS.
"""
from __future__ import annotations

import array
import json
import math
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import wave

RATE = 44100
DURATION = 120
FRAMES = RATE * DURATION
BEAT = 60 / 96
BAR = 4 * BEAT
TAU = math.tau
SEED = 0x5A70571C


def hz(midi: int) -> float:
    return 440 * 2 ** ((midi - 69) / 12)


def compose() -> tuple[array.array, array.array]:
    left = array.array('f', [0]) * FRAMES
    right = array.array('f', [0]) * FRAMES
    rng = random.Random(SEED)
    sin, exp = math.sin, math.exp

    def note(at: float, midi: int, duration: float, gain: float, pan: float = 0,
             voice: str = 'keys') -> None:
        start = max(0, round(at * RATE))
        count = min(round(duration * RATE), FRAMES - start)
        if count <= 0:
            return
        frequency = hz(midi)
        step = TAU * frequency / RATE
        gl = gain * math.sqrt((1 - pan) / 2)
        gr = gain * math.sqrt((1 + pan) / 2)
        for i in range(count):
            t = i / RATE
            phase = step * i
            release = min(1, max(0, (duration - t) / .08))
            if voice == 'pad':
                envelope = sin(math.pi * min(1, t / duration)) ** 1.4
                value = envelope * (sin(phase + .2) + .12 * sin(phase * 2.001))
            elif voice == 'bass':
                envelope = (1 - exp(-t / .014)) * exp(-t / .27) * release
                value = envelope * (sin(phase) + .18 * sin(phase * 2))
            else:
                envelope = (1 - exp(-t / .006)) * exp(-t / (.27 if voice == 'pluck' else .42)) * release
                value = envelope * (sin(phase) + .15 * sin(phase * 2) + .035 * sin(phase * 3))
            at_frame = start + i
            left[at_frame] += value * gl
            right[at_frame] += value * gr

    def drum(at: float, gain: float, kind: str = 'kick', pan: float = 0) -> None:
        length = .23 if kind == 'kick' else .075
        start = max(0, round(at * RATE))
        count = min(round(length * RATE), FRAMES - start)
        phase = low = previous = 0.0
        gl = gain * math.sqrt((1 - pan) / 2)
        gr = gain * math.sqrt((1 + pan) / 2)
        for i in range(count):
            t = i / RATE
            if kind == 'kick':
                phase += TAU * (48 + 38 * exp(-t / .024)) / RATE
                value = sin(phase) * (1 - exp(-t / .002)) * exp(-t / .055)
            else:
                noise = rng.uniform(-1, 1)
                low += .22 * (noise - low)
                if kind == 'tap':
                    value = (.65 * low + .35 * sin(TAU * 820 * t)) * exp(-t / .012)
                else:
                    high = noise - previous
                    previous = noise
                    value = high * exp(-t / .009) * .35
                value *= min(1, t / .0015)
            left[start + i] += value * gl
            right[start + i] += value * gr

    # F-major pentatonic: warm suspended voicings leave room for the visuals.
    chords = [
        (41, (53, 57, 60, 62)),  # F6
        (38, (50, 53, 57, 60)),  # Dm7
        (43, (55, 60, 62, 67)),  # G suspended
        (36, (48, 55, 57, 62)),  # C6 suspended
    ]
    # Newly composed four-bar motifs, varied by section rather than copied music.
    motifs = [
        [(0, 69), (.75, 67), (1.75, 72), (3.25, 69)],
        [(.25, 74), (1.25, 72), (2, 69), (3.25, 65)],
        [(0, 67), (.75, 69), (1.5, 74), (2.75, 72), (3.5, 69)],
        [(.25, 67), (1.25, 74), (2.25, 72), (3.25, 67)],
    ]
    responses = [
        [(0, 65), (1, 69), (2.5, 72)],
        [(.5, 69), (1.75, 65), (3, 62)],
        [(0, 67), (1.5, 72), (2.5, 74)],
        [(.75, 72), (2, 69), (3.25, 67)],
    ]
    for bar in range(48):
        section = bar // 4
        chord_index = bar % 4
        root, pitches = chords[chord_index]
        if bar == 47:
            root, pitches = chords[0]
        at = bar * BAR
        pad_gain = .014 if section not in (0, 6, 11) else .018
        for j, pitch in enumerate(pitches):
            note(at, pitch, 2.95, pad_gain, (-.44, -.15, .18, .43)[j], 'pad')

        # Rounded, non-four-on-the-floor pulse; breathing spaces at transitions.
        if section > 0 and bar < 47:
            for beat in (0, 2.25):
                drum(at + beat * BEAT, .047 if section != 6 else .024)
            if section not in (3, 6, 11):
                for beat in (1, 3):
                    drum(at + beat * BEAT, .022, 'tap', -.13)
                for beat in (.5, 1.5, 2.5, 3.5):
                    drum(at + beat * BEAT, .009, 'tick', .3)
            for beat, interval in ((0, 0), (1.5, 0), (2.5, 12)):
                note(at + beat * BEAT, root + interval, .55, .046, -.03, 'bass')

        # Alternate related phrases. Sparse bridge prevents a two-minute jingle loop.
        motif = responses[chord_index] if section % 3 == 1 else motifs[chord_index]
        if section == 6:
            motif = motif[::2]
        if section == 0 and bar < 2:
            motif = motif[::2]
        if bar == 47:
            motif = [(0, 69), (.75, 67), (1.5, 65), (2.5, 72)]
        for k, (beat, pitch) in enumerate(motif):
            velocity = .041 * rng.uniform(.87, 1.04)
            if section == 6:
                velocity *= .72
            if section in (4, 8) and k == 0:
                pitch += 12
                velocity *= .65
            note(at + beat * BEAT + .025, pitch, .65 if k < len(motif) - 1 else .9,
                 velocity, -.23 if k % 2 else .23)

        # A quiet syncopated response accompanies import/edit/collection phrases.
        if section in (2, 4, 5, 7, 8, 9):
            for beat, pitch in ((.5, pitches[1] + 12), (2.75, pitches[2] + 12)):
                note(at + beat * BEAT, pitch, .35, .014, -.32, 'pluck')

    # A small cross-channel echo adds space without a long, metallic reverb tail.
    delay = round(.1875 * RATE)
    for i in range(FRAMES - 1, delay - 1, -1):
        old_left, old_right = left[i - delay], right[i - delay]
        left[i] += old_right * .11
        right[i] += old_left * .11
    for i in range(FRAMES):
        t = i / RATE
        fade = min(1, t / 1.2, max(0, (DURATION - t) / 2.3))
        # Gentle motion within a phrase, with a quieter bridge and ending.
        left[i] *= fade
        right[i] *= fade
    return left, right


def write_wav(path: Path, left: array.array, right: array.array) -> None:
    pcm = array.array('h')
    for l, r in zip(left, right):
        pcm.append(round(max(-.98, min(.98, l)) * 32767))
        pcm.append(round(max(-.98, min(.98, r)) * 32767))
    if sys.byteorder != 'little':
        pcm.byteswap()
    with wave.open(str(path), 'wb') as target:
        target.setnchannels(2)
        target.setsampwidth(2)
        target.setframerate(RATE)
        target.writeframes(pcm.tobytes())


def main() -> None:
    output = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/zapstick-intro-music.wav')
    output.parent.mkdir(parents=True, exist_ok=True)
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg is required for measured two-pass loudness normalization.')
    print('Rendering original Zapstick score: 120s, 96 BPM, twelve ten-second phrases.', flush=True)
    with tempfile.TemporaryDirectory(prefix='zapstick-score-') as temporary:
        raw = Path(temporary) / 'score-raw.wav'
        left, right = compose()
        peak = max(max(map(abs, left)), max(map(abs, right)))
        if peak >= .98:
            raise RuntimeError(f'Unexpected raw clipping risk: {peak}')
        write_wav(raw, left, right)
        del left, right
        analysis = subprocess.run(
            ['ffmpeg', '-hide_banner', '-i', str(raw), '-af',
             'loudnorm=I=-22:TP=-3:LRA=7:print_format=json', '-f', 'null', '-'],
            capture_output=True, text=True, check=True,
        ).stderr
        stats = json.loads(analysis[analysis.rfind('{'):analysis.rfind('}') + 1])
        normalize = (
            'loudnorm=I=-22:TP=-3:LRA=7:linear=true:'
            f'measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}:'
            f'measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}:'
            f'offset={stats["target_offset"]}'
        )
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', normalize,
                        '-ar', str(RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-t', str(DURATION), str(output)], check=True)
    with wave.open(str(output), 'rb') as final:
        assert final.getnframes() == FRAMES
        assert final.getnchannels() == 2 and final.getframerate() == RATE
    print(json.dumps({'file': str(output), 'duration': DURATION, 'sample_rate': RATE,
                      'channels': 2, 'bpm': 96, 'target_lufs': -22, 'raw_peak': round(peak, 5)}), flush=True)


if __name__ == '__main__':
    main()
