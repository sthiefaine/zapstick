#!/usr/bin/env python3
"""Shape bundled fonts into deterministic SVG outlines; no system fallback.

Requires fonttools and uharfbuzz only when copy changes. The committed JSON
lets the renderer run with its existing Node dependencies on any machine.
"""
from pathlib import Path
import json
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parent
COPY = json.loads((ROOT / 'copy.json').read_text())
FONTS = json.loads((ROOT / 'fonts/coverage.json').read_text())
EXTRA = ['zapstick', 'X', 'x.com/…', 'audio.mp3', '1', '2', '0', '0 s',
         '0.7 s', '1.2 s', '3.9 s', '4.4 s', '0,7 s', '1,2 s', '3,9 s', '4,4 s']
result = {}
for key, config in FONTS.items():
    file = ROOT / f'fonts/{key}.ttf'
    tt = TTFont(file)
    glyphs, order = tt.getGlyphSet(), tt.getGlyphOrder()
    face = hb.Face(file.read_bytes())
    font = hb.Font(face)
    hb.ot_font_set_funcs(font)
    font.scale = (face.upem, face.upem)
    outlines, bounds, layouts = {}, {}, {}
    for locale in config['locales']:
        for text in set([*COPY[locale].values(), *EXTRA]):
            if text in layouts:
                continue
            lines, widest = [], 0
            for line in text.split('\n'):
                buf = hb.Buffer()
                buf.add_str(line)
                buf.guess_segment_properties()
                hb.shape(font, buf, {'kern': True})
                parts, x = [], 0
                for info, position in zip(buf.glyph_infos, buf.glyph_positions):
                    if info.codepoint == 0:
                        raise RuntimeError(f'Missing shaped glyph: {locale}: {text}')
                    name = order[info.codepoint]
                    if name not in outlines:
                        pen = SVGPathPen(glyphs)
                        glyphs[name].draw(pen)
                        outlines[name] = pen.getCommands()
                        box = BoundsPen(glyphs)
                        glyphs[name].draw(box)
                        bounds[name] = box.bounds
                    parts.append((name, x + position.x_offset, position.y_offset))
                    x += position.x_advance
                widest = max(widest, x)
                lines.append((x, parts))
            paths, boxes = [], []
            for i, (advance, parts) in enumerate(lines):
                for name, x, y in parts:
                    x += (widest - advance) / 2
                    y = i * face.upem * 1.02 - y
                    if outlines[name]:
                        paths.append([name, x, y])
                        a, b, c, d = bounds[name]
                        boxes.append((x + a, y - d, x + c, y - b))
            left, top = min(b[0] for b in boxes), min(b[1] for b in boxes)
            right, bottom = max(b[2] for b in boxes), max(b[3] for b in boxes)
            layouts[text] = {'x': left, 'y': top, 'w': right-left, 'h': bottom-top, 'paths': paths}
    result[key] = {'locales': config['locales'], 'family': config['family'], 'glyphs': outlines, 'layouts': layouts}
    print(key, len(outlines), 'exact glyph outlines,', len(layouts), 'shaped phrases', flush=True)
(ROOT / 'typography.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
