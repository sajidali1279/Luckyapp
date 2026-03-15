/**
 * Lucky Stop Printer Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * Sits between the Verifone C-store POS and the thermal receipt printer.
 * When a receipt is printed:
 *   1. Intercepts the ESC/POS data stream
 *   2. Parses receipt text to extract items + amounts + categories
 *   3. Calls the Lucky Stop API to register the receipt and get a signed QR token
 *   4. Appends a QR code footer to the print job
 *   5. Forwards the modified data to the real printer
 *
 * Mode: TCP proxy (POS → agent:9100 → real printer IP:9100)
 * For USB/Serial mode, configure comPort in config.json.
 */

'use strict';

const net       = require('net');
const fs        = require('fs');
const path      = require('path');
const axios     = require('axios');
const { parseReceiptBuffer } = require('./receipt-parser');
const { buildQrFooter }      = require('./escpos');

// ─── Load config ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌  config.json not found. Copy config.example.json to config.json and fill in your values.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const {
  storeApiKey,
  luckyStopApiUrl,
  printer: { mode = 'tcp', proxyPort = 9100, realPrinterIp, realPrinterPort = 9100, comPort, baudRate = 19200 },
  qr: { size: qrSize = 5, printStoreName = true, printMessage } = {},
} = cfg;

if (!storeApiKey || storeApiKey.startsWith('sk_store_REPLACE')) {
  console.error('❌  storeApiKey not configured in config.json');
  process.exit(1);
}

console.log(`\n🖨️  Lucky Stop Printer Agent`);
console.log(`   API : ${luckyStopApiUrl}`);
console.log(`   Mode: ${mode}`);
if (mode === 'tcp') {
  console.log(`   Proxy port : ${proxyPort}`);
  console.log(`   Real printer: ${realPrinterIp}:${realPrinterPort}`);
}

// ─── API call: get receipt QR token from Lucky Stop backend ──────────────────

async function getReceiptToken(parsed) {
  if (!parsed.items.length) return null;
  try {
    const response = await axios.post(
      `${luckyStopApiUrl}/points/receipt-token`,
      {
        txRef: parsed.txRef,
        total: parsed.total,
        items: parsed.items,
      },
      {
        headers: { 'X-Store-API-Key': storeApiKey },
        timeout: 5000,
      }
    );
    return response.data?.data ?? null;
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    console.error(`⚠️  API error getting receipt token: ${msg}`);
    return null;
  }
}

// ─── Process a complete print job ────────────────────────────────────────────

async function processJob(rawBuffer) {
  try {
    const parsed = parseReceiptBuffer(rawBuffer);
    console.log(`\n📋  Receipt parsed:`);
    console.log(`    txRef : ${parsed.txRef}`);
    console.log(`    total : $${parsed.total.toFixed(2)}`);
    console.log(`    items : ${JSON.stringify(parsed.items)}`);

    if (!parsed.items.length || parsed.total <= 0) {
      console.log('    (no reward items found — forwarding as-is)');
      return rawBuffer;
    }

    const tokenData = await getReceiptToken(parsed);
    if (!tokenData) {
      console.log('    (could not get QR token — forwarding without QR)');
      return rawBuffer;
    }

    // Rough estimated cashback (5% default, actual varies by category)
    const estimatedCashback = parseFloat((parsed.total * 0.05 * 0.96).toFixed(2));

    const footer = buildQrFooter({
      qrData: tokenData.qrData,
      storeName: printStoreName ? undefined : null,
      message: printMessage || 'Scan with Lucky Stop app to earn cashback!',
      qrSize,
      estimatedCashback,
    });

    console.log(`    ✅  QR token: ${tokenData.tokenId}`);
    console.log(`    📱  QR data : ${tokenData.qrData}`);

    return Buffer.concat([rawBuffer, footer]);
  } catch (err) {
    console.error(`⚠️  processJob error: ${err.message}`);
    return rawBuffer; // always forward original on error
  }
}

// ─── TCP Proxy Mode ───────────────────────────────────────────────────────────

function startTcpProxy() {
  if (!realPrinterIp) {
    console.error('❌  printer.realPrinterIp not set in config.json');
    process.exit(1);
  }

  const server = net.createServer((posSocket) => {
    console.log(`\n🔌  POS connected from ${posSocket.remoteAddress}`);

    const printerSocket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let flushTimer = null;

    posSocket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      // Debounce: wait 200ms of silence before treating as complete job
      clearTimeout(flushTimer);
      flushTimer = setTimeout(async () => {
        if (buffer.length === 0) return;
        const job = buffer;
        buffer = Buffer.alloc(0);

        const modified = await processJob(job);

        if (printerSocket.writable) {
          printerSocket.write(modified);
        }
      }, 200);
    });

    posSocket.on('end', () => {
      console.log('   POS disconnected');
      printerSocket.end();
    });

    posSocket.on('error', (err) => {
      console.error(`POS socket error: ${err.message}`);
      printerSocket.destroy();
    });

    printerSocket.connect(realPrinterPort, realPrinterIp, () => {
      console.log(`   Connected to real printer at ${realPrinterIp}:${realPrinterPort}`);
    });

    printerSocket.on('data', (d) => posSocket.write(d)); // printer → POS (status responses)
    printerSocket.on('error', (err) => {
      console.error(`Printer socket error: ${err.message}`);
      posSocket.destroy();
    });
    printerSocket.on('end', () => posSocket.end());
  });

  server.listen(proxyPort, '0.0.0.0', () => {
    console.log(`\n✅  TCP proxy listening on port ${proxyPort}`);
    console.log(`   Point the Verifone POS printer IP to this machine's IP, port ${proxyPort}`);
    console.log(`   This machine's IPs: ${getLocalIps().join(', ')}\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌  Port ${proxyPort} is already in use. Check if another agent is running.`);
    } else {
      console.error(`Server error: ${err.message}`);
    }
    process.exit(1);
  });
}

// ─── USB/Serial Mode ──────────────────────────────────────────────────────────

function startSerialProxy() {
  try {
    const { SerialPort } = require('serialport');
    const port = new SerialPort({ path: comPort, baudRate, autoOpen: true });
    let buffer = Buffer.alloc(0);
    let flushTimer = null;

    port.on('open', () => console.log(`✅  Serial port ${comPort} opened at ${baudRate} baud`));
    port.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      clearTimeout(flushTimer);
      flushTimer = setTimeout(async () => {
        if (buffer.length === 0) return;
        const job = buffer;
        buffer = Buffer.alloc(0);
        const modified = await processJob(job);
        port.write(modified, (err) => {
          if (err) console.error(`Serial write error: ${err.message}`);
        });
      }, 200);
    });
    port.on('error', (err) => console.error(`Serial error: ${err.message}`));
  } catch {
    console.error('❌  serialport package not installed. Run: npm install serialport');
    process.exit(1);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocalIps() {
  const os = require('os');
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
}

// ─── Start ────────────────────────────────────────────────────────────────────

if (mode === 'usb' || mode === 'serial') {
  startSerialProxy();
} else {
  startTcpProxy();
}

process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception: ${err.message}`);
});
