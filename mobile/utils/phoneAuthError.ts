import type { TFunction } from 'i18next';

// Firebase phone sign-in errors in plain words (and in the customer's language) instead of Firebase's own English text.
// The reCAPTCHA cases matter on iPhone: when SMS defense (reCAPTCHA Enterprise) is switched on in the Firebase console, an app
// without that SDK gets "The reCAPTCHA SDK is not linked" / auth/internal-error.
export function phoneAuthErrorText(err: any, t: TFunction): string {
  const code: string = err?.code ?? '';
  const msg: string = String(err?.message ?? '');
  if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') return t('phoneAuthError.invalidNumber');
  if (code === 'auth/too-many-requests') return t('phoneAuthError.tooMany');
  if (code === 'auth/quota-exceeded') return t('phoneAuthError.quota');
  if (code === 'auth/network-request-failed') return t('phoneAuthError.network');
  if (code === 'auth/web-context-cancelled' || code === 'auth/web-context-already-presented') return t('phoneAuthError.cancelled');
  if (code === 'auth/captcha-check-failed' || code === 'auth/missing-client-identifier' || code === 'auth/app-not-verified'
    || /recaptcha/i.test(msg) || code === 'auth/internal-error') return t('phoneAuthError.verification');
  if (code === 'auth/operation-not-allowed') return t('phoneAuthError.notAllowed');
  return t('phoneAuthError.generic');
}
