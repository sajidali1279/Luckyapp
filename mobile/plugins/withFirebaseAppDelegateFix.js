const { withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');

// @react-native-firebase/app's own Expo plugin looks for `self.moduleName =
// "..."` in AppDelegate.swift to know where to insert `FirebaseApp.configure()`.
// Expo SDK 55's new AppDelegate.swift template dropped that line entirely
// (bootstrapping moved to ExpoReactNativeFactory/factory.startReactNative), so
// the anchor never matches. The plugin doesn't fail the build — it just logs
// "Unable to determine correct Firebase insertion point... Skipping Firebase
// addition." and moves on, so every prebuild silently ships an app that never
// calls FirebaseApp.configure(). Every Firebase call then throws "No Firebase
// App '[DEFAULT]' has been created" at runtime (this is what broke iOS phone-
// auth OTP after the SDK 55 upgrade). Insert the call ourselves.
module.exports = function withFirebaseAppDelegateFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const { path: appDelegatePath, language } = IOSConfig.Paths.getAppDelegate(
        config.modRequest.projectRoot
      );
      if (language !== 'swift') return config; // fix targets the SDK 55 Swift template specifically

      let contents = fs.readFileSync(appDelegatePath, 'utf8');
      if (contents.includes('FirebaseApp.configure()')) return config; // already patched — idempotent across rebuilds

      if (!contents.includes('import FirebaseCore')) {
        contents = contents.replace('import React\n', 'import React\nimport FirebaseCore\n');
      }

      const anchor = 'let delegate = ReactNativeDelegate()';
      if (!contents.includes(anchor)) {
        throw new Error(
          'withFirebaseAppDelegateFix: expected anchor not found in AppDelegate.swift — ' +
          'the Expo template changed again. Update this plugin instead of letting Firebase ' +
          'silently fail to initialize.'
        );
      }
      contents = contents.replace(anchor, `FirebaseApp.configure()\n    ${anchor}`);

      fs.writeFileSync(appDelegatePath, contents, 'utf8');
      return config;
    },
  ]);
};
