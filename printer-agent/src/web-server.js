/**
 * web-server.js
 * Manual mode: runs a local web UI on http://localhost:7771
 * Cashier opens this in a browser after each transaction, enters the amount
 * and category, clicks Print — agent calls Lucky Stop API and prints a QR slip
 * on the dedicated USB thermal printer.
 *
 * Printer: any ESC/POS USB thermal printer (e.g. MUNBYN ITPP941B, HPRT TP80BE,
 * or Epson TM-T20III). ~$30–50 on Amazon.
 */

'use strict';

const express = require('express');
const axios   = require('axios');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const { buildQrFooter } = require('./escpos');

const CATEGORIES = [
  { value: 'GAS',           label: '⛽  Gas' },
  { value: 'DIESEL',        label: '🚛  Diesel' },
  { value: 'HOT_FOODS',     label: '🌮  Hot Foods' },
  { value: 'GROCERIES',     label: '🛒  Groceries' },
  { value: 'FROZEN_FOODS',  label: '🧊  Frozen Foods' },
  { value: 'FRESH_FOODS',   label: '🥗  Fresh Foods' },
  { value: 'TOBACCO_VAPES', label: '🚬  Tobacco / Vapes' },
  { value: 'ALCOHOL',       label: '🍺  Alcohol' },
  { value: 'OTHER',         label: '🏪  Other' },
];

module.exports = function startWebServer(cfg) {
  const {
    storeApiKey,
    luckyStopApiUrl,
    manual: {
      port = 7771,
      printerName,
      printerType = 'EPSON',
    } = {},
    qr: { size: qrSize = 5 } = {},
  } = cfg;

  if (!printerName) {
    console.error('❌  manual.printerName not set in config.json');
    console.error('   Run: node src/list-printers.js   to see available printers');
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  // ── GET / — cashier UI ──────────────────────────────────────────────────────
  app.get('/', (_req, res) => {
    const catOptions = CATEGORIES
      .map(c => `<option value="${c.value}">${c.label}</option>`)
      .join('\n          ');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lucky Stop — Print QR</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f0f4f8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 36px 32px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
    }
    .logo {
      text-align: center;
      font-size: 36px;
      margin-bottom: 6px;
    }
    h1 {
      text-align: center;
      font-size: 20px;
      font-weight: 800;
      color: #1a1a2e;
      margin-bottom: 4px;
    }
    .subtitle {
      text-align: center;
      font-size: 13px;
      color: #888;
      margin-bottom: 28px;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    input, select {
      width: 100%;
      padding: 14px 16px;
      font-size: 18px;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      outline: none;
      color: #1a1a2e;
      margin-bottom: 16px;
      transition: border-color 0.2s;
    }
    input:focus, select:focus { border-color: #e8532a; }
    #amount { font-size: 28px; font-weight: 700; text-align: right; }
    button {
      width: 100%;
      padding: 18px;
      background: #e8532a;
      color: #fff;
      font-size: 17px;
      font-weight: 800;
      border: none;
      border-radius: 14px;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      margin-top: 4px;
    }
    button:active { transform: scale(0.98); }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .status {
      margin-top: 18px;
      padding: 14px 16px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      display: none;
    }
    .status.success { background: #d1fae5; color: #065f46; display: block; }
    .status.error   { background: #fee2e2; color: #991b1b; display: block; }
    .status.loading { background: #eff6ff; color: #1e40af; display: block; }
    .hint {
      text-align: center;
      font-size: 12px;
      color: #aaa;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🧾</div>
    <h1>Lucky Stop Rewards</h1>
    <p class="subtitle">Print QR slip for customer</p>

    <label for="amount">Purchase Amount ($)</label>
    <input type="number" id="amount" min="0.01" step="0.01" placeholder="0.00" autofocus />

    <label for="category">Category</label>
    <select id="category">
          ${catOptions}
    </select>

    <button id="printBtn" onclick="printQr()">🖨️  Print QR Slip</button>

    <div class="status" id="status"></div>
    <p class="hint">Customer scans QR with Lucky Stop app to earn cashback</p>
  </div>

  <script>
    async function printQr() {
      const amount = parseFloat(document.getElementById('amount').value);
      const category = document.getElementById('category').value;
      const btn = document.getElementById('printBtn');
      const statusEl = document.getElementById('status');

      if (!amount || amount <= 0) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Please enter a valid amount.';
        return;
      }

      btn.disabled = true;
      statusEl.className = 'status loading';
      statusEl.textContent = '⏳  Printing QR slip…';

      try {
        const res = await fetch('/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, category }),
        });
        const data = await res.json();

        if (data.success) {
          statusEl.className = 'status success';
          statusEl.textContent = '✅  QR slip printed! Hand to customer.';
          document.getElementById('amount').value = '';
          document.getElementById('amount').focus();
        } else {
          statusEl.className = 'status error';
          statusEl.textContent = '❌  ' + (data.error || 'Print failed');
        }
      } catch (err) {
        statusEl.className = 'status error';
        statusEl.textContent = '❌  Could not reach agent: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    }

    // Allow Enter key to trigger print
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') printQr();
    });
  </script>
</body>
</html>`);
  });

  // ── POST /print — generate token + print QR slip ────────────────────────────
  app.post('/print', async (req, res) => {
    const { amount, category = 'OTHER' } = req.body;

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      res.status(400).json({ success: false, error: 'Invalid amount' });
      return;
    }

    const total = parseFloat(parseFloat(amount).toFixed(2));
    const txRef = `MANUAL-${Date.now()}`;

    try {
      // 1. Get receipt QR token from Lucky Stop backend
      const tokenRes = await axios.post(
        `${luckyStopApiUrl}/points/receipt-token`,
        { txRef, total, items: [{ category, amount: total }] },
        { headers: { 'X-Store-API-Key': storeApiKey }, timeout: 8000 }
      );

      const { qrData, expiresAt } = tokenRes.data.data;
      const expiryMins = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000);
      const estimatedCashback = parseFloat((total * 0.05 * 0.96).toFixed(2));

      // 2. Print QR slip to USB thermal printer
      await printQrSlip({ qrData, total, expiryMins, estimatedCashback, printerName, printerType, qrSize });

      console.log(`[Agent] QR slip printed — $${total} | token: ${tokenRes.data.data.tokenId}`);
      res.json({ success: true });
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      console.error(`[Agent] Print error: ${msg}`);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // ── Start server ─────────────────────────────────────────────────────────────
  app.listen(port, '127.0.0.1', () => {
    console.log(`\n✅  Manual mode web UI: http://localhost:${port}`);
    console.log(`   Open this in a browser on the store PC.`);
    console.log(`   Printer: "${printerName}"\n`);
  });
};

// ── ESC/POS print via node-thermal-printer ─────────────────────────────────────

async function printQrSlip({ qrData, total, expiryMins, estimatedCashback, printerName, printerType, qrSize }) {
  const printer = new ThermalPrinter({
    type: PrinterTypes[printerType] || PrinterTypes.EPSON,
    interface: `printer:${printerName}`,
    characterSet: CharacterSet.PC437_USA,
    options: { timeout: 6000 },
  });

  const connected = await printer.isPrinterConnected();
  if (!connected) throw new Error(`Printer "${printerName}" not found or offline`);

  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println('Lucky Stop Rewards');
  printer.bold(false);
  printer.drawLine();
  printer.newLine();

  if (estimatedCashback > 0) {
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(`Earn $${estimatedCashback.toFixed(2)} cashback!`);
    printer.bold(false);
    printer.setTextNormal();
  }

  printer.newLine();
  printer.printQR(qrData, { cellSize: qrSize, correction: 'M', model: 2 });
  printer.newLine();
  printer.println('Scan with Lucky Stop app');
  printer.println('to earn your cashback points.');
  printer.newLine();
  printer.setTextNormal();
  printer.println(`Total: $${total.toFixed(2)}`);
  printer.println(`QR expires in ${expiryMins} min`);
  printer.drawLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.cut();

  await printer.execute();
}
