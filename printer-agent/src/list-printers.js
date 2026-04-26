/**
 * list-printers.js
 * Lists all printers available on this Windows PC.
 * Run: node src/list-printers.js
 * Copy the exact printer name into config.json → manual.printerName
 */

'use strict';

try {
  const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
  // node-thermal-printer exposes the underlying printer list via its dependencies
  const printerList = require('@thiagoelg/node-printer');
  const printers = printerList.getPrinters();

  if (!printers.length) {
    console.log('No printers found. Make sure the USB thermal printer is plugged in and drivers are installed.');
  } else {
    console.log('\nAvailable printers on this PC:\n');
    printers.forEach((p, i) => {
      const isDefault = p.isDefault ? '  ← default' : '';
      console.log(`  ${i + 1}. "${p.name}"${isDefault}`);
    });
    console.log('\nCopy the printer name exactly into config.json → manual.printerName');
  }
} catch {
  // Fallback: use PowerShell
  const { execSync } = require('child_process');
  try {
    const out = execSync('powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"', { encoding: 'utf8' });
    const names = out.trim().split('\n').map(n => n.trim()).filter(Boolean);
    console.log('\nAvailable printers on this PC:\n');
    names.forEach((n, i) => console.log(`  ${i + 1}. "${n}"`));
    console.log('\nCopy the printer name exactly into config.json → manual.printerName');
  } catch (err) {
    console.error('Could not list printers:', err.message);
  }
}
