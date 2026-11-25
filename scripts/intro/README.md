# Zapstick presentation film — V2

Three localized, two-minute films are served from `public/videos/`, with matching
JPEG posters and optional WebVTT tracks:

- `zapstick-intro-fr.mp4`
- `zapstick-intro-en.mp4`
- `zapstick-intro-pt-br.mp4`

The 120-second storyboard contains fifteen eight-second chapters, each split
into four two-second camera shots. The film fills the frame with animated local
memes, physical-looking cards, short kinetic words, projected perspective,
springs, camera moves and gesture close-ups. No static explanatory column or
body copy is burned into the image. The official Zapstick mark is reused.

Every pose is calculated from its timestamp, rather than accumulated between
frames. The preview, stills, scrubbing and final render therefore use the exact
same animation. Only public local assets and illustrative UI objects appear;
there is no recording of a private collection, account or messaging app.

## Rebuild

Use the project's installed Node dependencies and a local FFmpeg executable.

```sh
python3 scripts/intro/music.py
node scripts/intro/render.mjs --audio /tmp/zapstick-intro-v2-music.wav
node scripts/intro/create-captions.mjs
```

To render only one language, add `--locale fr`, `--locale en`, or `--locale pt-BR`.

## Check the rhythm before a full render

```sh
python3 scripts/intro/music.py --preview
node scripts/intro/render.mjs --locale fr --preview --audio /tmp/zapstick-intro-v2-preview.wav
node scripts/intro/render.mjs --locale fr --preview --stills
```

This writes a real 16-second MP4 and eight representative shot images into the
ignored `outputs/intro-v2/` directory. It does not replace the public full films.
Other sections can be inspected without rendering the whole film:

```sh
node scripts/intro/render.mjs --locale fr --from 64 --duration 16
node scripts/intro/render.mjs --stills
```

The latter command writes one image per two-second shot for all three languages,
and refreshes the public posters. There are 60 shots per language.

## Delivery profile

Each complete MP4 contains 3,600 frames at 30 fps, 1280 × 720, H.264 in explicit
limited-range BT.709 `yuv420p`, AAC stereo music and a front-loaded MP4 index
(`faststart`). Video targets 650 kbit/s, with an 850 kbit/s ceiling and 80 kbit/s
audio, aiming below 12 MB for two minutes.

The original soundtrack is 120 BPM, with image cuts every two seconds, impacts
at each cut plus 0.12 seconds, larger chapter accents, synthesized pop percussion,
whooshes, plops and typing. No sampled music, voice-over or downloaded recording
is used. Its reproducible score is in `music.py`.

Existing meme sources and individual-media credits remain in
`public/memes/SOURCES.txt`; public film credits are in `public/videos/CREDITS.txt`.
