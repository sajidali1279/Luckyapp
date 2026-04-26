# Lucky Stop Printer Agent

Intercepts Epson TM-T88 receipt print jobs from the Verifone Commander and appends a Lucky Stop reward QR code to every receipt. Customers scan the QR with the Lucky Stop app to earn cashback — no cashier action required.

---

## How It Works (Serial Proxy Mode)

```
Verifone Commander
        |
   serial cable
        |
   [USB-RS232 A]                          [USB-RS232 B]
        |                                       |
  COM3 (IN) ──── Windows Laptop Agent ──── COM4 (OUT)
                         |                      |
                  reads receipt            serial cable
                  calls Lucky Stop API          |
                  appends QR footer        Epson TM-T88
                                               |
                                          receipt prints
                                       (normal + QR footer)
```

---

## Hardware Needed (~$25 total)

- **2× USB-to-RS232 (DB9) adapters** — e.g. UGREEN USB to RS232 (~$12 each on Amazon, ASIN B00QUZY4UG or similar)
- The existing serial cables (already running between Commander and TM-T88)

---

## Setup

### 1. Install Node.js
Download the **LTS** version from https://nodejs.org and install it on the store Windows PC.

### 2. Copy the printer-agent folder to the store PC
Place it at `C:\LuckyStop\printer-agent\`

### 3. Install dependencies
Open Command Prompt as Administrator:
```
cd C:\LuckyStop\printer-agent
npm install
```

### 4. Get the store API key
Log in to the Lucky Stop admin portal as DevAdmin → Billing → click the store → "API Key" → copy it.

### 5. Wire up the serial cables

**Current wiring (before):**
```
Commander ──serial──▶ Epson TM-T88
```

**New wiring (after):**
```
Commander ──serial──▶ USB-RS232 adapter A ──USB──▶ Windows PC
Windows PC ──USB──▶ USB-RS232 adapter B ──serial──▶ Epson TM-T88
```

Steps:
1. Unplug the serial cable from the TM-T88
2. Plug that cable end into **USB adapter A** (this becomes the IN port)
3. Plug **USB adapter B** into a second USB port on the Windows PC
4. Run a new serial cable from **USB adapter B** to the TM-T88

### 6. Find the COM port numbers
With both adapters plugged in, run:
```
node src/list-ports.js
```
This shows something like:
```
  COM3     Prolific USB-to-Serial Comm Port
  COM4     Prolific USB-to-Serial Comm Port
```
Plug adapters in one at a time to identify which is which. The one connected to the Commander cable = **comPortIn**. The one connected to the TM-T88 = **comPortOut**.

### 7. Configure
```
copy config.example.json config.json
```
Edit `config.json`:
```json
{
  "storeApiKey": "sk_store_your_key_here",
  "luckyStopApiUrl": "https://luckystop-api.onrender.com/api",
  "printer": {
    "mode": "serial",
    "comPortIn": "COM3",
    "comPortOut": "COM4",
    "baudRate": 38400
  }
}
```
The baud rate **38400** matches what your TM-T88 self-test printed.

### 8. Test
```
node src/index.js
```
Print a test receipt from the Verifone. The receipt should now have a Lucky Stop QR code section at the bottom.

### 9. Install as Windows Service (auto-starts on reboot)
Run Command Prompt as Administrator:
```
node src/install-service.js
```

To uninstall:
```
node src/uninstall-service.js
```

---

## Customer Flow (after setup)

1. Customer buys something at the Verifone
2. Receipt prints normally — Lucky Stop QR section prints at the bottom automatically
3. Customer opens Lucky Stop app → taps **Scan Receipt** tab → scans QR
4. Points added instantly — QR expires 15 minutes after printing

---

## Fallback: Manual Mode (no rewiring needed)

If you'd rather not rewire the serial cables, manual mode works with a cheap USB thermal printer (~$35) plugged into the Windows PC. Cashier opens `http://localhost:7771` in a browser and clicks Print after each transaction. Customer gets a small QR slip.

To use manual mode, change `config.json`:
```json
{
  "printer": { "mode": "manual" },
  "manual": {
    "port": 7771,
    "printerName": "YOUR_USB_PRINTER_NAME"
  }
}
```
Run `node src/list-printers.js` to find the printer name.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No QR on receipt | Check agent is running, check API key in config.json |
| Receipt doesn't print at all | Swap comPortIn and comPortOut in config.json |
| "Cannot open COM3" | Check Device Manager — port number may have changed after reboot |
| QR not scanning | Increase `qr.size` to 6 or 7 in config.json |
| API error | Verify internet connection and `luckyStopApiUrl` |
| Service not starting | Run Command Prompt as Administrator |
