# Auth Screens: Android Keyboard Fix + Input UX Improvements

## Problem

On Android, typing a phone number or PIN on the login/create-account/forgot-PIN screens doesn't shift the screen up — the keyboard just covers whatever's below it, so users can't see what they're typing and have to dismiss the keyboard and manually tap into lower fields to bring it back.

Root cause: every `KeyboardAvoidingView` in these screens sets
```ts
behavior={Platform.OS === 'ios' ? 'padding' : undefined}
```
`undefined` means `KeyboardAvoidingView` does nothing on Android. iOS works because `'padding'` is set there; Android gets no behavior at all.

Affected files:
- `mobile/app/(auth)/login.tsx` — 3 `KeyboardAvoidingView` instances (quick login, OTP verify, login/register form)
- `mobile/app/(auth)/forgot-pin.tsx` — 1 instance (phone/OTP/reset-PIN steps)

## Fix 1 — Android keyboard behavior

Change all 4 instances to:
```ts
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
```
`'height'` is the standard fix for Android — it resizes the view to make room for the keyboard. No other changes needed; the existing `ScrollView` + `keyboardShouldPersistTaps="handled"` setup already does the rest once the view actually responds to the keyboard.

## Fix 2 — Return-key chaining

Add `ref`s to `TextInput`s and wire `returnKeyType` + `onSubmitEditing` so the keyboard's return key moves focus forward instead of being a dead button:

- `login.tsx` register form: Name → Phone → PIN → Confirm PIN (each `returnKeyType="next"`, `onSubmitEditing` focuses the next ref; Confirm PIN gets `returnKeyType="done"`)
- `login.tsx` login form: Phone → PIN (`returnKeyType="next"` on Phone, `"done"` on PIN)
- `forgot-pin.tsx` reset step: New PIN → Confirm PIN (`"next"` then `"done"`)
- Single-field screens (Quick PIN, OTP entry, Forgot-PIN phone step) keep `returnKeyType="done"` — nothing to chain to.

## Fix 3 — Auto-advance / auto-submit on fixed-length fields

When a fixed-length field reaches its max length, dismiss the keyboard and trigger the same handler the submit button would — no extra tap required:

| Field | Screen | Max length | Action triggered |
|---|---|---|---|
| Quick-login PIN | `login.tsx` (quick) | 4 | `handleQuickLogin()` |
| Login PIN | `login.tsx` (login mode only) | 4 | `handleLogin()` |
| OTP | `login.tsx` (verify-phone) | 6 | `handleVerifyAndCreate()` |
| OTP | `forgot-pin.tsx` (verify step) | 6 | `handleVerifyOtp()` |
| Confirm PIN (register) | `login.tsx` (register mode) | 4 | `handleRegister()` |
| Confirm PIN (reset) | `forgot-pin.tsx` (reset step) | 4 | `handleResetPin()` — only fires once **both** New PIN and Confirm PIN are 4 digits |

Implementation: a `useEffect` per field watches its value length and fires once when it hits the target length, guarded against re-firing on every render and against firing while a request is already in flight (existing `loading` / `sendingOtp` state). Register's PIN field does NOT auto-submit at 4 digits — only Confirm PIN does, since two more fields exist after it in that flow.

## Out of scope

- No changes to `welcome.tsx` (no text inputs).
- No changes to validation logic, error messages, or API calls — only how/when they're triggered.
- No visual/styling redesign — this is keyboard-handling and input-flow only.
