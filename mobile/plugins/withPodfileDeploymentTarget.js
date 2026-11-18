const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 27 (needed for App Store uploads from April 2027, Apple ITMS-90725) only builds for iOS 15.0 and newer, and stops with
// "IPHONEOS_DEPLOYMENT_TARGET is set to 9.0 / 12.0 / 13.4, but the range of supported deployment target versions is 15.0 to 27.2"
// for library pods that still declare an older minimum (2026-11-18, the Xcode 27 probe). The app itself needs iOS 15.1 (Expo SDK 55),
// so raising those pods to 15.1 changes nothing on real devices. Injected into Expo's own post_install block, like
// withPodfileSwiftVersion (CocoaPods keeps only the last post_install hook).
const MIN = '16.0';   // probe: expo-router 55 uses an iOS 16 API that Xcode 27 rejects at 15.1
module.exports = function withPodfileDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');
      const marker = 'post_install do |installer|';
      if (contents.includes(marker) && !contents.includes('LUCKY_MIN_IOS')) {
        const injected = `${marker}
    LUCKY_MIN_IOS = '${MIN}'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new(LUCKY_MIN_IOS)
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = LUCKY_MIN_IOS
        end
      end
    end
`;
        fs.writeFileSync(podfilePath, contents.replace(marker, injected), 'utf8');
      }
      return config;
    },
  ]);
};
