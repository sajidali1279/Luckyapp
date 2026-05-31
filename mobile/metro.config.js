const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer/'),
  // punycode was removed as a Node.js built-in in Node 22; point Metro
  // explicitly to the npm package so markdown-it can resolve it.
  punycode: path.join(__dirname, 'node_modules', 'punycode', 'punycode.js'),
};

module.exports = config;
