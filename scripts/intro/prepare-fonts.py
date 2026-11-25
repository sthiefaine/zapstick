#!/usr/bin/env python3
"""Build small, renamed display-font subsets. Requires fonttools in a local venv.

The checked-in subsets are sufficient for rendering; this is only needed after
changing localized copy. Sources and complete OFL licenses are kept alongside.
"""
from pathlib import Path
import json
import urllib.request
import urllib.parse
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT = Path(__file__).resolve().parent
COPY = json.loads((ROOT / 'copy.json').read_text())
COMMON = 'zapstickXx.com/…audio.mp3GIFMP4+0123456789.,:s'
FAMILIES = {
    'display': ('lilitaone', 'LilitaOne-Regular.ttf', ['fr', 'en', 'pt-BR', 'es', 'de']),
    'cyrillic': ('rubik', 'Rubik[wght].ttf', ['ru']),
    'japanese': ('notosansjp', 'NotoSansJP[wght].ttf', ['ja']),
    'chinese': ('notosanssc', 'NotoSansSC[wght].ttf', ['zh-CN']),
}
cache = Path('/tmp/zapstick-intro-fonts')
cache.mkdir(exist_ok=True)
output = ROOT / 'fonts'
output.mkdir(exist_ok=True)
coverage = {}
for key, (directory, filename, locales) in FAMILIES.items():
    source = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{directory}/'
    cached = cache / f'{directory}-{filename}'
    if not cached.exists():
        cached.write_bytes(urllib.request.urlopen(source + urllib.parse.quote(filename)).read())
    license_file = cache / f'{directory}-OFL.txt'
    if not license_file.exists():
        license_file.write_bytes(urllib.request.urlopen(source + 'OFL.txt').read())
    (output / f'{key}-OFL.txt').write_text('\n'.join(line.rstrip() for line in license_file.read_text().splitlines()) + '\n')
    font = TTFont(cached)
    if 'fvar' in font:
        font = instantiateVariableFont(font, {'wght': 900}, inplace=True)
    text = COMMON + ''.join(value for locale in locales for value in COPY[locale].values())
    characters = {ord(char) for char in text if not char.isspace()}
    missing = characters - set(font.getBestCmap())
    if missing:
        raise RuntimeError(f'{key} missing glyphs: {sorted(chr(c) for c in missing)}')
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_languages = ['*']
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=characters | {32})
    sub.subset(font)
    # Modified font names avoid retaining any upstream Reserved Font Names.
    family = f'Zapstick Film {key.title()}'
    names = {1: family, 2: 'Regular', 3: family + '-V4', 4: family,
             6: family.replace(' ', ''), 16: family, 17: 'Regular'}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    target = output / f'{key}.ttf'
    font.save(target)
    coverage[key] = {'family': family, 'locales': locales, 'characters': ''.join(map(chr, sorted(characters))), 'source': source + urllib.parse.quote(filename)}
    print(key, target.stat().st_size, 'bytes; all glyphs covered', flush=True)
(output / 'coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + '\n')
(output / 'SOURCES.txt').write_text('\n'.join(f'{key}: {value[0]}/{value[1]}' for key, value in FAMILIES.items()) + '\nSource: https://github.com/google/fonts/tree/main/ofl\nSubsets are renamed, statically instantiated (where variable) and restricted to the film copy.\nComplete upstream SIL Open Font Licenses are provided for each font.\nFonts are used only to render the films; visitors do not download font files.\n')
