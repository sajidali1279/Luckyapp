/**
 * escpos.js
 * ESC/POS command builder for appending a QR code + text to thermal receipts.
 * Compatible with Epson, Star, Bixolon, and most Verifone-connected thermal printers.
 */

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

/** Feed N lines */
function feed(n = 1) {
  return Buffer.from([ESC, 0x64, n]);
}

/** Center align */
const CENTER = Buffer.from([ESC, 0x61, 0x01]);
/** Left align */
const LEFT   = Buffer.from([ESC, 0x61, 0x00]);
/** Bold on/off */
const BOLD_ON  = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
/** Double-height text on/off */
const DOUBLE_ON  = Buffer.from([ESC, 0x21, 0x10]);
const DOUBLE_OFF = Buffer.from([ESC, 0x21, 0x00]);
/** Cut paper (partial cut) */
const CUT = Buffer.from([GS, 0x56, 0x01]);
/** Dashes separator line */
function separator(char = '-', len = 32) {
  return Buffer.from(char.repeat(len) + '\n');
}

/**
 * Build ESC/POS QR code command block.
 * Uses GS ( k commands (model 2 QR, error correction M).
 *
 * @param {string} data   - The string to encode (e.g. "LS:RECEIPT:uuid")
 * @param {number} size   - Module size 1–16 (default 5 ≈ 2 cm)
 */
function qrCodeBlock(data, size = 5) {
  const dataBytes = Buffer.from(data, 'utf8');
  const dataLen = dataBytes.length + 3; // pL pH cn fn (data)
  const pL = dataLen & 0xff;
  const pH = (dataLen >> 8) & 0xff;

  return Buffer.concat([
    // 1. Select model: QR Code Model 2
    Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    // 2. Set module size
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size & 0xff]),
    // 3. Set error correction level: M (reliable, ~15% recovery)
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x4d]),
    // 4. Store data
    Buffer.from([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),
    dataBytes,
    // 5. Print the QR code
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
  ]);
}

/**
 * Build the full QR receipt footer to append to a receipt.
 *
 * @param {object} opts
 * @param {string} opts.qrData        - QR string e.g. "LS:RECEIPT:uuid"
 * @param {string} opts.storeName     - e.g. "Lucky Stop #5"
 * @param {string} opts.message       - Tagline printed below QR
 * @param {number} opts.qrSize        - QR module size (default 5)
 * @param {number} opts.estimatedCashback - pre-computed estimate (optional)
 */
function buildQrFooter({ qrData, storeName, message, qrSize = 5, estimatedCashback }) {
  const parts = [
    feed(1),
    CENTER,
    separator('='),
    BOLD_ON,
    Buffer.from('  Lucky Stop Rewards\n'),
    BOLD_OFF,
    separator('-'),
  ];

  if (estimatedCashback && estimatedCashback > 0) {
    parts.push(
      DOUBLE_ON,
      Buffer.from(`Earn $${estimatedCashback.toFixed(2)} cashback!\n`),
      DOUBLE_OFF,
    );
  }

  parts.push(
    feed(1),
    qrCodeBlock(qrData, qrSize),
    feed(1),
    Buffer.from((message || 'Scan with Lucky Stop app') + '\n'),
    Buffer.from('to earn your cashback points.\n'),
    feed(1),
    Buffer.from('QR expires in 15 minutes.\n'),
    separator('-'),
    feed(3),
    LEFT,
  );

  return Buffer.concat(parts);
}

module.exports = { buildQrFooter, qrCodeBlock, feed, CUT, CENTER, LEFT };
