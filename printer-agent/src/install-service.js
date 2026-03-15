/**
 * install-service.js
 * Installs the printer agent as a Windows service that starts automatically.
 * Run once as Administrator: node src/install-service.js
 */

'use strict';

const path = require('path');

try {
  const { Service } = require('node-windows');

  const svc = new Service({
    name: 'LuckyStop Printer Agent',
    description: 'Intercepts Verifone receipt printer jobs and appends Lucky Stop reward QR codes.',
    script: path.join(__dirname, 'index.js'),
    nodeOptions: [],
    workingDirectory: path.join(__dirname, '..'),
  });

  svc.on('install', () => {
    svc.start();
    console.log('✅  Service installed and started.');
    console.log('   To uninstall: node src/uninstall-service.js');
  });

  svc.on('alreadyinstalled', () => {
    console.log('ℹ️  Service already installed. To reinstall: uninstall first.');
  });

  svc.on('error', (err) => {
    console.error('❌  Service error:', err);
  });

  svc.install();
} catch {
  console.error('❌  node-windows not available. Run: npm install');
}
