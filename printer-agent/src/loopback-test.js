/**
 * Loopback test — NOT part of the real printer-agent. Tests only the coupler and the two USB-RS232
 * adapters, joined directly to each other through the coupler, with nothing else in the chain (no
 * original store cable, no POS, no printer). Run this after wiring adapter A -> coupler -> adapter B
 * and plugging both into this PC.
 *
 * Usage:
 *   node src/loopback-test.js <portA> <portB>
 *   e.g.  node src/loopback-test.js COM3 COM4
 *
 * What it checks, in order:
 *   1. Both ports open without error.
 *   2. Data written to A arrives at B.
 *   3. Data written to B arrives at A.
 *   4. Setting DTR on A is read as DSR on B.
 *   5. Setting DTR on B is read as DSR on A.
 *
 * Every check prints PASS or FAIL plainly. If everything passes, the coupler and both adapters are
 * good, and whatever's wrong is somewhere else (the original cable, the POS, or the printer, or how
 * they're wired at the store). If something fails here, it's the coupler or one of these two adapters.
 */

'use strict';

const { SerialPort } = require('serialport');

const [, , portAPath, portBPath] = process.argv;
if (!portAPath || !portBPath) {
  console.error('Usage: node src/loopback-test.js <portA> <portB>');
  console.error('Example: node src/loopback-test.js COM3 COM4');
  process.exit(1);
}

const OPTS = { baudRate: 38400, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false };

const portA = new SerialPort({ path: portAPath, ...OPTS });
const portB = new SerialPort({ path: portBPath, ...OPTS });

const results = [];
function report(label, ok, detail = '') {
  results.push(ok);
  console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`);
}

function openPort(port, label) {
  return new Promise((resolve) => {
    port.open((err) => {
      report(`${label} opened (${port.path})`, !err, err ? err.message : '');
      resolve(!err);
    });
  });
}

// Sends `text` out `from`, waits up to 1.5s for it to arrive on `to`.
function testData(from, to, text, label) {
  return new Promise((resolve) => {
    let received = Buffer.alloc(0);
    const onData = (chunk) => { received = Buffer.concat([received, chunk]); };
    to.on('data', onData);

    from.write(text, (err) => {
      if (err) { to.off('data', onData); report(label, false, `write error: ${err.message}`); return resolve(false); }
      setTimeout(() => {
        to.off('data', onData);
        const ok = received.toString('utf8').includes(text);
        report(label, ok, ok ? `got "${received.toString('utf8').trim()}"` : `got nothing (0 bytes)` + (received.length ? ` — got ${received.length} byte(s): ${received.toString('hex')}` : ''));
        resolve(ok);
      }, 1500);
    });
  });
}

// Sets DTR on `from`, waits, then reads DSR on `to`. Restores DTR to false afterward either way.
function testHandshake(from, to, label) {
  return new Promise((resolve) => {
    from.set({ dtr: true }, (err) => {
      if (err) { report(label, false, `set DTR error: ${err.message}`); return resolve(false); }
      setTimeout(() => {
        to.get((err2, status) => {
          const ok = !err2 && !!status?.dsr;
          report(label, ok, err2 ? err2.message : `DSR reads ${!!status?.dsr}`);
          from.set({ dtr: false }, () => resolve(ok));
        });
      }, 300);
    });
  });
}

(async () => {
  console.log(`\nLoopback test: ${portAPath} <-> ${portBPath}, through the coupler only\n`);

  const aOpen = await openPort(portA, 'Port A');
  const bOpen = await openPort(portB, 'Port B');
  if (!aOpen || !bOpen) {
    console.log('\nCan\'t continue, one or both ports would not open. Check Device Manager for the real port numbers (they can shift after a reboot or a re-plug) and try again.');
    process.exit(1);
  }

  await testData(portA, portB, 'HELLO_FROM_A_' + Date.now(), 'Data: A -> B');
  await testData(portB, portA, 'HELLO_FROM_B_' + Date.now(), 'Data: B -> A');
  await testHandshake(portA, portB, 'Handshake: A.DTR -> B.DSR');
  await testHandshake(portB, portA, 'Handshake: B.DTR -> A.DSR');

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed} of ${results.length} checks passed.`);
  if (passed === results.length) {
    console.log('The coupler and both adapters are working correctly on their own.');
    console.log('That means the problem is somewhere else: the original store cable, the POS side, or the printer side of the real wiring.');
  } else {
    console.log('Something in the coupler or one of the two adapters is not passing data or the ready signal correctly.');
  }

  portA.close(); portB.close();
  process.exit(passed === results.length ? 0 : 1);
})();
