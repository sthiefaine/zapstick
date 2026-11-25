# Zapstick presentation film — V3

Three localized 44-second films live in `public/videos/`, with matching JPEG
posters and optional WebVTT captions. They use French, English and Brazilian
Portuguese. Every pose is calculated from its timestamp, so stills, previews and
final exports share the same animation.

The 22 two-second shots focus on the core workflow:

- 0–8 s: paste an X link and import its video.
- 8–16 s: trim the moment and make a looping animated sticker.
- 16–22 s: keep the video's original sound; hear the typing demo.
- 22–30 s: add a second sound from a file, link or microphone and place it after the first.
- 30–36 s: choose the source audio excerpt by dragging its selection.
- 36–40 s: export the animation or a video with audio.
- 40–44 s: Zapstick signature and create call to action.

Full-frame motion, camera moves, spring animation and short kinetic words are
retained. There is no explanatory column or body text burned into the image.
Only public local media and illustrative editor objects appear, never a private
collection or messaging account.

## Rebuild

Use installed Node dependencies and local FFmpeg:

```sh
python3 scripts/intro/music.py
node scripts/intro/render.mjs --audio /tmp/zapstick-intro-v3-music.wav
node scripts/intro/create-captions.mjs
```

Add `--locale fr`, `--locale en` or `--locale pt-BR` for one edition.
`node scripts/intro/render.mjs --stills` exports one representative frame per
shot and refreshes the public posters. Preview files stay in ignored
`outputs/intro-v3/`; the first 16 seconds can be rendered with:

```sh
python3 scripts/intro/music.py --preview
node scripts/intro/render.mjs --locale fr --preview --audio /tmp/zapstick-intro-v3-preview.wav
```

A later section can be inspected with `--from 22 --duration 8` and the full score.
The renderer rejects a storyboard longer than 45 seconds.

## Delivery

Each MP4 contains 1,320 frames at 30 fps, 1280 × 720, H.264 limited-range BT.709
`yuv420p`, AAC stereo and a front-loaded MP4 index (`faststart`). Video targets
650 kbit/s, with an 850 kbit/s ceiling and 80 kbit/s audio (about 4 MB per film).
The original score is 120 BPM, with impacts on cuts and a resolved ending.
Music briefly ducks under two existing home-page sticker sounds so the audio
feature can be heard. Credits and sound licenses are in `public/videos/CREDITS.txt`
and `public/memes/SOURCES.txt`. No new remote media or synthetic voice is used.
