import { validationFailed } from './errors';

/**
 * Decode and validate a PNG data-URL into bytes + intrinsic dimensions.
 * Pure input validation at the boundary: anything that isn't a real,
 * size-bounded PNG bounces with a clear message — exactly like a schema
 * failure — so a bad capture can never wedge or pollute the store.
 */

/** Hard cap per image. The viewer's pixel caps (DPR ≤2, long edge ≤1600px)
 *  keep real captures far below this; the cap is the server's own guarantee. */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DATA_URL_PREFIX = 'data:image/png;base64,';

export interface DecodedPng {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export function decodePngDataUrl(dataUrl: string): DecodedPng {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
    throw validationFailed('Attachment must be a PNG data-URL.');
  }
  const base64 = dataUrl.slice(DATA_URL_PREFIX.length);
  // Base64 length bound first, so an oversized payload is rejected before
  // any decode work: 4 base64 chars ≈ 3 bytes.
  if ((base64.length / 4) * 3 > MAX_ATTACHMENT_BYTES + 4) {
    throw validationFailed(
      `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`,
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  } catch {
    throw validationFailed('Attachment data-URL is not valid base64.');
  }
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw validationFailed(
      `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`,
    );
  }
  // Signature + IHDR: width/height are big-endian u32 at offsets 16 and 20.
  if (bytes.length < 24 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw validationFailed('Attachment bytes are not a PNG.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1) {
    throw validationFailed('Attachment PNG has degenerate dimensions.');
  }
  return { bytes, width, height };
}
