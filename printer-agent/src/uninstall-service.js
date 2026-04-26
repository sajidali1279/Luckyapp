/**
 * uninstall-service.js
 * Removes the Lucky Stop Printer Agent from Windows services.
 * Run once as Administrator: node src/uninstall-service.js
 */

'use strict';

const path = require('path');

try {
  const { Service } = require('node-windows');

  const svc = new Service({
    name: 'LuckyStop Printer Agent',
    script: path.join(__dirname, 'index.js'),
    workingDirectory: path.join(__dirname, '..'),
  });

  svc.on('uninstall', () => {
    console.log('✅  Service uninstalled successfully.');
  });

  svc.on('error', (err) => {
    console.error('❌  Service error:', err);
  });

  svc.uninstall();
} catch {
  console.error('❌  node-windows not available. Run: npm install');
}
