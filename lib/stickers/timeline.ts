export const MAX_ANIMATION_SECONDS = 6;
export type TrimSelection = { start: number; duration: number };
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function normalizeTrim(total: number, start: number, duration: number): TrimSelection {
 total = Math.max(0, finite(total));
 if (!total) return { start: 0, duration: 0 };
 const minimum = Math.min(.1, total);
 const length = clamp(finite(duration, minimum), minimum, Math.min(MAX_ANIMATION_SECONDS, total));
 return { start: clamp(finite(start), 0, Math.max(0, total - length)), duration: length };
}
export function moveTrimHandle(total: number, selection: TrimSelection, edge: 'start' | 'end', value: number): TrimSelection {
 const current = normalizeTrim(total, selection.start, selection.duration);
 if (!current.duration) return current;
 const minimum = Math.min(.1, total);
 if (edge === 'start') {
  const start = clamp(finite(value), 0, total - minimum);
  const end = clamp(current.start + current.duration, start + minimum, Math.min(total, start + MAX_ANIMATION_SECONDS));
  return { start, duration: end - start };
 }
 const end = clamp(finite(value), minimum, total);
 const start = clamp(current.start, Math.max(0, end - MAX_ANIMATION_SECONDS), end - minimum);
 return { start, duration: end - start };
}
export function gifFrameDelay(milliseconds: number | undefined): number {
 return Math.max(20, finite(milliseconds ?? 0) || 100);
}
export function gifFrameTimings(delays: (number | undefined)[]): { ends: number[]; duration: number } {
 let elapsed = 0;
 const ends = delays.map(delay => (elapsed += gifFrameDelay(delay)) / 1000);
 return { ends, duration: elapsed / 1000 };
}
export function frameIndexAt(ends: number[], time: number): number {
 if (!ends.length) return -1;
 let low = 0, high = ends.length - 1;
 while (low < high) { const middle = (low + high) >>> 1; if (ends[middle] > time) high = middle; else low = middle + 1; }
 return low;
}
export function formatTimelineTime(time: number): string {
 const value = Math.round(Math.max(0, finite(time)) * 10) / 10, minutes = Math.floor(value / 60);
 return `${minutes}:${(value % 60).toFixed(1).padStart(4, '0')}`;
}
