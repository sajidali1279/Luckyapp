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
      let contents = fs.readFileSync(podfilePath, 'utf8');
      const marker = '# withPodfileStaticFrameworks';
      if (!contents.includes(marker)) {
        contents = `${marker}\nuse_frameworks! :linkage => :static\n${contents}`;

        // Now that Pods build as frameworks, every pod target is part of the
        // same xcodebuild invocation as the app target. The CI archive step
        // forces CODE_SIGN_STYLE=Manual with a specific provisioning profile
        // via command-line overrides, which Xcode applies to *all* targets in
        // the build graph — but library/framework pod targets (e.g.
        // ExpoKeepAwake, libwebp) don't support provisioning profiles and
        // fail with "does not support provisioning profiles". Pods don't need
        // their own signature; they're signed as part of the final app
        // bundle. This has to live in the same post_install hook the
        // template already declares — a second post_install block would
        // silently replace it (CocoaPods only keeps the last one).
        //
        // Frameworks also break RNFBApp: its headers pull in React-Core
        // headers (RCTConvert.h, RCTBridgeModule.h, ...) via non-modular
        // #import. Expo's autolinking deliberately keeps React-Core's own
        // modulemap "non-framework" for compatibility reasons, so from
        // Clang's point of view RNFBApp (a real framework module) is
        // including a non-modular header, which -Werror rejects by default
        // ("include of non-modular header inside framework module"). The
        // standard use_frameworks! + RN workaround is to allow that.
        contents = contents.replace(
          'post_install do |installer|',
          `post_install do |installer|\n    installer.pods_project.targets.each do |target|\n      target.build_configurations.each do |config|\n        config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'\n        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'\n      end\n    end\n`
        );

        fs.writeFileSync(podfilePath, contents, 'utf8');
      }
      return config;
    },
  ]);
};
