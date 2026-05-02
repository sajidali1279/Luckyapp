// Dynamic config — overrides app.json where env vars are needed.
// EAS Build injects GOOGLE_SERVICES_JSON as the path to the uploaded file secret.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
  },
});
