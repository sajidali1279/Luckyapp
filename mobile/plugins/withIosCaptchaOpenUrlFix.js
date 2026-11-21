const { withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Firebase phone sign-in on iOS can fall back to a reCAPTCHA web page, which returns to the app with a "firebaseauth" link. That link
// is Firebase's to handle; forwarded to Expo Router it became an unwanted navigation. @react-native-firebase/auth's own `openUrlFix`
// plugin only patches Objective-C AppDelegates (and breaks Swift ones), so it is not registered here; this is the Swift version.
//
// Two templates:
// - Expo SDK 58+ (scene life cycle, required by the iOS 27 SDK, 2026-11-18): links arrive in SceneDelegate's
//   scene(_:openURLContexts:), and Expo's forwarder tells React Native about every link whatever the AppDelegate answers. So the
//   SceneDelegate keeps Firebase's links (Auth.auth().canHandle, Firebase's documented scene-delegate call) and passes only the
//   others on.
// - Expo SDK 55 (AppDelegate open-url line): the old patch, kept so this plugin works on either template.
const SCENE_MARKER = '// Extension point for config plugins.';
module.exports = function withIosCaptchaOpenUrlFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const { path: appDelegatePath, language } = IOSConfig.Paths.getAppDelegate(config.modRequest.projectRoot);
      if (language !== 'swift') return config;
      const scenePath = path.join(path.dirname(appDelegatePath), 'SceneDelegate.swift');

      if (fs.existsSync(scenePath)) {
        let scene = fs.readFileSync(scenePath, 'utf8');
        if (scene.includes('Auth.auth().canHandle')) return config;   // already patched
        if (!scene.includes(SCENE_MARKER)) {
          throw new Error('withIosCaptchaOpenUrlFix: expected "' + SCENE_MARKER + '" in SceneDelegate.swift: the Expo template changed ' +
            'again. Update this plugin instead of shipping the reCAPTCHA-redirect navigation glitch unfixed.');
        }
        if (!scene.includes('import FirebaseAuth')) scene = scene.replace('internal import Expo\n', 'internal import Expo\nimport UIKit\nimport FirebaseAuth\n');
        scene = scene.replace(SCENE_MARKER, `${SCENE_MARKER}

  // Firebase phone sign-in's reCAPTCHA page returns with a "firebaseauth" link: Firebase handles it, Expo Router never sees it
  // (plugins/withIosCaptchaOpenUrlFix.js)
  override func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    let others = URLContexts.filter { !Auth.auth().canHandle($0.url) }
    if !others.isEmpty { super.scene(scene, openURLContexts: others) }
  }`);
        fs.writeFileSync(scenePath, scene, 'utf8');
        return config;
      }

      // Expo SDK 55 template
      let contents = fs.readFileSync(appDelegatePath, 'utf8');
      if (contents.includes('firebaseauth')) return config;
      const anchor = 'return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)';
      if (!contents.includes(anchor)) {
        throw new Error('withIosCaptchaOpenUrlFix: no SceneDelegate.swift and the AppDelegate open-url line is not there either: the Expo ' +
          'template changed again. Update this plugin instead of shipping the reCAPTCHA-redirect navigation glitch unfixed.');
      }
      contents = contents.replace(anchor,
        'if url.host?.caseInsensitiveCompare("firebaseauth") == .orderedSame {\n' +
        '      // invocations for Firebase Auth are handled elsewhere and should not be forwarded to Expo Router\n' +
        '      return false\n' +
        '    }\n' +
        `    ${anchor}`);
      fs.writeFileSync(appDelegatePath, contents, 'utf8');
      return config;
    },
  ]);
};
