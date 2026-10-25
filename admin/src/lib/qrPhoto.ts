// Reads a customer's Lucky Stop QR code out of a photo (the Grant & Redeem page, 2026-10-15): an employee with no phone photographs the
// QR on the customer's screen and sends it to HQ. jsQR is loaded only when a photo is read, so the rest of the admin does not carry it.
// A photo of a phone screen is often large, tilted or glary: it is tried at a few sizes, light-on-dark as well, before giving up.

// Customer QR codes are plain UUIDs, the same check as the cashier's app (mobile/app/(employee)/scan.tsx)
const CUSTOMER_QR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isCustomerQr = (text: string) => CUSTOMER_QR.test(text.trim());

export type QrRead = { kind: 'customer'; code: string } | { kind: 'other'; text: string } | { kind: 'none' };

export async function readQrPhoto(file: Blob): Promise<QrRead> {
  const jsQR = (await import('jsqr')).default;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { kind: 'none' };
    const side = Math.max(bitmap.width, bitmap.height);
    const scales = [...new Set([1600, 1000, 640, 2400].map((px) => Math.min(1, px / side)))];   // never larger than the photo
    for (const scale of scales) {
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      const text = found?.data?.trim();
      if (text) return isCustomerQr(text) ? { kind: 'customer', code: text } : { kind: 'other', text };
    }
    return { kind: 'none' };
  } finally {
    bitmap.close();
  }
}
