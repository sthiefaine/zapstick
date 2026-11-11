import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

async function moduleFromTS(path) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const {normalizeTextStyle, normalizeEmojis, normalizeEmoji, createEmoji, moveEmoji, layoutText, paintOverlays, MAX_EMOJIS} = await moduleFromTS('../lib/stickers/overlays.ts');

function context() {
  const calls = [];
  const ctx = {font: '44px Arial', calls,
    measureText(text) {return {width: Array.from(text).length * Number(this.font.match(/([\d.]+)px/)[1]) * .6};},
    save() {calls.push(['save']);}, restore() {calls.push(['restore']);},
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
    fill() {calls.push(['background', this.fillStyle]);},
    strokeText(text, x, y) {calls.push(['strokeText', text, x, y, this.font, this.strokeStyle]);},
    fillText(text, x, y) {calls.push(['fillText', text, x, y, this.font, this.fillStyle]);},
  };
  return ctx;
}

test('emoji geometry stays on the canvas after dragging and resizing; malformed entries cannot exceed the limit', () => {
  const emoji = normalizeEmoji({id: 'a', emoji: '❤️', x: -1000, y: 9000, size: 500});
  assert.deepEqual(emoji, {id: 'a', emoji: '❤️', x: 80, y: 432, size: 160});
  assert.deepEqual(moveEmoji(emoji, 999, -999), {...emoji, x: 432, y: 80});
  assert.equal(normalizeEmoji({id: 'text', emoji: '🔥', size: 80}), null);
  assert.equal(normalizeEmoji({id: 'bad', emoji: '<script>', size: 80}), null);
  const items = normalizeEmojis(Array.from({length: 12}, (_, index) => ({id: String(index), emoji: '😂', size: NaN, x: Infinity, y: 0})));
  assert.equal(items.length, MAX_EMOJIS);
  assert.ok(items.every(item => Number.isFinite(item.x) && item.x >= item.size / 2 && item.y >= item.size / 2));
  assert.equal(createEmoji('👍', items), null);
  assert.equal(normalizeEmojis([emoji, emoji]).length, 1);
});

test('custom emoji preserves a whole native grapheme and rejects text before an emoji', () => {
  for (const value of ['🧑🏽‍🚀', '👩‍👩‍👧‍👦', '🇧🇷', '1️⃣', '❤️']) {
    const item = createEmoji(`${value}😊`);
    assert.ok(item);
    assert.equal(item.emoji, value);
  }
  for (const value of ['', 'Bonjour😊', ' 😊', '<img>', '123']) assert.equal(createEmoji(value), null);
  const item = createEmoji('🪩');
  assert.equal(item.emoji, '🪩');
  assert.equal(item.x, 256);assert.equal(item.y, 256);
});

test('all three system fonts wrap long text and keep the full block within the export area', () => {
  for (const font of ['sans', 'serif', 'mono']) {
    const style = normalizeTextStyle({font, size: 96, x: -20, y: 900, color: 'bad', background: 'url(invalid)'});
    assert.equal(style.color, '#ffffff');assert.equal(style.background, 'transparent');
    const layout = layoutText(context(), {text: 'Un texte très long pour vérifier le cadrage et les retours à la ligne, même au bord du sticker.', textStyle: style});
    assert.ok(layout.lines.length > 1);
    assert.ok(layout.x - layout.width / 2 >= 3.99);
    assert.ok(layout.x + layout.width / 2 <= 508.01);
    assert.ok(layout.y - layout.height / 2 >= 3.99);
    assert.ok(layout.y + layout.height / 2 <= 508.01);
    assert.ok(layout.fontSize > 0 && layout.fontSize <= 96);
  }
});

test('the painter uses the shared layout and identical emoji coordinates on every frame', () => {
  const options = {text: 'Salut', textStyle: {font: 'mono', color: '#ffffff', background: '#17251c', x: 140, y: 160}, emojis: [{id: 'a', emoji: '🔥', x: 390, y: 100, size: 72}]};
  const first = context(), second = context(), layout = layoutText(context(), options);
  paintOverlays(first, options);paintOverlays(second, options);
  assert.deepEqual(first.calls, second.calls);
  assert.deepEqual(first.calls.find(call => call[0] === 'background'), ['background', '#17251c']);
  const text = first.calls.find(call => call[0] === 'fillText' && call[1] === 'Salut');
  assert.equal(text[2], layout.x);assert.equal(text[3], layout.y);assert.match(text[4], /Courier New/);
  const emoji = first.calls.find(call => call[0] === 'fillText' && call[1] === '🔥');
  assert.equal(emoji[2], 390);assert.equal(emoji[3], 100);
  assert.equal(first.calls[0][0], 'save');assert.equal(first.calls.at(-1)[0], 'restore');
});

test('transparent and low-contrast text gets a contrasting outline; empty overlays do not paint text', () => {
  for (const background of ['transparent', '#ffffff']) {
    const ctx = context();paintOverlays(ctx, {text: 'Lisible', textStyle: {color: '#ffffff', background}});
    assert.ok(ctx.calls.some(call => call[0] === 'strokeText' && call[5] === '#17251c'));
  }
  const ctx = context();paintOverlays(ctx, {text: '  ', emojis: []});
  assert.ok(!ctx.calls.some(call => call[0] === 'fillText'));
});

test('overlay copy is translated for every supported language and preserves interpolation tokens', async () => {
  const {overlaySources, overlayTranslations} = await moduleFromTS('../lib/i18n/overlay-translations.ts');
  for (const locale of ['fr', 'en', 'pt-BR', 'es', 'de', 'zh-CN', 'ja', 'ru']) {
    assert.equal(Object.keys(overlayTranslations[locale]).length, overlaySources.length);
    for (const source of overlaySources) {
      const translated = overlayTranslations[locale][source];
      assert.ok(translated);
      assert.deepEqual(translated.match(/\{\w+\}/g) ?? [], source.match(/\{\w+\}/g) ?? []);
    }
  }
});
