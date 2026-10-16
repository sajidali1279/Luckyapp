// Photos sent to the receipt reader (2026-10-16, Grant & Redeem): a phone photo forwarded from WhatsApp or email can be 8 MB and
// 4000 px; the reader takes 5 MB at most and reads a 2000 px receipt just as well. The original's fingerprint is what the sale's own
// receipt upload will have, so the "this photo was already used" checks look for that one.

/** SHA-256 of the file as it is, in hex (the same as the server's fingerprint of an upload). */
export async function fingerprint(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A JPEG copy no longer than `longest` px on its longest side (never larger than the photo). */
export async function shrinkPhoto(file: Blob, longest = 2000, quality = 0.86): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';   // a PNG with see-through parts reads as white paper, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return out ?? file;
  } finally {
    bitmap.close();
  }
}
