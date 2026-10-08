import { Dimensions, PixelRatio } from 'react-native';

// Photos are kept on Cloudinary at the size they were taken (a phone photo is about 4000 px wide), and a card shows them a few
// hundred points wide. Asking Cloudinary for the size on screen saves the download and the memory of decoding a huge bitmap
// (Google Play's "bitmap image optimization"). c_limit never enlarges a small image; f_auto and q_auto pick WebP or AVIF and a
// sensible quality. Anything that is not a plain Cloudinary upload URL (a signed or private one, a local file) is left as it is.
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/** The image at `widthDp` points wide (default: the screen width), in device pixels, at most 2000 px. */
export function sized(url: string | null | undefined, widthDp?: number): string | undefined {
  if (!url) return undefined;
  const m = url.match(CLOUDINARY_UPLOAD);
  if (!m) return url;
  const rest = m[2];
  // Already transformed (the first path part is not the version "v123..." or a folder name) or signed ("s--abc--"): leave it
  if (rest.startsWith('s--') || /^[a-z]{1,3}_[^/]*\//.test(rest)) return url;
  const px = Math.min(2000, Math.round((widthDp ?? Dimensions.get('window').width) * PixelRatio.get()));
  return `${m[1]}c_limit,w_${px},f_auto,q_auto/${rest}`;
}
