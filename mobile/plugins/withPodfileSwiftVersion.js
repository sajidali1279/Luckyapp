const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 16's default SWIFT_VERSION is 6, which turns on strict concurrency
// checking. expo-modules-core (as of SDK 55) doesn't fully comply with that
// yet and fails to compile with @MainActor/Sendable errors. Force language
// mode 5 (the valid pre-Swift-6 language mode value — NOT a compiler version
// like "5.9") for every pod target.
//
// This is injected into Expo's own `post_install do |installer|` block
// rather than appended as a separate block — CocoaPods only keeps the last
// post_install hook defined, so a second one would silently replace Expo's
// required React Native / Hermes setup instead of adding to it.
module.exports = function withPodfileSwiftVersion(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');

      const marker = 'post_install do |installer|';
      if (contents.includes(marker) && !contents.includes('SWIFT_VERSION')) {
        const injected = `${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_VERSION'] = '5'
      end
    end
`;
        fs.writeFileSync(podfilePath, contents.replace(marker, injected), 'utf8');
      }

      return config;
    },
  ]);
};
