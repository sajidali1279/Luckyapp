// Label sheets as pictures (PNG), for printing from a photo app or sending on. Each sheet is drawn by the browser itself, the same way
// it prints: the sheet's HTML is put inside an SVG <foreignObject>, loaded as an image and painted onto a canvas at 300 dots per inch.
// Nothing is fetched (the QR code is a data URI and the barcode is drawn markup), so the picture matches the printed sheet. The PNG
// says it is 300 dpi, so an app that prints at "actual size" makes it the size of the paper. Several sheets come as one .zip.

export const IMAGE_DPI = 300;
const CSS_PX_PER_IN = 96;

// ── CRC-32 (PNG chunks and zip entries both use it) ─────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Adds (or replaces) the PNG's pHYs chunk so the file says how many dots per inch it is
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Uint8Array[] = [png.subarray(0, 8)];
  let off = 8;
  let inserted = false;
  while (off < png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    const whole = png.subarray(off, off + 12 + len);
    if (type !== 'pHYs') chunks.push(whole);
    if (type === 'IHDR' && !inserted) {
      const c = new Uint8Array(21);
      const cv = new DataView(c.buffer);
      cv.setUint32(0, 9);
      c.set([0x70, 0x48, 0x59, 0x73], 4);   // "pHYs"
      cv.setUint32(8, ppm);
      cv.setUint32(12, ppm);
      c[16] = 1;                              // unit: metre
      cv.setUint32(17, crc32(c, 4, 17));
      chunks.push(c);
      inserted = true;
    }
    off += 12 + len;
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// A plain .zip (stored, not compressed: PNGs are compressed already)
export function zipFiles(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true); lv.setUint32(22, f.data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of parts) { out.set(c, p); p += c.length; }
  return out;
}

const xmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One sheet as a PNG. pageHtml is the sheet's markup; css is everything it needs; the page is widthIn x heightIn inches.
export async function renderPagePng(doc: Document, pageHtml: string, css: string, widthIn: number, heightIn: number): Promise<Uint8Array> {
  const cssW = widthIn * CSS_PX_PER_IN;
  const cssH = heightIn * CSS_PX_PER_IN;
  const w = Math.round(widthIn * IMAGE_DPI);
  const h = Math.round(heightIn * IMAGE_DPI);
  const holder = doc.createElement('div');
  holder.innerHTML = pageHtml;
  const xhtml = Array.from(holder.childNodes).map(n => new XMLSerializer().serializeToString(n)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${cssW} ${cssH}">`
    + `<foreignObject x="0" y="0" width="${cssW}" height="${cssH}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${cssW}px;height:${cssH}px;background:#fff;overflow:hidden">`
    + `<style>${xmlText(css)}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image();
  img.decoding = 'sync';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = doc.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be made.'))), 'image/png'));
  return withDpi(new Uint8Array(await blob.arrayBuffer()), IMAGE_DPI);
}

export function downloadBytes(doc: Document, bytes: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
