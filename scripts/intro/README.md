# Zapstick presentation film — V4

Eight 30-second films match all site languages: fr, en, pt-BR, es, de, zh-CN,
ja and ru. Each has its own local MP4, poster and optional WebVTT captions in
`public/videos/`. The player no longer falls back to English for five languages.

## Editing and audio

The 23 shots vary from 0.8 to 2 seconds, with immediate display type, quick cuts,
short gestures and visual punch-ins. The first section imports an X link, then
trims an animated sticker. The audio section shows four sources, selection on the
real source waveform, and sound 2 snapping after sound 1.

The audible demonstration stays on the same animated sticker. Typing plays from
16.4 to 17.6 s, then the chosen added excerpt plays from 17.6 to 20.8 s without
restarting at the visual punch-in. Both the score and renderer read source start,
duration and placement from the storyboard. Actual decoded source waveforms are
used, rather than random equalizer bars. Music drops under the demonstrations.

The backing score is original, dry and percussive at 150 BPM. Its resolved ending
is composed for 30 seconds. No narration, synthetic voice or new remote media is
used. Source audio and visual attributions are in `public/videos/CREDITS.txt` and
`public/memes/SOURCES.txt`.

## Typography

Lilita One supplies the expressive Latin display face; Rubik Black covers
Cyrillic, and heavy Noto Sans JP/SC cover Japanese and Simplified Chinese.
Small renamed font subsets and complete upstream OFL licenses are in `fonts/`.
HarfBuzz shapes whole phrases into exact SVG glyph outlines in `typography.json`.
No system font or per-character approximation is used, so missing fallback fonts
cannot silently replace a script or flatten the display face.

The precomputed outlines are included. Rebuilding films needs only the existing
Node dependencies and FFmpeg. To change copy, install `fonttools` and `uharfbuzz`
in a local Python environment, run `prepare-fonts.py`, then `prepare-type.py`.
These tools check every glyph and preserve complete font license notices.

## Rebuild

```sh
python3 scripts/intro/music.py
node scripts/intro/render.mjs --audio /tmp/zapstick-intro-v4-music.wav
node scripts/intro/create-captions.mjs
```

`--locale ja` (or any supported locale) renders one edition. `--stills` writes one
representative PNG per shot and refreshes the public poster. `--preview` renders
the first 11.2 seconds into ignored `outputs/intro-v4/`. `--from 13.6 --duration
7.2` with the full score inspects the audio edit and playback.

Every pose is calculated from time, so stills, previews and the final film agree.
The film uses public local meme assets and illustrative editor objects, never a
private collection or messaging account. Output is 1280 × 720, 30 fps, 900 frames,
H.264 limited-range BT.709 yuv420p, AAC stereo and MP4 faststart. Video targets
800 kbit/s (1,100 kbit/s ceiling), plus 96 kbit/s audio, about 3.5 MB per edition.
