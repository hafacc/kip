/**
 * JPEG fixtures for the EXIF check: a camera-style EXIF segment spliced into a
 * JPEG, and a walk over a JPEG's marker segments.
 */

/** the string the spliced EXIF carries, so "is it gone?" is a byte search */
export const MARKER = "KIP-EXIF-PROBE";

/** an EXIF APP1 segment carrying a GPS IFD and {@link MARKER} */
export function exifSegment(): Uint8Array {
  // Little-endian TIFF, offsets from its head.
  const ifd0 = 8;
  const gps = ifd0 + 2 + 2 * 12 + 4;
  const latitude = gps + 2 + 3 * 12 + 4;
  const make = latitude + 24;
  const tiff = new DataView(new ArrayBuffer(make + 16));
  const bytes = new Uint8Array(tiff.buffer);
  const set16 = (at: number, value: number) => tiff.setUint16(at, value, true);
  const set32 = (at: number, value: number) => tiff.setUint32(at, value, true);
  const entry = (
    at: number,
    tag: number,
    type: number,
    count: number,
    value: number,
  ) => {
    set16(at, tag);
    set16(at + 2, type);
    set32(at + 4, count);
    set32(at + 8, value);
  };

  bytes.set([0x49, 0x49], 0); // "II"
  set16(2, 42);
  set32(4, ifd0);

  set16(ifd0, 2);
  entry(ifd0 + 2, 0x010f, 2, MARKER.length + 1, make); // Make
  entry(ifd0 + 14, 0x8825, 4, 1, gps); // GPSInfoIFDPointer
  set32(ifd0 + 26, 0);

  set16(gps, 3);
  entry(gps + 2, 0x0000, 1, 4, 0x00000302); // GPSVersionID 2.3.0.0
  entry(gps + 14, 0x0001, 2, 2, 0x0000004e); // GPSLatitudeRef "N"
  entry(gps + 26, 0x0002, 5, 3, latitude); // GPSLatitude
  set32(gps + 38, 0);

  for (const [at, [numerator, denominator]] of [
    [52, 1],
    [22, 1],
    [0, 1],
  ].entries()) {
    set32(latitude + at * 8, numerator);
    set32(latitude + at * 8 + 4, denominator);
  }
  bytes.set(new TextEncoder().encode(MARKER), make);

  const payload = new Uint8Array(6 + bytes.length);
  payload.set(new TextEncoder().encode("Exif\0\0"), 0);
  payload.set(bytes, 6);

  const segment = new Uint8Array(4 + payload.length);
  segment.set([
    0xff,
    0xe1,
    (payload.length + 2) >> 8,
    (payload.length + 2) & 0xff,
  ]);
  segment.set(payload, 4);
  return segment;
}

/** a JPEG with {@link exifSegment} spliced in after its start marker */
export function withExif(jpeg: Uint8Array): Uint8Array {
  const segment = exifSegment();
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

// Every segment, so "no EXIF" is checked over the whole structure rather than
// over the one segment this file happens to write.
/** the marker byte of every segment before the image data */
export function markers(jpeg: Uint8Array): number[] {
  const found: number[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1] ?? 0;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    found.push(marker);
    at += 2 + (((jpeg[at + 2] ?? 0) << 8) | (jpeg[at + 3] ?? 0));
  }
  return found;
}
