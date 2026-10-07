const { withInfoPlist } = require('@expo/config-plugins');
const plist = require('@expo/plist').default;
const fs = require('fs');
const path = require('path');

// Firebase phone auth on iOS (FirebaseAuth 11, Swift) checks, before it sends any code, that the app has registered its
// callback URL scheme, and calls fatalError when it has not: the app closes the moment a customer taps "Send code". The
// scheme is the reversed client id when GoogleService-Info.plist has one, otherwise the "encoded app id" (app- followed by
// GOOGLE_APP_ID with ':' turned into '-'). It is also where the reCAPTCHA fallback returns to the app.
//
// @react-native-firebase/auth's own plugin would add the reversed client id, but it is not registered in this app (its
// openUrlFix part breaks the Swift AppDelegate, see withIosCaptchaOpenUrlFix.js), and it adds nothing when the plist has no
// client id. This plugin reads the same GoogleService-Info.plist the build uses (written from a CI secret before prebuild)
// and registers both forms.
function phoneAuthSchemes(googleServices) {
  const schemes = [];
  if (googleServices.REVERSED_CLIENT_ID) schemes.push(googleServices.REVERSED_CLIENT_ID);
  if (googleServices.GOOGLE_APP_ID) schemes.push(`app-${String(googleServices.GOOGLE_APP_ID).replace(/:/g, '-')}`);
  return schemes;
}

function addUrlSchemes(infoPlist, schemes) {
  const types = Array.isArray(infoPlist.CFBundleURLTypes) ? infoPlist.CFBundleURLTypes : [];
  const have = new Set(types.flatMap((t) => t.CFBundleURLSchemes || []));
  const missing = schemes.filter((s) => !have.has(s));
  if (missing.length) types.push({ CFBundleURLSchemes: missing });
  infoPlist.CFBundleURLTypes = types;
  return infoPlist;
}

module.exports = function withIosPhoneAuthUrlScheme(config) {
  return withInfoPlist(config, (config) => {
    const file = config.ios && config.ios.googleServicesFile;
    const full = file ? path.resolve(config.modRequest.projectRoot, file) : null;
    if (!full || !fs.existsSync(full)) {
      // Without the plist the build has no Firebase on iOS at all; @react-native-firebase/app stops the build too. Say why.
      throw new Error(
        `withIosPhoneAuthUrlScheme: GoogleService-Info.plist not found at ${full || '(ios.googleServicesFile not set)'}. ` +
        'Phone sign-in would crash the iOS app without its URL scheme.'
      );
    }
    const schemes = phoneAuthSchemes(plist.parse(fs.readFileSync(full, 'utf8')));
    if (schemes.length === 0) {
      throw new Error('withIosPhoneAuthUrlScheme: GoogleService-Info.plist has neither REVERSED_CLIENT_ID nor GOOGLE_APP_ID.');
    }
    config.modResults = addUrlSchemes(config.modResults, schemes);
    return config;
  });
};

module.exports.phoneAuthSchemes = phoneAuthSchemes;
module.exports.addUrlSchemes = addUrlSchemes;
