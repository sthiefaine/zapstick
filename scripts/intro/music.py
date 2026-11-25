#!/usr/bin/env python3
"""Zapstick V4: original, rhythm-led score and synthetic film sound design.

python3 scripts/intro/music.py --preview  # first 11.2s, /tmp/zapstick-intro-v4-preview.wav
python3 scripts/intro/music.py            # /tmp/zapstick-intro-v4-music.wav, exactly30s
python3 scripts/intro/music.py /absolute/output.wav

Stdlib synthesis + installed ffmpeg. No new downloads, sampled music or generated voices.
150 BPM; 30 seconds; 23 varied shots with immediate cut impacts.
Three short audio demos reuse the credited home-page media.
Original syncopated bass, short chord stabs, dry drums,
whooshes, typing and plops. Measured two-pass target -16LUFS, -1.8dBTP ceiling.
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
ROOT = Path(__file__).resolve().parents[2]
STORYBOARD = json.loads((ROOT / 'scripts/intro/storyboard.json').read_text())
DURATION = STORYBOARD['duration']
BEAT = 60 / STORYBOARD['bpm']
BAR = BEAT * 4
TAU = math.tau
SEED = 0x5A70572C
MAJOR_CUTS = tuple(scene['start'] for scene in STORYBOARD['scenes'])


def hz(midi: int) -> float:
    return 440 * 2 ** ((midi - 69) / 12)


def compose(duration: int) -> tuple[array.array, array.array]:
    frames = round(duration * RATE)
    left = array.array('f', [0]) * frames
    right = array.array('f', [0]) * frames
    rng = random.Random(SEED)
    sin, exp = math.sin, math.exp

    def gains(gain: float, pan: float) -> tuple[float, float]:
        return gain * math.sqrt((1 - pan) / 2), gain * math.sqrt((1 + pan) / 2)

    def note(at: float, midi: int, length: float, gain: float, pan: float = 0,
             voice: str = 'lead') -> None:
        start = max(0, round(at * RATE))
        count = min(round(length * RATE), frames - start)
        if count <= 0:
            return
        step = TAU * hz(midi) / RATE
        gl, gr = gains(gain, pan)
        for i in range(count):
            t = i / RATE
            phase = step * i
            release = min(1, max(0, (length - t) / .025))
            if voice == 'bass':
                envelope = (1 - exp(-t / .004)) * exp(-t / .12) * release
                value = envelope * (sin(phase) + .24 * sin(phase * 2) + .10 * sin(phase * 3))
            elif voice == 'stab':
                envelope = (1 - exp(-t / .004)) * exp(-t / .105) * release
                value = envelope * (sin(phase) + .24 * sin(phase * 3) + .06 * sin(phase * 5))
            elif voice == 'spark':
                envelope = (1 - exp(-t / .002)) * exp(-t / .095) * release
                value = envelope * (sin(phase) + .12 * sin(phase * 2))
            else:
                envelope = (1 - exp(-t / .003)) * exp(-t / .16) * release
                value = envelope * (sin(phase) + .22 * sin(phase * 2) + .065 * sin(phase * 3))
            left[start + i] += value * gl
            right[start + i] += value * gr

    def hit(at: float, gain: float, kind: str = 'kick', pan: float = 0,
            length: float | None = None) -> None:
        length = length or {'kick': .28, 'clap': .12, 'hat': .045,
                            'impact': .34, 'plop': .14, 'type': .035,
                            'cut': .065}.get(kind, .1)
        start = max(0, round(at * RATE))
        count = min(round(length * RATE), frames - start)
        if count <= 0:
            return
        gl, gr = gains(gain, pan)
        phase = low = old = 0.0
        for i in range(count):
            t = i / RATE
            noise = rng.uniform(-1, 1)
            low += .22 * (noise - low)
            high = noise - old
            old = noise
            attack = min(1, t / .001)
            if kind in ('kick', 'impact'):
                phase += TAU * (45 + (105 if kind == 'impact' else 74) * exp(-t / .022)) / RATE
                value = sin(phase) * exp(-t / (.085 if kind == 'impact' else .059))
                value += .19 * high * exp(-t / .006)
                if kind == 'impact':
                    value += .22 * low * exp(-t / .065)
            elif kind == 'clap':
                envelope = sum(exp(-max(0, t - offset) / .025) if t >= offset else 0
                               for offset in (0, .011, .023))
                value = (high * .32 + low * .8) * envelope
            elif kind == 'hat':
                value = high * .5 * exp(-t / .009)
            elif kind == 'plop':
                phase += TAU * (150 + 570 * exp(-t / .025)) / RATE
                value = (sin(phase) + .12 * sin(phase * 2)) * exp(-t / .031)
            elif kind == 'type':
                value = (.5 * low + .25 * sin(TAU * 1430 * t)) * exp(-t / .006)
            else:
                value = (.5 * high + .35 * sin(TAU * 480 * t)) * exp(-t / .012)
            value *= attack * min(1, max(0, (length - t) / .012))
            left[start + i] += value * gl
            right[start + i] += value * gr

    def whoosh(at: float, length: float, gain: float, pan: float = 0,
               rise: bool = False) -> None:
        start = max(0, round(at * RATE))
        count = min(round(length * RATE), frames - start)
        if count <= 0:
            return
        gl, gr = gains(gain, pan)
        low = previous = phase = 0.0
        for i in range(count):
            t = i / RATE
            u = t / length
            noise = rng.uniform(-1, 1)
            low += (.06 + .26 * u) * (noise - low)
            band = low - previous
            previous = low
            envelope = (u ** 1.6 if rise else sin(math.pi * u) ** 1.4)
            envelope *= min(1, (length - t) / .008)
            phase += TAU * (220 + 950 * u * u) / RATE
            value = envelope * (band * 1.8 + .12 * sin(phase))
            left[start + i] += value * gl
            right[start + i] += value * gr

    # A tighter 150 BPM beat: syncopated bass, dry drums and short chord hits.
    # No long pads or bell melody. Every cut is articulated on the same grid.
    roots = (38, 35, 40, 33)
    for bar in range(math.ceil(duration / BAR)):
        at = bar * BAR
        root = roots[bar % 4]
        for beat in (0, .75, 2, 2.75):
            hit(at + beat * BEAT, .18, 'kick')
        for beat in (1, 3):
            hit(at + beat * BEAT, .085, 'clap', -.08)
        for step in range(8):
            hit(at + step * BEAT / 2, .025 if step % 2 else .017, 'hat', .22 if step % 2 else -.22)
        for i, beat in enumerate((0, .75, 1.5, 2, 2.75, 3.5)):
            note(at + beat * BEAT, root + (12 if i in (2, 5) else 0), .17, .13, 0, 'bass')
        for beat in (.5, 2.5, 3.5):
            for i, interval in enumerate((24, 28, 31)):
                note(at + beat * BEAT, root + interval, .12, .028, (i - 1) * .28, 'stab')
        if bar % 2:
            for i, pitch in enumerate((74, 78, 81)):
                note(at + (.25 + i * .5) * BEAT, pitch, .15, .035, (i - 1) * .2, 'lead')
    for index, shot in enumerate(STORYBOARD['shots']):
        cut = shot['start']
        if cut >= duration:
            continue
        major = cut in MAJOR_CUTS
        if cut:
            whoosh(max(0, cut - .09), .15, .045 if major else .027, -.35 if index % 2 else .35)
        hit(cut + .025, .16 if major else .045, 'impact' if major else 'plop')
    for start in (1.1, 2.25, 6.25, 11.75, 12.7, 14.0, 15.65, 22.85, 23.95):
        for j in range(3):
            hit(start + j * .045, .027, 'type', (j - 1) * .15)
    # The signature lands decisively, with a short resolved final chord.
    for start in (26.4, 28.0, 29.2):
        hit(start + .02, .16, 'impact')
        for i, pitch in enumerate((62, 66, 69, 74)):
            note(start + .02 + i * .025, pitch, .38, .035, (i - 1.5) * .12, 'stab')
    # A short stereo room, not a long ambient tail.
    delay = round(BEAT / 3 * RATE)
    for i in range(frames - 1, delay - 1, -1):
        old_left, old_right = left[i - delay], right[i - delay]
        left[i] += old_right * .075
        right[i] += old_left * .075
    # Audio edit and real demonstration use the exact same source/placement data.
    # The second sound continues across the visual punch-in; it never restarts.
    for demo in STORYBOARD['audio']['demos']:
        at, filename, length = demo['at'], demo['media'], demo['duration']
        if at >= duration:
            continue
        begin, end = max(0, round((at - .06) * RATE)), min(frames, round((at + length + .08) * RATE))
        for i in range(begin, end):
            t = i / RATE
            envelope = min(1, max(0, (t - at + .06) / .06), max(0, (at + length + .08 - t) / .08))
            gain = 1 - .94 * envelope
            left[i] *= gain
            right[i] *= gain
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(demo['start']), '-i', str(ROOT / 'public/memes/sound' / filename),
                              '-vn', '-t', str(length), '-af', 'loudnorm=I=-16:TP=-2:LRA=7',
                              '-ar', str(RATE), '-ac', '2', '-f', 's16le', 'pipe:1'],
                             capture_output=True, check=True).stdout
        samples = array.array('h', raw)
        if sys.byteorder != 'little':
            samples.byteswap()
        start = round(at * RATE)
        count = min(len(samples) // 2, frames - start)
        for i in range(count):
            fade = min(1, i / (.008 * RATE), (count - 1 - i) / (.035 * RATE))
            left[start + i] += samples[i * 2] / 32768 * .9 * fade
            right[start + i] += samples[i * 2 + 1] / 32768 * .9 * fade
    for i in range(frames):
        t = i / RATE
        # Eight-millisecond startup avoids clicks while keeping the opening punch.
        fade = min(1, t / .008, max(0, (duration - t) / (.25 if duration ==DURATION else .10)))
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
    preview = '--preview' in sys.argv
    duration = 11.2 if preview else DURATION
    paths = [arg for arg in sys.argv[1:] if arg != '--preview']
    output = Path(paths[0] if paths else f'/tmp/zapstick-intro-v4-{"preview" if preview else "music"}.wav')
    output.parent.mkdir(parents=True, exist_ok=True)
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg is required for measured two-pass loudness normalization.')
    print(f'Rendering Zapstick V4: {duration}s,150 BPM, 23 fast shots, energetic original score + synthetic gestures.', flush=True)
    with tempfile.TemporaryDirectory(prefix='zapstick-score-v4-') as temporary:
        raw = Path(temporary) / 'score-raw.wav'
        left, right = compose(duration)
        peak = max(max(map(abs, left)), max(map(abs, right)))
        if peak >= .98:
            raise RuntimeError(f'Unexpected raw clipping risk: {peak}')
        write_wav(raw, left, right)
        del left, right
        analysis = subprocess.run(
            ['ffmpeg', '-hide_banner', '-i', str(raw), '-af',
             'loudnorm=I=-16:TP=-1.8:LRA=9:print_format=json', '-f', 'null', '-'],
            capture_output=True, text=True, check=True,
        ).stderr
        stats = json.loads(analysis[analysis.rfind('{'):analysis.rfind('}') + 1])
        normalize = (
            'loudnorm=I=-16:TP=-1.8:LRA=9:linear=true:'
            f'measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}:'
            f'measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}:'
            f'offset={stats["target_offset"]}'
        )
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', normalize,
                        '-ar', str(RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-t', str(duration), str(output)], check=True)
    with wave.open(str(output), 'rb') as final:
        assert final.getnframes() == round(duration * RATE)
        assert final.getnchannels() == 2 and final.getframerate() == RATE
    print(json.dumps({'file': str(output), 'duration': duration, 'sample_rate': RATE,
                      'channels': 2, 'bpm':150, 'target_lufs':-16, 'raw_peak':round(peak, 5)}), flush=True)


if __name__ == '__main__':
    main()
