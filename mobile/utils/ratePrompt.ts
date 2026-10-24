// "Rate the app" (2026-10-24, HQ switch in admin > Engagement). Called right after a good moment (a reward redeemed, a check-in paid). The server
// answers yes at most once for a customer, ever, and only when HQ has it on and the customer has bought enough times; then the phone shows its
// own rating sheet (Apple's or Google's), never a screen of ours. Every failure is silent: asking for a rating must never get in the way.
import * as StoreReview from 'expo-store-review';
import { engagementApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

let asking = false;   // two good moments in the same second ask the server once

export async function askForRatingSoon(): Promise<void> {
  if (asking || useAuthStore.getState().user?.role !== 'CUSTOMER') return;
  asking = true;
  try {
    const res = await engagementApi.ratePrompt();
    if (res.data?.data?.ask !== true) return;
    if (!(await StoreReview.isAvailableAsync())) return;
    // a moment after the celebration, so the sheet does not cover it
    setTimeout(() => { StoreReview.requestReview().catch(() => {}); }, 2200);
  } catch {
    // no connection, an older server: nothing to do
  } finally {
    asking = false;
  }
}
