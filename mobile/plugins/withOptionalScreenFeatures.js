const { withAndroidManifest } = require('@expo/config-plugins');

// Google Play (2026-11-17, release 148 / 1.8.7 refused for review): the app is locked to portrait ("orientation": "portrait" in
// app.json), and Android turns that lock into a REQUIRED hardware feature, android.hardware.screen.portrait, so phones, tablets,
// Chromebooks and Android XR devices without it could not install the app. The app still opens in portrait; these lines only say the
// screen features are optional, so every device can install it.
const OPTIONAL = ['android.hardware.screen.portrait', 'android.hardware.screen.landscape'];

module.exports = function withOptionalScreenFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const list = manifest['uses-feature'] ?? [];
    for (const name of OPTIONAL) {
      const found = list.find((f) => f?.$?.['android:name'] === name);
      if (found) found.$['android:required'] = 'false';
      else list.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = list;
    return cfg;
  });
};
