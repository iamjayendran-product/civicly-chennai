import 'server-only';
import sharp from 'sharp';

/** GCC's complaint form rejects photos of 1 MB or more. */
export const GCC_MAX_IMAGE_BYTES = 1_000_000;

const ATTEMPTS = [
  { width: 1600, quality: 80 },
  { width: 1280, quality: 70 },
  { width: 1024, quality: 60 },
  { width: 800, quality: 50 },
];

/** The report photo as a JPEG data: URL under GCC's limit (it is already EXIF-stripped and
 * blurred on the reporter's device; this only shrinks it if needed). */
export async function toGccImageDataUrl(bytes: Uint8Array): Promise<string> {
  let jpeg = Buffer.from(bytes);
  for (const { width, quality } of ATTEMPTS) {
    if (jpeg.length <= GCC_MAX_IMAGE_BYTES) break;
    jpeg = await sharp(bytes).resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  }
  if (jpeg.length > GCC_MAX_IMAGE_BYTES) throw new Error('Photo could not be shrunk under 1 MB');
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}
