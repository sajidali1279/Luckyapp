const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Firebase's Swift pods (FirebaseAuth, FirebaseCoreInternal, etc.) generate an
// Objective-C interop header (e.g. FirebaseAuth-Swift.h) that is only exposed
// to dependent pod targets (like @react-native-firebase/auth's RNFBAuth) when
// built as a framework. `use_modular_headers!` alone builds Firebase as a
// static *library* with modular headers, which is enough for `pod install`
// to succeed but not enough for the generated Swift header to be found at
// compile time, causing "FirebaseAuth-Swift.h file not found" in RNFBAuth.
// `use_frameworks! :linkage => :static` is React Native Firebase's documented
// fix — static framework linkage (not dynamic) stays compatible with the New
// Architecture. expo prebuild regenerates the Podfile from scratch every
// time, so this has to be injected via a plugin rather than hand-edited.
module.exports = function withPodfileStaticFrameworks(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf8');
      if (!contents.includes('use_frameworks!')) {
        fs.writeFileSync(podfilePath, `use_frameworks! :linkage => :static\n${contents}`, 'utf8');
      }
      return config;
    },
  ]);
};
