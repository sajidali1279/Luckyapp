// Checking in at the store a staff member is working at (2026-10-11). When the app opens (or comes back) during a shift, the phone works
// out which of their stores it is at; nothing about the location leaves the phone except which store and how far. At the store the
// schedule has them at: checked in quietly. At another of their stores: it asks "where are you working today?". Not at a store, or the
// location is rough or off: nothing happens. The answer counts for that day only; the schedule is not changed. See backend
// utils/staffCheckIn.ts. `runCheckIn` is also what My Schedule's "Check in" button calls.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { staffApi } from '../services/api';
import { milesBetween } from '../utils/pickupStore';
import { MapPinIcon } from './Icons';
import { useAppSettings } from '../hooks/useAppSettings';

/** Within this distance of a store (feet), the phone is "at" it. */
export const AT_STORE_FEET = 800;   // the default; HQ sets it (Settings > Staff), read below
let atStoreFeet = AT_STORE_FEET;
export function setAtStoreFeet(feet: number) { if (Number.isFinite(feet) && feet >= 100) atStoreFeet = feet; }
/** A fix rougher than this (meters) is not used to decide anything. */
const ROUGH_METERS = 300;
/** How often (at most) it looks again when the app comes back to the front. */
const RECHECK_MS = 10 * 60_000;

interface StaffStore { id: string; name: string; latitude: number | null; longitude: number | null }
interface Today {
  shifts: { storeId: string; storeName: string | null; startTime: string; endTime: string; now: boolean }[];
  checkIn: { storeId: string; storeName: string | null; at: string } | null;
  stores: StaffStore[];
}
export interface Ask { atStore: StaffStore; distanceFeet: number; scheduled: { storeId: string; storeName: string | null; startTime: string; endTime: string } }

async function locate(): Promise<{ latitude: number; longitude: number; accuracy: number | null } | null> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 10_000));
  const pos = (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeout])) ?? (await Location.getLastKnownPositionAsync());
  return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null } : null;
}

/** The nearest of the person's stores, if the phone is at it (and the fix is good enough to say so). */
export function storeAt(stores: StaffStore[], here: { latitude: number; longitude: number; accuracy: number | null }): { store: StaffStore; feet: number } | null {
  if (here.accuracy != null && here.accuracy > ROUGH_METERS) return null;
  let best: { store: StaffStore; feet: number } | null = null;
  for (const s of stores) {
    if (s.latitude == null || s.longitude == null) continue;
    const feet = Math.round(milesBetween(here.latitude, here.longitude, s.latitude, s.longitude) * 5280);
    if (!best || feet < best.feet) best = { store: s, feet };
  }
  return best && best.feet <= atStoreFeet ? best : null;
}

export type CheckInOutcome = 'checked-in' | 'already' | 'ask' | 'not-at-store' | 'no-shift' | 'no-location';

/**
 * Looks once: today's shift, where the phone is, and checks in or asks. `force` (the button on My Schedule) also works outside a shift.
 * Returns what happened; `onAsk` receives the question to show.
 */
export async function runCheckIn(onAsk: (a: Ask) => void, force = false): Promise<CheckInOutcome> {
  const today: Today = (await staffApi.today()).data?.data;
  const shiftNow = today.shifts.find((s) => s.now) ?? (force ? today.shifts[0] : undefined);
  if (!shiftNow && !force) return 'no-shift';
  const here = await locate();
  if (!here) return 'no-location';
  const at = storeAt(today.stores, here);
  if (!at) return 'not-at-store';
  if (today.checkIn?.storeId === at.store.id) return 'already';
  if (!shiftNow || shiftNow.storeId === at.store.id) {
    await staffApi.checkIn({ storeId: at.store.id, method: 'AUTO', distanceFeet: at.feet });
    return 'checked-in';
  }
  onAsk({ atStore: at.store, distanceFeet: at.feet, scheduled: shiftNow });
  return 'ask';
}

/** Mounted once in the staff app: looks when the app opens and when it comes back to the front, and shows the question. */
export default function ShiftCheckIn() {
  const appSettings = useAppSettings();
  setAtStoreFeet(appSettings.limits.staffAtStoreFeet);
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ask, setAsk] = useState<Ask | null>(null);
  const last = useRef(0);
  const dismissed = useRef<string | null>(null);   // "I'm going to my scheduled store": not asked again for that pair this session

  const look = useCallback(async () => {
    if (Date.now() - last.current < RECHECK_MS) return;
    last.current = Date.now();
    try {
      const outcome = await runCheckIn((a) => { if (dismissed.current !== `${a.atStore.id}|${a.scheduled.storeId}`) setAsk(a); });
      if (outcome === 'checked-in') {
        qc.invalidateQueries({ queryKey: ['staff-today'] });
        qc.invalidateQueries({ queryKey: ['staff-attendance'] });
      }
    } catch { /* a convenience: the next look tries again */ }
  }, [qc]);

  useEffect(() => {
    look();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') look(); });
    return () => sub.remove();
  }, [look]);

  async function choose(working: boolean) {
    const a = ask!;
    setAsk(null);
    if (!working) { dismissed.current = `${a.atStore.id}|${a.scheduled.storeId}`; return; }
    try {
      await staffApi.checkIn({ storeId: a.atStore.id, method: 'CHOSEN', distanceFeet: a.distanceFeet });
      Toast.show({ type: 'success', text1: t('staffCheckIn.checkedInAt', { store: a.atStore.name }) });
      qc.invalidateQueries({ queryKey: ['staff-today'] });
      qc.invalidateQueries({ queryKey: ['staff-attendance'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.error || t('staffCheckIn.failed') });
    }
  }

  if (!ask) return null;
  return <AskModal ask={ask} onChoose={choose} />;
}

/** "Where are you working today?": at another of their stores than the one they are scheduled at. */
export function AskModal({ ask, onChoose }: { ask: Ask; onChoose: (workingHere: boolean) => void }) {
  const { t } = useTranslation();
  const choose = onChoose;
  return (
    <Modal transparent animationType="fade" onRequestClose={() => choose(false)}>
      <View style={c.overlay}>
        <View style={c.card} accessibilityViewIsModal>
          <View style={c.icon}><MapPinIcon size={22} color="#fff" /></View>
          <Text style={c.title}>{t('staffCheckIn.askTitle')}</Text>
          <Text style={c.body}>
            {t('staffCheckIn.askBody', { here: ask.atStore.name, scheduled: ask.scheduled.storeName ?? '', from: ask.scheduled.startTime, to: ask.scheduled.endTime })}
          </Text>
          <TouchableOpacity style={c.primary} onPress={() => choose(true)} accessibilityRole="button">
            <Text style={c.primaryText}>{t('staffCheckIn.workingHere', { store: ask.atStore.name })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={c.secondary} onPress={() => choose(false)} accessibilityRole="button">
            <Text style={c.secondaryText}>{t('staffCheckIn.goingThere', { store: ask.scheduled.storeName ?? '' })}</Text>
          </TouchableOpacity>
          <Text style={c.note}>{t('staffCheckIn.askNote')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const c = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 22, alignItems: 'center', gap: 10 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  body: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21 },
  primary: { alignSelf: 'stretch', backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  secondary: { alignSelf: 'stretch', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { color: COLORS.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  note: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', lineHeight: 17, marginTop: 2 },
});
