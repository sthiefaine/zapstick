#!/usr/bin/env python3
"""Zapstick V3: original, rhythm-led score and synthetic film sound design.

python3 scripts/intro/music.py --preview  # first 16s, /tmp/zapstick-intro-v3-preview.wav
python3 scripts/intro/music.py            # /tmp/zapstick-intro-v3-music.wav, exactly44s
python3 scripts/intro/music.py /absolute/output.wav

Stdlib synthesis + installed ffmpeg. No new downloads, sampled music or generated voices.
120 BPM; 44 seconds; image cuts every2s, impacts at cut +0.12s.
Two short audio demos reuse the credited home-page media.
Original D-major-pentatonic phrases, bouncing bass, short chord stabs, drums,
whooshes, typing and plops. Measured two-pass target -17LUFS, -1.8dBTP ceiling.
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
BEAT = .5
BAR = 2
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

    # Original harmony and phrases. No sustained ambient pads.
    chords = [
        (38, (62, 66, 69, 71)),  # D6
        (35, (59, 62, 66, 69)),  # Bm7
        (40, (59, 64, 69, 74)),  # E suspended
        (33, (57, 62, 64, 69)),  # A suspended
    ]
    lead_phrases = [
        [(0, 78), (.75, 76), (1.5, 81), (2.5, 78), (3.25, 74)],
        [(.25, 78), (1, 83), (1.75, 81), (2.5, 78), (3.5, 76)],
        [(0, 76), (.5, 78), (1.5, 81), (2.25, 83), (3.25, 81)],
        [(.25, 81), (1, 78), (2, 76), (2.75, 74), (3.5, 76)],
    ]
    response_phrases = [
        [(0, 74), (.5, 78), (1.25, 81), (2.5, 78), (3, 81)],
        [(.5, 78), (1.25, 74), (2, 71), (2.75, 74), (3.5, 78)],
        [(0, 76), (1.25, 81), (2, 83), (2.75, 81), (3.5, 76)],
        [(0, 81), (.75, 78), (1.5, 76), (2.5, 74)],
    ]
    # Import, tools, audio montage and outro each have a different rhythmic space.
    for bar in range(math.ceil(duration / BAR)):
        at = bar * BAR
        section = bar // 4
        within = bar % 4
        root, pitches = chords[within]
        if at >= DURATION - 4:
            root, pitches = chords[0]
        light = 16 <= at < 20 or 26 <= at < 30
        # Short vacuum before a chapter lands; constant ticking is avoided.
        drop_last = within == 3 and section not in (0, 5, 8, 13)
        beats = (0, 1.5, 2.5, 3.25) if within % 2 == 0 else (0, .75, 2, 3.5)
        if light:
            beats = (0, 2.5)
        if at >= DURATION - 2:
            beats = (0,)
        for j, beat in enumerate(beats):
            if drop_last and beat >= 3:
                continue
            note(at + beat * BEAT, root + (12 if j == 2 else 0), .24,
                 .104 if not light else .072, -.035, 'bass')
        # Kicks and handclaps make the film move; hats breathe with each section.
        for beat in ((0, 2) if not light else (0,)):
            if at + beat * BEAT < DURATION - 1.4:
                hit(at + beat * BEAT, .135 if not light else .09)
        if not light and at < DURATION - 2:
            for beat in (1, 3):
                if not (drop_last and beat == 3):
                    hit(at + beat * BEAT, .052, 'clap', -.07)
            for j, beat in enumerate((.5, 1.5, 2.5, 3.5)):
                if not (drop_last and beat >= 3):
                    hit(at + beat * BEAT + (.015 if j % 2 else 0),
                        .017 if j % 2 else .013, 'hat', .25)
        # Upbeat chord stabs, a different response from the melodic line.
        for beat in ((.5, 2.5) if light else (.5, 1.75, 2.5, 3.5)):
            if (drop_last and beat >= 3) or at + beat * BEAT > DURATION - 1.4:
                continue
            for p, pitch in enumerate(pitches[:3]):
                note(at + beat * BEAT, pitch + (12 if section in (4, 10, 13) else 0),
                     .24, .022, (-.35, .05, .35)[p], 'stab')
        phrase = response_phrases[within] if section % 3 == 1 else lead_phrases[within]
        if section in (3, 7, 9):
            phrase = phrase[::2]
        if at >= DURATION - 4:
            phrase = [(0, 81), (.75, 78), (1.5, 76), (2.5, 74)]
        for j, (beat, pitch) in enumerate(phrase):
            if (drop_last and beat >= 3) or at + beat * BEAT > DURATION - 1.1:
                continue
            velocity = .057 * rng.uniform(.86, 1.07)
            if light:
                velocity *= .76
            note(at + beat * BEAT + .025, pitch, .29 if j % 3 else .42,
                 velocity, -.27 if j % 2 else .27)

    # Every image cut has a short sonic articulation; major scene turns hit harder.
    for cut in range(0, duration, 2):
        major = cut in MAJOR_CUTS
        chapter = cut in MAJOR_CUTS
        if cut:
            whoosh(cut - (.23 if major else .11), .35 if major else .2,
                   .07 if major else .027, -.3 if cut % 4 else .3, major)
        if major:
            hit(cut + .12, .18, 'impact')
            for i, pitch in enumerate((74, 78, 81)):
                note(cut + .12 + i * .035, pitch, .28, .052, (i - 1) * .25, 'spark')
        elif chapter:
            hit(cut + .12, .075, 'plop', -.22)
            note(cut + .15, 81, .18, .034, .28, 'spark')
        else:
            hit(cut + .12, .018 if cut % 4 else .027, 'cut', -.18 if cut % 4 else .18)
    # Gestures: writing, emoji placement, cropping/dragging and saving.
    for start in (2.5, 4.5, 22.5, 24.5):
        for j in range(4):
            hit(start + j * .0625, .029 * rng.uniform(.7, 1), 'type', (j % 3 - 1) * .22)
    for start in (6.5, 14.5, 20.5, 28.5, 40.5):
        hit(start, .059, 'plop', -.3 if start % 2 else .3)
        note(start + .055, 83 if start < 40 else 81, .15, .025, .25, 'spark')
    for start in (2.7, 8.5, 10.5, 24.5, 30.5, 32.5, 36.5, 38.5):
        whoosh(start, .22, .045, -.4 if int(start) % 4 else .4)
    # Rises are brief, crescendoing fills, never a prolonged cinematic drone.
    for start in (7, 15, 21, 29, 35, 39):
        whoosh(start + .15, .93, .072, 0, True)
        for j, pitch in enumerate((74, 76, 78, 81, 83, 86)):
            note(start + .25 + j * .125, pitch, .15, .018 + j * .003, (j - 2.5) * .12, 'spark')
    # The export succeeds and the signature resolves, with a recognisable cadence.
    for start in (38.12, DURATION - 1.88):
        hit(start, .14, 'impact')
        for j, pitch in enumerate((62, 66, 69, 74, 78)):
            note(start + j * .035, pitch, .9, .036, (j - 2) * .15, 'lead')
    # A short stereo room, not a long ambient tail.
    delay = round(BEAT / 3 * RATE)
    for i in range(frames - 1, delay - 1, -1):
        old_left, old_right = left[i - delay], right[i - delay]
        left[i] += old_right * .075
        right[i] += old_left * .075
    # Duck the music around two real sticker sounds so the audio feature is heard.
    demos = ((16.3, 'working-cat.mp4', 2.85), (26.15, 'side-eye-dog.mp4', 3.6))
    for at, filename, length in demos:
        if at >= duration:
            continue
        # Smoothly lower only the music; the source demonstration stays clear.
        begin, end = max(0, round((at - .12) * RATE)), min(frames, round((at + length + .16) * RATE))
        for i in range(begin, end):
            t = i / RATE
            envelope = min(1, max(0, (t - at + .12) / .12), max(0, (at + length + .16 - t) / .16))
            gain = 1 - .82 * envelope
            left[i] *= gain
            right[i] *= gain
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ROOT / 'public/memes/sound' / filename),
                              '-vn', '-t', str(length), '-af', 'loudnorm=I=-17:TP=-2:LRA=7',
                              '-ar', str(RATE), '-ac', '2', '-f', 's16le', 'pipe:1'],
                             capture_output=True, check=True).stdout
        samples = array.array('h', raw)
        if sys.byteorder != 'little':
            samples.byteswap()
        start = round(at * RATE)
        count = min(len(samples) // 2, frames - start)
        for i in range(count):
            fade = min(1, i / (.015 * RATE), (count - 1 - i) / (.06 * RATE))
            left[start + i] += samples[i * 2] / 32768 * .85 * fade
            right[start + i] += samples[i * 2 + 1] / 32768 * .85 * fade
    for i in range(frames):
        t = i / RATE
        # Eight-millisecond startup avoids clicks while keeping the opening punch.
        fade = min(1, t / .008, max(0, (duration - t) / (.7 if duration ==DURATION else .12)))
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
    duration = 16 if preview else DURATION
    paths = [arg for arg in sys.argv[1:] if arg != '--preview']
    output = Path(paths[0] if paths else f'/tmp/zapstick-intro-v3-{"preview" if preview else "music"}.wav')
    output.parent.mkdir(parents=True, exist_ok=True)
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg is required for measured two-pass loudness normalization.')
    print(f'Rendering Zapstick V3: {duration}s,120 BPM, cuts2s, energetic original score + synthetic gestures.', flush=True)
    with tempfile.TemporaryDirectory(prefix='zapstick-score-v3-') as temporary:
        raw = Path(temporary) / 'score-raw.wav'
        left, right = compose(duration)
        peak = max(max(map(abs, left)), max(map(abs, right)))
        if peak >= .98:
            raise RuntimeError(f'Unexpected raw clipping risk: {peak}')
        write_wav(raw, left, right)
        del left, right
        analysis = subprocess.run(
            ['ffmpeg', '-hide_banner', '-i', str(raw), '-af',
             'loudnorm=I=-17:TP=-1.8:LRA=9:print_format=json', '-f', 'null', '-'],
            capture_output=True, text=True, check=True,
        ).stderr
        stats = json.loads(analysis[analysis.rfind('{'):analysis.rfind('}') + 1])
        normalize = (
            'loudnorm=I=-17:TP=-1.8:LRA=9:linear=true:'
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
                      'channels': 2, 'bpm':120, 'target_lufs':-17, 'raw_peak':round(peak, 5)}), flush=True)


if __name__ == '__main__':
    main()
