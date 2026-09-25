/**
 * Direct print test — sends a small, real test print straight to the printer through ONE adapter,
 * with no coupler and no printer-agent logic involved at all. Plug that one adapter's DB25 end
 * directly into the back of the printer (no coupler), and its USB end into this PC.
 *
 * Usage:
 *   node direct-print-test.js <port>
 *   e.g.  node direct-print-test.js COM10
 */

'use strict';

const { SerialPort } = require('serialport');

const [, , portPath] = process.argv;
if (!portPath) {
  console.error('Usage: node direct-print-test.js <port>');
  console.error('Example: node direct-print-test.js COM10');
  process.exit(1);
}

const ESC = 0x1b, GS = 0x1d;
const INIT       = Buffer.from([ESC, 0x40]);              // reset the printer's state
const CENTER     = Buffer.from([ESC, 0x61, 0x01]);
const BOLD_ON    = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF   = Buffer.from([ESC, 0x45, 0x00]);
const FEED_3     = Buffer.from([ESC, 0x64, 3]);
const CUT        = Buffer.from([GS, 0x56, 0x01]);

const job = Buffer.concat([
  INIT,
  CENTER,
  BOLD_ON,
  Buffer.from('LUCKY STOP\n'),
  Buffer.from('DIRECT TEST OK\n'),
  BOLD_OFF,
  Buffer.from(new Date().toLocaleTimeString() + '\n'),
  FEED_3,
  CUT,
]);

console.log(`\nOpening ${portPath} at 38400 8/N/1...`);

const port = new SerialPort({ path: portPath, baudRate: 38400, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false });

port.open((err) => {
  if (err) {
    console.error(`❌  Could not open ${portPath}: ${err.message}`);
    process.exit(1);
  }
  console.log(`✅  ${portPath} opened.`);
  console.log('🤝  Asserting DTR (telling the printer this side is ready to talk)...');
  port.set({ dtr: true, rts: true }, (setErr) => {
    if (setErr) console.error(`⚠️  Could not set DTR/RTS: ${setErr.message} (continuing anyway)`);
    // Give the printer a moment to notice DTR went high before we send anything.
    setTimeout(() => {
      console.log('📨  Sending test print job now...');
      port.write(job, (writeErr) => {
        if (writeErr) {
          console.error(`❌  Write error: ${writeErr.message}`);
        } else {
          console.log(`✅  Wrote ${job.length} bytes. Watch the printer now.`);
          console.log('   If it prints "LUCKY STOP / DIRECT TEST OK" with a timestamp, this adapter is good on its own.');
          console.log('   If nothing happens, this specific adapter (or this specific printer port) is the problem.');
        }
        setTimeout(() => { port.close(); process.exit(0); }, 1500);
      });
    }, 500);
  });
});
