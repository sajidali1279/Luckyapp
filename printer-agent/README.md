# Lucky Stop Printer Agent

Intercepts Verifone C-store Control Center receipt print jobs, parses the receipt, and appends a reward QR code to the bottom. Customers scan the QR with the Lucky Stop app to self-grant cashback — no cashier action required.

---

## How It Works

```
Verifone POS  ──TCP:9100──▶  Printer Agent (this PC)  ──TCP:9100──▶  Thermal Printer
                               ↓ parses receipt
                               ↓ calls Lucky Stop API → gets QR token
                               ↓ appends QR footer to ESC/POS stream
```

---

## Setup (TCP mode — most common)

### 1. Install Node.js on the store PC
Download from https://nodejs.org (LTS version).

### 2. Copy the printer-agent folder to the store PC
Place it anywhere, e.g. `C:\LuckyStop\printer-agent\`

### 3. Install dependencies
```
cd C:\LuckyStop\printer-agent
npm install
```

### 4. Get the store API key
Log in to the Lucky Stop admin portal as DevAdmin → Billing → click the store → "API Key" → copy it.

### 5. Configure
```
copy config.example.json config.json
```
Edit `config.json`:
```json
{
  "storeApiKey": "sk_store_your_key_here",
  "luckyStopApiUrl": "https://luckystop-api.onrender.com/api",
  "printer": {
    "mode": "tcp",
    "proxyPort": 9100,
    "realPrinterIp": "192.168.1.50",
    "realPrinterPort": 9100
  }
}
```
Replace `192.168.1.50` with your thermal printer's actual IP address (find it by printing a self-test page from the printer).

### 6. Reconfigure the Verifone printer port
In Verifone C-store Control Center:
- Go to **Peripherals → Receipt Printer**
- Change the printer IP from `192.168.1.50` (real printer) to **this PC's IP** (e.g. `192.168.1.10`)
- Keep port `9100`

This makes the POS send print jobs to the agent instead of directly to the printer. The agent receives it, adds the QR, and forwards it.

### 7. Test
```
node src/index.js
```
Print a test receipt from the Verifone. The receipt should have a Lucky Stop QR code at the bottom.

### 8. Install as Windows Service (auto-starts on reboot)
Run as Administrator:
```
node src/install-service.js
```

---

## USB/Serial Mode

If the printer connects via USB/COM port:
```json
"printer": {
  "mode": "usb",
  "comPort": "COM3",
  "baudRate": 19200
}
```
Install serialport: `npm install serialport`

---

## Customer Flow After Setup

1. Customer makes a purchase at Verifone
2. Receipt prints normally + Lucky Stop QR code at the bottom
3. Customer opens Lucky Stop app → **Scan Receipt QR** (home screen)
4. Points added instantly — no cashier involvement needed

QR codes expire after **15 minutes**. One QR per transaction.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No QR on receipt | Check agent is running (`node src/index.js`), check API key in config.json |
| API connection error | Verify `luckyStopApiUrl` and that the store PC has internet |
| Port 9100 in use | Another agent may be running; check Task Manager |
| Printer not responding | Verify `realPrinterIp` — print a self-test from the printer to confirm its IP |
| QR not scanning | Try increasing `qr.size` to 6 or 7 in config.json |
