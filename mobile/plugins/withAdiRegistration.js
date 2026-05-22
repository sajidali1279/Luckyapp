const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Embeds the Google Play package name verification token into the APK's
// native assets folder so Android can verify key ownership.
module.exports = function withAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'assets'
      );
      fs.mkdirSync(assetsDir, { recursive: true });

      const dest = path.join(assetsDir, 'adi-registration.properties');
      fs.writeFileSync(dest, 'C7RAR4LLM6V2QAAAAAAAAAAAAA', 'utf8');

      return config;
    },
  ]);
};
