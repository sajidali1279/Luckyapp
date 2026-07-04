const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Firebase's Swift pods (FirebaseAuth, FirebaseCoreInternal, etc.) can't be
// integrated as static libraries unless `use_modular_headers!` is set
// globally in the Podfile — CocoaPods refuses `pod install` otherwise.
// expo prebuild regenerates the Podfile from scratch every time, so this
// has to be injected via a plugin rather than hand-edited.
module.exports = function withPodfileModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');
      if (!contents.includes('use_modular_headers!')) {
        fs.writeFileSync(podfilePath, `use_modular_headers!\n${contents}`, 'utf8');
      }
      return config;
    },
  ]);
};
