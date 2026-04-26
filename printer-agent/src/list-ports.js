/**
 * list-ports.js
 * Lists all serial COM ports visible on this Windows PC.
 * Run: node src/list-ports.js
 *
 * Plug in both USB-to-RS232 adapters BEFORE running this.
 * The two new COM ports that appear are your comPortIn and comPortOut.
 */

'use strict';

async function main() {
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();

    if (!ports.length) {
      console.log('\nNo serial ports found.');
      console.log('Make sure both USB-to-RS232 adapters are plugged in and drivers are installed.\n');
      return;
    }

    console.log('\nAvailable COM ports on this PC:\n');
    ports.forEach((p) => {
      const desc = [p.manufacturer, p.friendlyName, p.pnpId]
        .filter(Boolean).join(' | ');
      console.log(`  ${p.path.padEnd(8)} ${desc || '(no description)'}`);
    });

    console.log('\nTip: plug in one adapter at a time to identify which is which.');
    console.log('     Set comPortIn  = the adapter connected to the Commander cable.');
    console.log('     Set comPortOut = the adapter connected to the Epson TM-T88 cable.\n');
  } catch {
    console.error('serialport not installed. Run: npm install');
  }
}

main();
