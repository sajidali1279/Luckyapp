const { withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');

// @react-native-firebase/auth ships its own `openUrlFix` plugin that patches
// AppDelegate's open-url handler so the reCAPTCHA-fallback redirect (used
// when phone-auth can't verify silently via APNs) isn't forwarded to Expo
// Router's deep-link handler as an unwanted navigation. That plugin only
// knows how to patch Objective-C AppDelegates — on a Swift AppDelegate (this
// project's template since SDK 55) it throws a hard build-breaking error
// (`// TODO: Support Swift`), so it's deliberately not registered anywhere in
// this app's plugins array. This is the Swift equivalent, ported from
// @react-native-firebase/auth/plugin/src/ios/openUrlFix.ts's Objective-C fix,
// verified against the actual published expo-template-bare-minimum@55.0.39
// AppDelegate.swift (same verification approach as withFirebaseAppDelegateFix.js).
module.exports = function withIosCaptchaOpenUrlFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const { path: appDelegatePath, language } = IOSConfig.Paths.getAppDelegate(
        config.modRequest.projectRoot
      );
      if (language !== 'swift') return config; // fix targets the Swift template specifically

      let contents = fs.readFileSync(appDelegatePath, 'utf8');
      if (contents.includes('firebaseauth')) return config; // already patched — idempotent across rebuilds

      const anchor = 'return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)';
      if (!contents.includes(anchor)) {
        throw new Error(
          'withIosCaptchaOpenUrlFix: expected anchor not found in AppDelegate.swift — ' +
          'the Expo template changed again. Update this plugin instead of shipping the ' +
          'reCAPTCHA-redirect navigation glitch unfixed.'
        );
      }
      const fix =
        'if url.host?.caseInsensitiveCompare("firebaseauth") == .orderedSame {\n' +
        '      // invocations for Firebase Auth are handled elsewhere and should not be forwarded to Expo Router\n' +
        '      return false\n' +
        '    }\n' +
        `    ${anchor}`;
      contents = contents.replace(anchor, fix);

      fs.writeFileSync(appDelegatePath, contents, 'utf8');
      return config;
    },
  ]);
};
