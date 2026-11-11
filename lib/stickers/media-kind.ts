export type MediaKind = 'static' | 'animated';
/** WebP's VP8X animation bit is available in its bounded extended header. */
export function isAnimatedWebpHeader(bytes: Uint8Array): boolean {
 if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') return false;
 if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'VP8X') return false;
 return new DataView(bytes.buffer, bytes.byteOffset + 16, 4).getUint32(0, true) === 10 && !!(bytes[20] & 2);
}
/** Reads thirty bytes at most; no decoding or network is needed to classify a Blob. */
export async function inferMediaKind(blob: Blob): Promise<MediaKind> {
 if (blob.type === 'image/gif' || blob.type.startsWith('video/')) return 'animated';
 if (blob.type !== 'image/webp') return 'static';
 return isAnimatedWebpHeader(new Uint8Array(await blob.slice(0, 30).arrayBuffer())) ? 'animated' : 'static';
}
