/** Overlay geometry uses the exported 512 × 512 canvas, independent of viewport size. */
export const OVERLAY_CANVAS_SIZE = 512;
export const MAX_EMOJIS = 8;
export const MAX_TEXT_LENGTH = 120;
export type OverlayFont = 'sans' | 'serif' | 'mono';
export type TextStyle = {
  font: OverlayFont;
  color: string;
  background: string;
  size: number;
  x: number;
  y: number;
};
export type EmojiOverlay = {id: string; emoji: string; x: number; y: number; size: number};
/** Extend EditOptions with the optional fields; its existing `text` field stays unchanged. */
export type OverlayOptions = {text?: string; textStyle?: Partial<TextStyle>; emojis?: readonly EmojiOverlay[]};
export type OverlaySelection = 'text' | string | null;

export const OVERLAY_FONTS: Record<OverlayFont, {family: string; weight: number}> = {
  sans: {family: 'Arial, "Helvetica Neue", sans-serif', weight: 900},
  serif: {family: 'Georgia, "Times New Roman", serif', weight: 700},
  mono: {family: '"Courier New", monospace', weight: 700},
};
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
export const DEFAULT_TEXT_STYLE: Readonly<TextStyle> = {
  font: 'sans', color: '#ffffff', background: 'transparent', size: 44, x: 256, y: 440,
};
export const OVERLAY_COLORS = ['#ffffff', '#17251c', '#fce65c', '#ef6351', '#57a4ff', '#a98aff'] as const;
export const EMOJI_CHOICES = [
  {emoji: '😂', label: 'Rire'}, {emoji: '❤️', label: 'Cœur'},
  {emoji: '🔥', label: 'Feu'}, {emoji: '✨', label: 'Étincelles'},
  {emoji: '😍', label: 'Amoureux'}, {emoji: '😭', label: 'Larmes'},
  {emoji: '👍', label: 'Pouce levé'}, {emoji: '🎉', label: 'Fête'},
  {emoji: '💀', label: 'Crâne'}, {emoji: '😎', label: 'Lunettes de soleil'},
  {emoji: '🤝', label: 'Poignée de main'}, {emoji: '🤔', label: 'Réflexion'},
] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export const overlayColor = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

export function normalizeTextStyle(value?: Partial<TextStyle>): TextStyle {
  return {
    font: value?.font && Object.hasOwn(OVERLAY_FONTS, value.font) ? value.font : DEFAULT_TEXT_STYLE.font,
    color: overlayColor(value?.color, DEFAULT_TEXT_STYLE.color),
    background: value?.background === 'transparent' ? 'transparent' : overlayColor(value?.background, DEFAULT_TEXT_STYLE.background),
    size: clamp(finite(value?.size, DEFAULT_TEXT_STYLE.size), 24, 96),
    x: clamp(finite(value?.x, DEFAULT_TEXT_STYLE.x), 24, 488),
    y: clamp(finite(value?.y, DEFAULT_TEXT_STYLE.y), 24, 488),
  };
}

function firstEmoji(value: string): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 32);
  const segment = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(cleaned)[Symbol.iterator]().next().value?.segment
    : Array.from(cleaned)[0];
  return segment && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(segment) ? segment : '';
}

export function normalizeEmoji(value: EmojiOverlay): EmojiOverlay | null {
  const emoji = typeof value.emoji === 'string' ? firstEmoji(value.emoji) : '';
  if (!emoji || !value.id || value.id === 'text') return null;
  const size = clamp(finite(value.size, 80), 32, 160), margin = size / 2;
  return {id: String(value.id).slice(0, 100), emoji, size,
    x: clamp(finite(value.x, 256), margin, 512 - margin),
    y: clamp(finite(value.y, 256), margin, 512 - margin)};
}

export function normalizeEmojis(values: readonly EmojiOverlay[] = []): EmojiOverlay[] {
  const result: EmojiOverlay[] = [], ids = new Set<string>();
  for (const value of values) {
    const emoji = normalizeEmoji(value);
    if (emoji && !ids.has(emoji.id)) { result.push(emoji); ids.add(emoji.id); }
    if (result.length === MAX_EMOJIS) break;
  }
  return result;
}

export function createEmoji(emoji: string, existing: readonly EmojiOverlay[] = []): EmojiOverlay | null {
  if (existing.length >= MAX_EMOJIS) return null;
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `emoji-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const offset = Math.min(existing.length, 4) * 16;
  return normalizeEmoji({id, emoji, x: 256 + offset, y: 256 + offset, size: 80});
}

export function moveEmoji(value: EmojiOverlay, x: number, y: number): EmojiOverlay {
  return normalizeEmoji({...value, x, y}) ?? value;
}

type TextMeasurer = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;
export type TextLayout = {
  lines: string[]; x: number; y: number; width: number; height: number;
  font: string; fontSize: number; lineHeight: number; padding: number; style: TextStyle;
};

/** Shared by the preview and export: wrapping, font metrics and bounds are identical. */
export function layoutText(ctx: TextMeasurer, options: OverlayOptions): TextLayout | null {
  const text = (options.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, MAX_TEXT_LENGTH);
  if (!text.trim()) return null;
  const style = normalizeTextStyle(options.textStyle), font = OVERLAY_FONTS[style.font];
  const fontSize = style.size, padding = Math.max(8, Math.round(fontSize * .2));
  const maxWidth = 464 - 2 * padding;
  const canvasFont = `${font.weight} ${fontSize}px ${font.family}`;
  ctx.font = canvasFont;
  const lines: string[] = [];
  for (const sourceLine of text.split('\n')) {
    let line = '';
    for (const character of Array.from(sourceLine)) {
      if (line && ctx.measureText(line + character).width > maxWidth) { lines.push(line.trimEnd()); line = character.trimStart(); }
      else line += character;
    }
    lines.push(line.trimEnd());
  }
  // 120 characters at the largest font can produce several rows. Scale the block
  // down only when needed to keep the entire overlay inside the exported canvas.
  const lineHeight = fontSize * 1.18;
  const visibleLines = lines;
  const unscaledHeight = visibleLines.length * lineHeight + padding * 2;
  const scale = Math.min(1, 464 / unscaledHeight);
  const actualFontSize = fontSize * scale, actualLineHeight = lineHeight * scale, actualPadding = padding * scale;
  const width = Math.min(464, Math.max(...visibleLines.map(line => ctx.measureText(line).width), actualFontSize * .5) * scale + actualPadding * 2);
  const height = Math.min(464, unscaledHeight * scale);
  return {lines: visibleLines, x: clamp(style.x, width / 2 + 4, 508 - width / 2),
    y: clamp(style.y, height / 2 + 4, 508 - height / 2), width, height,
    font: `${font.weight} ${actualFontSize}px ${font.family}`, fontSize: actualFontSize,
    lineHeight: actualLineHeight, padding: actualPadding, style};
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();ctx.moveTo(x + r, y);ctx.lineTo(x + width - r, y);ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);ctx.quadraticCurveTo(x, y, x + r, y);ctx.closePath();ctx.fill();
}

function contrastOutline(color: string): string {
  const rgb = color.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255);
  const luminance = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * luminance[0] + .7152 * luminance[1] + .0722 * luminance[2] > .4 ? '#17251c' : '#ffffff';
}

function colorContrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const rgb = color.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + .05) / (dark + .05);
}

/** Paint after the source image, using the same canvas coordinate system for every frame. */
export function paintOverlays(ctx: CanvasRenderingContext2D, options: OverlayOptions): void {
  ctx.save();
  const text = layoutText(ctx, options);
  if (text) {
    ctx.font = text.font;ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.lineJoin = 'round';
    if (text.style.background !== 'transparent') {
      ctx.fillStyle = text.style.background;
      roundedRect(ctx, text.x - text.width / 2, text.y - text.height / 2, text.width, text.height, Math.min(14, text.fontSize * .25));
    }
    ctx.fillStyle = text.style.color;
    ctx.strokeStyle = contrastOutline(text.style.color);
    ctx.lineWidth = Math.max(2, text.fontSize * .1);
    for (let i = 0; i < text.lines.length; i++) {
      const y = text.y + (i - (text.lines.length - 1) / 2) * text.lineHeight;
      if (text.style.background === 'transparent' || colorContrast(text.style.color, text.style.background) < 4.5) ctx.strokeText(text.lines[i], text.x, y);
      ctx.fillText(text.lines[i], text.x, y);
    }
  }
  for (const emoji of normalizeEmojis(options.emojis)) {
    ctx.font = `${emoji.size * .9}px ${EMOJI_FONT}`;ctx.textAlign = 'center';ctx.textBaseline = 'middle';
    ctx.fillText(emoji.emoji, emoji.x, emoji.y);
  }
  ctx.restore();
}
