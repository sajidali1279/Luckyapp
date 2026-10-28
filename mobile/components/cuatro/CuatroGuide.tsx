// Cuatro, the on-screen guide (2026-10-27, admin > Engagement > Cuatro > "On-screen guide"). The owner's brief: no little mascot parked
// on the screen. He peeks in from the left edge or up from behind the bottom bar and waves. A tap and he jumps onto the bottom bar and
// waits; another tap and he introduces himself (and is funny about it). From then on he knows the app: now and then he says "check this
// out" about an offer, a challenge, a deal or a feature, and a tap on him opens his help menu. Press and hold to pick him up and carry
// him; throw him off the left or right side and he hits the edge, falls, and leaves crying or mad. Then he lives in a little tab on the
// left edge until someone taps it: on the screen or in the tab, never both.
// He shows only on the customer's main screens (never over a form, the camera, ordering or the keyboard), steps away while a screen's
// own pop-up is open (guideCover.ts), and the phone remembers per customer whether he was introduced or sent away. Mounted by the
// customer layout in DrawerShell's floating slot: above the screens and the bottom bar, under the side menu.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, BackHandler, Easing, Keyboard, PanResponder, Pressable, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, usePathname } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ScaledText';
import { COLORS } from '../../constants';
import { useAuthStore } from '../../store/authStore';
import { useEngagementFlags } from '../../hooks/useEngagement';
import { useAppSettings } from '../../hooks/useAppSettings';
import { haptic } from '../../utils/haptics';
import { useShellBar } from '../DrawerShell';
import CuatroRig, { Part, useRigValues, about, type Extras } from './CuatroRig';
import { ASPECT, FEET, PIVOT, DROP, star, type Face, type Glove } from './art';
import { useGuideCovered } from './guideCover';
import { tips, answer, TOPICS, type Ctx, type Line, type Topic } from './guideTips';

const SIZE = 76;                          // his width on screen
const H = SIZE * ASPECT;                  // and height
const SIT = H * 0.11;                     // how much lower he is sitting down, legs out
const LIFT = 14;                          // how far he rises when picked up
const G = 2600;                           // gravity, px per second per second
const TAB_W = 34, TAB_H = 62;
const TIPS_PER_RUN = 4;                   // at most this many "check this out" a time the app is open
// the customer's main screens: never a form, the camera, ordering, chat or the prize game (its button sits where he stands)
const ROUTES = ['home', 'rewards', 'history', 'ads', 'leaderboard', 'progress', 'notifications', 'guide'];
const OPEN_EYES = new Set<Face>(['happy', 'wow', 'sad', 'mad', 'sleepy', 'wink']);
const N = { useNativeDriver: true } as const;

type Mood = 'sad' | 'mad';
type Mode = 'off' | 'peek' | 'bar' | 'held' | 'busy' | 'tab';
interface Saved { introduced: boolean; away: boolean; mood: Mood | null; spot: number; tipDay: string; tipKeys: string[] }
const FRESH: Saved = { introduced: false, away: false, mood: null, spot: 1, tipDay: '', tipKeys: [] };

// What the phone remembers, per customer, read once per app run
let saved: Saved | null = null;
let savedFor: string | null = null;
const keyFor = (userId: string) => `cuatro_guide_${userId}`;
async function load(userId: string): Promise<Saved> {
  if (saved && savedFor === userId) return saved;
  let s: Saved = { ...FRESH };
  try { const raw = await AsyncStorage.getItem(keyFor(userId)); if (raw) s = { ...FRESH, ...JSON.parse(raw) }; } catch { /* a fresh start */ }
  saved = s; savedFor = userId;
  return s;
}
function remember(patch: Partial<Saved>) {
  if (!savedFor) return;
  saved = { ...(saved ?? FRESH), ...patch };
  AsyncStorage.setItem(keyFor(savedFor), JSON.stringify(saved)).catch(() => {});
}
// Where he was this app run, so leaving a screen and coming back puts him back there
const run = { where: null as null | 'peek' | 'bar' | 'tab', peeks: 0, tips: 0, nextTipAt: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const deg = (v: Animated.Value) => v.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
/** A hop's height at t (0 to 1): from y0 to y1 over a top `rise` above the higher end (a quadratic curve). */
const arc = (y0: number, y1: number, rise: number) => {
  const c = 2 * (Math.min(y0, y1) - rise) - (y0 + y1) / 2;
  return (t: number) => (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * c + t * t * y1;
};

function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setUp(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setUp(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return up;
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

export default function CuatroGuide() {
  const flags = useEngagementFlags();
  const on = !!flags?.mascot?.guide;
  const userId = useAuthStore((s) => s.user?.id);
  const isCustomer = useAuthStore((s) => s.user?.role === 'CUSTOMER');
  const bar = useShellBar();
  const screen = usePathname().split('/').filter(Boolean).pop() ?? '';
  const keyboard = useKeyboardUp();
  const covered = useGuideCovered();
  const [ready, setReady] = useState(!!saved && savedFor === userId);
  useEffect(() => {
    if (!on || !userId) return;
    let alive = true;
    load(userId).then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [on, userId]);
  if (!on || !isCustomer || !ready || savedFor !== userId || bar.hidden || bar.height <= 0 || keyboard || covered || !ROUTES.includes(screen)) return null;
  return <Stage name={flags?.mascot?.name?.trim() || 'Cuatro'} barH={bar.height} menuOpen={bar.menuOpen} />;
}

/** The screen above the bottom bar: he is cut off at its edges, so he can rise from behind the bar or lean in from the side. */
function Stage({ name, barH, menuOpen }: { name: string; barH: number; menuOpen: boolean }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { bottom: barH, overflow: 'hidden' }]} onLayout={onLayout}>
      {box ? <Guide name={name} w={box.w} h={box.h} menuOpen={menuOpen} /> : null}
    </View>
  );
}

type Bubble =
  | { kind: 'hint'; text: string }
  | { kind: 'say'; text: string }
  | { kind: 'intro'; step: number }
  | { kind: 'menu' }
  | { kind: 'line'; line: Line; tip: boolean };

const INTRO: { face: Face; gloves: [Glove, Glove]; arms: [number, number]; wave?: boolean; sweat?: boolean }[] = [
  { face: 'joy', gloves: ['open', 'fist'], arms: [62, -62], wave: true },
  { face: 'wink', gloves: ['fist', 'thumb'], arms: [-62, 35] },
  { face: 'cool', gloves: ['point', 'fist'], arms: [28, -62] },
  { face: 'happy', gloves: ['fist', 'open'], arms: [-62, 44] },
  { face: 'joy', gloves: ['thumb', 'thumb'], arms: [46, 46], sweat: true },
];

function Guide({ name, w, h, menuOpen }: { name: string; w: number; h: number; menuOpen: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const flags = useEngagementFlags();
  const app = useAppSettings();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const rig = useRigValues();
  const tabRig = useRigValues();
  // where he is (his box's top left), his spin about his middle, his lean and squash about his feet
  const x = useRef(new Animated.Value(-SIZE * 3)).current;
  const y = useRef(new Animated.Value(h)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const lean = useRef(new Animated.Value(0)).current;
  const sx = useRef(new Animated.Value(1)).current;
  const sy = useRef(new Animated.Value(1)).current;
  const breath = useRef(new Animated.Value(1)).current;
  const tabX = useRef(new Animated.Value(-TAB_W - 10)).current;

  const [face, setFaceState] = useState<Face>('happy');
  const [gloves, setGloves] = useState<[Glove, Glove]>(['fist', 'fist']);
  const [fx, setFx] = useState<Extras>({});
  const [bits, setBits] = useState<{ stars?: boolean; drops?: boolean; steam?: boolean }>({});
  const [bubble, setBubbleState] = useState<(Bubble & { id: number; at: { x: number; bottom: number } }) | null>(null);
  const [mode, setModeState] = useState<Mode>('off');
  const [tabMood, setTabMood] = useState<Mood | null>(null);
  const [tabUp, setTabUp] = useState(false);   // the tab's little Cuatro is drawn only while the tab is out
  const [bonk, setBonk] = useState<{ side: 'left' | 'right'; y: number; id: number } | null>(null);

  // what the gestures and timers read (they outlive a render)
  const live = useRef(true);
  const scene = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const loops = useRef<Animated.CompositeAnimation[]>([]);
  const pos = useRef({ x: -SIZE * 3, y: h });
  const modeRef = useRef<Mode>('off');
  const faceRef = useRef<Face>('happy');
  const bubbleRef = useRef<Bubble | null>(null);
  const dims = useRef({ w, h, top: insets.top + 4, reduce, menuOpen });
  dims.current = { w, h, top: insets.top + 4, reduce, menuOpen };

  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };
  const setFace = (f: Face) => { faceRef.current = f; setFaceState(f); };
  const later = (ms: number, f: () => void) => {
    const id = setTimeout(() => { timers.current.delete(id); if (live.current) f(); }, ms);
    timers.current.add(id);
    return id;
  };
  const pause = (ms: number) => new Promise<void>((res) => { later(ms, res); });
  const play = (a: Animated.CompositeAnimation) => new Promise<boolean>((res) => a.start(({ finished }) => res(finished)));
  const fresh = () => ++scene.current;                 // a new scene: the one running stops at its next step
  const still = (my: number) => live.current && scene.current === my;
  const to = (v: Animated.Value, toValue: number, duration: number, easing: (t: number) => number = Easing.inOut(Easing.quad)) =>
    Animated.timing(v, { toValue, duration, easing, ...N });
  const spring = (v: Animated.Value, toValue: number, o: Record<string, number> = {}) => Animated.spring(v, { toValue, friction: 5, tension: 150, ...o, ...N });
  /** v along any curve (f gives the position at t, 0 to 1): worked out up front, so it still runs on the native thread. */
  const along = (v: Animated.Value, f: (t: number) => number, duration: number) => {
    const from = f(0);
    v.setValue(from);
    return Animated.timing(v, { toValue: from + 1, duration, easing: (t) => f(t) - from, ...N });
  };
  const loop = (a: Animated.CompositeAnimation, iterations = -1, onEnd?: () => void) => {
    const l = Animated.loop(a, { iterations });
    loops.current.push(l);
    l.start(onEnd ? ({ finished }) => { if (finished && live.current) onEnd(); } : undefined);
    return l;
  };
  const stopLoops = () => { loops.current.forEach((l) => l.stop()); loops.current = []; };
  const moving = [x, y, spin, lean, sx, sy, rig.armL, rig.armR, rig.legL, rig.legR, rig.gazeX, rig.gazeY, rig.talk];
  const stopAll = () => { stopLoops(); moving.forEach((v) => v.stopAnimation()); };

  const floorY = () => dims.current.h - FEET * H + 1;
  const spotX = () => { const { w: ww } = dims.current; return clamp((saved?.spot ?? 1) * (ww - SIZE - 12) + 6, 6, ww - SIZE - 6); };
  const place = (nx: number, ny: number) => { x.setValue(nx); y.setValue(ny); pos.current = { x: nx, y: ny }; };
  const arms = (l: number, r: number, ms = 260) => Animated.parallel([to(rig.armL, l, ms), to(rig.armR, r, ms)]);
  const rest = () => { setGloves(['fist', 'fist']); play(Animated.parallel([arms(-62, -62), to(rig.legL, 0, 200), to(rig.legR, 0, 200), to(rig.gazeX, 0, 200), to(rig.gazeY, 0, 200)])); };

  const ctx = (): Ctx => ({
    qc, t: t as Ctx['t'], es: !!i18n.language?.startsWith('es'),
    pts: Math.round(Number(useAuthStore.getState().user?.pointsBalance || 0) * 100),
    gasAlerts: !!flags?.gasAlerts, hotFood: app.features.hotFoodOrdering,
  });

  // ------------------------------------------------------------ talking
  const bubbleSeq = useRef(0);
  const openBubble = (b: Bubble) => {
    const p = pos.current, { w: ww, h: hh } = dims.current;
    bubbleRef.current = b;
    setBubbleState({ ...b, id: ++bubbleSeq.current, at: { x: clamp(p.x + SIZE / 2, 22, ww - 22), bottom: hh - p.y + 2 } });
    const text = b.kind === 'hint' || b.kind === 'say' ? b.text : b.kind === 'line' ? b.line.text : b.kind === 'intro' ? t(`guide.intro${b.step + 1}`, { name }) : t('guide.helpTitle');
    AccessibilityInfo.announceForAccessibility(text);
    talk(text);
  };
  const closeBubble = () => { bubbleRef.current = null; setBubbleState(null); };
  const talk = (text: string) => {
    const times = Math.max(2, Math.min(14, Math.round(text.length / 9)));
    rig.talk.setValue(1);
    Animated.loop(Animated.sequence([to(rig.talk, 0.45, 80), to(rig.talk, 1, 100)]), { iterations: times }).start();
  };
  const say = (text: string, ms: number) => {
    openBubble({ kind: 'say', text });
    later(ms, () => { const b = bubbleRef.current; if (b?.kind === 'say' && b.text === text) closeBubble(); });
  };

  // ------------------------------------------------------------ little moves
  const wave = (side: 'L' | 'R', times = -1) => {
    const a = side === 'L' ? rig.armL : rig.armR;
    setGloves((g) => (side === 'L' ? ['open', g[1]] : [g[0], 'open']));
    a.setValue(-62);
    play(to(a, 62, 220)).then((ok) => {
      if (!ok || !live.current) return;
      loop(Animated.sequence([to(a, 80, 230), to(a, 46, 230)]), times,
        times > 0 ? () => { if (modeRef.current === 'bar' && !bubbleRef.current) rest(); } : undefined);
    });
  };
  /** Squashes on landing, then wobbles back while whatever comes next starts (a spring takes a second to settle). */
  const wobble = () => Animated.parallel([spring(sy, 1, { friction: 4 }), spring(sx, 1, { friction: 4 })]).start();
  const land = async (my: number, soft = false) => {
    haptic.tap();
    await play(Animated.parallel([to(sy, soft ? 0.9 : 0.78, 80), to(sx, soft ? 1.08 : 1.18, 80), to(rig.legL, 0, 80), to(rig.legR, 0, 80)]));
    if (still(my)) wobble();
    return still(my);
  };
  /** From where he is to (tx, ty) in one hop: crouch, stretch up, tuck the feet, land. */
  const leap = async (my: number, tx: number, ty: number, rise = 70, ms = 520) => {
    const { x: x0, y: y0 } = pos.current;
    if (!dims.current.reduce) await play(Animated.parallel([to(sy, 0.82, 110), to(sx, 1.12, 110), to(lean, 0, 110), to(spin, 0, 110)]));
    if (!still(my)) return false;
    await play(Animated.parallel([
      to(x, tx, ms, Easing.inOut(Easing.quad)),
      along(y, arc(y0, ty, rise), ms),
      Animated.sequence([Animated.parallel([to(sy, 1.12, 120), to(sx, 0.9, 120)]), Animated.parallel([to(sy, 1, ms - 120), to(sx, 1, ms - 120)])]),
      Animated.sequence([Animated.parallel([to(rig.legL, 18, 160), to(rig.legR, 18, 160)]), Animated.parallel([to(rig.legL, 0, ms - 160), to(rig.legR, 0, ms - 160)])]),
    ]));
    if (!still(my)) return false;
    pos.current = { x: tx, y: ty };
    return land(my);
  };
  const hop = async (my: number) => {
    const { x: px, y: py } = pos.current;
    await play(along(y, arc(py, py, 26), 320));
    pos.current = { x: px, y: py };
    return land(my, true);
  };
  const look = () => {
    const side = Math.random() < 0.5 ? -6 : 6;
    play(Animated.sequence([to(rig.gazeX, side, 180), Animated.delay(700), to(rig.gazeX, -side, 260), Animated.delay(500), to(rig.gazeX, 0, 200)]));
  };

  // ------------------------------------------------------------ where he goes
  const showTab = (mood: Mood | null) => {
    fresh(); stopAll(); closeBubble();
    place(-SIZE * 3, floorY());
    spin.setValue(0); lean.setValue(0); sx.setValue(1); sy.setValue(1);
    setFx({}); setBits({}); setTabMood(mood); setTabUp(true); setMode('tab');
    run.where = 'tab';
    play(spring(tabX, 0, { friction: 7, tension: 60 }));
    // not met yet and only ducked away: one more peek a while later
    if (!saved?.introduced && !saved?.away && run.peeks < 2) later(90_000, () => { if (modeRef.current === 'tab') { play(to(tabX, -TAB_W - 10, 160)); peek(); } });
  };

  const peek = async () => {
    const my = fresh(); stopAll(); closeBubble();
    setMode('peek'); run.where = 'peek'; run.peeks += 1;
    setFace('joy'); setFx({}); setBits({});
    const fromLeft = Math.random() < 0.5;
    if (dims.current.reduce) {
      place(fromLeft ? 8 : spotX(), floorY());
    } else if (fromLeft) {
      // round the left edge, feet on the bar, leaning in
      place(-SIZE, floorY());
      await play(Animated.parallel([to(x, -SIZE * 0.42, 560, Easing.out(Easing.back(1.4))), to(lean, 16, 560)]));
      pos.current = { x: -SIZE * 0.42, y: floorY() };
    } else {
      // up from behind the bar: his head and a waving hand
      const px = clamp(dims.current.w * 0.2, 8, dims.current.w - SIZE - 8);
      place(px, dims.current.h + 6);
      await play(spring(y, dims.current.h - H * 0.62, { friction: 6, tension: 70 }));
      pos.current = { x: px, y: dims.current.h - H * 0.62 };
    }
    if (!still(my)) return;
    wave(fromLeft ? 'R' : 'L');
    later(1300, () => { if (modeRef.current === 'peek' && scene.current === my && !bubbleRef.current) say(t('guide.tapMe'), 3800); });
    // ignored: he ducks back out, into the tab
    later(16_000, () => { if (modeRef.current === 'peek' && scene.current === my) duck(fromLeft); });
  };

  const duck = async (fromLeft: boolean) => {
    const my = fresh(); stopLoops(); closeBubble(); setMode('busy');
    const { x: px } = pos.current;
    await play(fromLeft ? Animated.parallel([to(x, -SIZE - 4, 380), to(lean, 0, 380)]) : to(y, dims.current.h + 6, 380, Easing.in(Easing.quad)));
    if (!still(my)) return;
    pos.current = { x: fromLeft ? -SIZE - 4 : px, y: dims.current.h + 6 };
    rest(); showTab(null);
  };

  /** Back on the bar: up from behind it at his spot. */
  const popUp = async () => {
    const my = fresh(); setMode('busy');
    const tx = spotX(), ty = floorY();
    setFace('joy'); setGloves(['fist', 'fist']); rig.armL.setValue(-62); rig.armR.setValue(-62);
    place(tx, dims.current.h + 8);
    await play(along(y, arc(dims.current.h + 8, ty, 40), dims.current.reduce ? 1 : 440));
    if (!still(my)) return;
    pos.current = { x: tx, y: ty };
    if (!(await land(my))) return;
    setFace('happy'); setMode('bar'); run.where = 'bar';
    if (saved?.introduced) run.nextTipAt = Math.max(run.nextTipAt, Date.now() + 30_000);
    else later(900, () => { if (modeRef.current === 'bar' && !bubbleRef.current) say(t('guide.tapAgain'), 4000); });
  };

  /** From a peek (or the tab) onto the bar, where he waits. */
  const toBar = async () => {
    const my = fresh(); stopLoops(); closeBubble(); setMode('busy');
    setGloves(['fist', 'fist']);
    play(arms(-62, -62, 200));
    if (!(await leap(my, spotX(), floorY(), 80))) return;
    setFace('happy'); setMode('bar'); run.where = 'bar';
    if (!saved?.introduced) later(700, () => { if (modeRef.current === 'bar' && !bubbleRef.current) say(t('guide.tapAgain'), 4000); });
    else run.nextTipAt = Math.max(run.nextTipAt, Date.now() + 30_000);
  };

  /** Out of the tab, sulking if he was thrown out, then back to normal. */
  const comeBack = async () => {
    haptic.tap();
    const my = fresh(); setMode('busy');
    await play(to(tabX, -TAB_W - 10, 180));
    if (!still(my)) return;
    const mood = saved?.mood ?? null;
    remember({ away: false, mood: null });
    setTabMood(null); setTabUp(false);
    setFace(mood === 'mad' ? 'mad' : mood === 'sad' ? 'sad' : 'joy');
    setFx(mood === 'sad' ? { tears: 'sad' } : mood === 'mad' ? { anger: true } : {});
    place(-SIZE, floorY());
    loop(Animated.sequence([Animated.parallel([to(rig.legL, 20, 140), to(rig.legR, -10, 140)]), Animated.parallel([to(rig.legL, -10, 140), to(rig.legR, 20, 140)])]));
    await play(to(x, 10, 520, Easing.out(Easing.quad)));
    stopLoops();
    if (!still(my)) return;
    pos.current = { x: 10, y: floorY() };
    if (!(await leap(my, spotX(), floorY(), 60))) return;
    setMode('bar'); run.where = 'bar';
    if (mood) {
      say(t(mood === 'mad' ? 'guide.backMad' : 'guide.backSad'), 2600);
      await pause(2700);
      if (!still(my)) return;
      setFx({}); setFace('joy'); setGloves(['thumb', 'thumb']);
      play(arms(46, 46));
      say(t('guide.backForgive'), 3400);
      later(3500, () => { if (modeRef.current === 'bar') { setFace('happy'); rest(); } });
    } else if (!saved?.introduced) {
      setFace('happy');
      say(t('guide.tapAgain'), 4000);
    } else {
      setFace('joy');
      say(t('guide.backHi'), 2800);
      wave('L', 2);
      later(2900, () => { if (modeRef.current === 'bar') setFace('happy'); });
    }
    run.nextTipAt = Math.max(run.nextTipAt, Date.now() + 45_000);
  };

  // ------------------------------------------------------------ the intro, the menu, the tips
  const doIntro = (step: number) => {
    const s = INTRO[step];
    stopLoops();
    setFace(s.face); setGloves(s.gloves); setFx(s.sweat ? { sweat: true } : {});
    play(arms(s.arms[0], s.arms[1], 300));
    if (s.wave) later(320, () => { if (bubbleRef.current?.kind === 'intro') loop(Animated.sequence([to(rig.armL, 80, 230), to(rig.armL, 46, 230)]), 3); });
    if (step === 0) hop(scene.current);
    openBubble({ kind: 'intro', step });
  };
  const nextIntro = () => {
    const b = bubbleRef.current;
    if (b?.kind !== 'intro') return;
    haptic.select();
    if (b.step + 1 < INTRO.length) doIntro(b.step + 1);
    else endIntro();
  };
  const endIntro = () => {
    remember({ introduced: true });
    stopLoops(); closeBubble(); setFx({}); setFace('joy'); rest();
    later(1200, () => { if (modeRef.current === 'bar') setFace('happy'); });
    run.nextTipAt = Date.now() + 40_000;
  };
  const menu = () => {
    stopLoops(); setFace('happy');
    setGloves(['fist', 'open']); play(arms(-62, 40));
    openBubble({ kind: 'menu' });
  };
  const present = async (line: Line, tip: boolean) => {
    const my = fresh(); stopLoops();
    if (tip && !dims.current.reduce) { haptic.tap(); if (!(await hop(my))) return; }
    setFace(line.face); setGloves(['point', 'fist']); play(arms(30, -62));
    openBubble({ kind: 'line', line, tip });
    if (tip) later(10_000, () => { const b = bubbleRef.current; if (b?.kind === 'line' && b.tip && b.line.key === line.key) { closeBubble(); setFace('happy'); rest(); } });
  };
  const ask = (topic: Topic) => { haptic.select(); present(answer(topic, ctx()), false); };
  const showTip = () => {
    const today = dayKey();
    const said = saved?.tipDay === today ? saved.tipKeys : [];
    const pool = tips(ctx()).filter((l) => !said.includes(l.key));
    if (!pool.length) { run.nextTipAt = Date.now() + 10 * 60_000; return; }
    const top = Math.max(...pool.map((l) => l.prio));
    const best = pool.filter((l) => l.prio >= top - 1);
    const line = best[Math.floor(Math.random() * best.length)];
    remember({ tipDay: today, tipKeys: [...said, line.key].slice(-40) });
    run.tips += 1;
    run.nextTipAt = Date.now() + 150_000 + Math.random() * 90_000;
    present(line, true);
  };
  const follow = (line: Line) => {
    if (!line.cta) return;
    haptic.tap();
    closeBubble(); setFace('joy'); rest();
    router.navigate(line.cta.go as any);
  };

  // ------------------------------------------------------------ picked up, dropped, thrown
  const press = useRef({ held: false, moved: false, timer: null as ReturnType<typeof setTimeout> | null, bx: 0, by: 0 });
  const pickUp = () => {
    fresh(); stopAll(); closeBubble();
    press.current.held = true;
    setMode('held');
    haptic.press();
    setFace('wow'); setFx({ sweat: true }); setBits({}); setGloves(['open', 'open']);
    spin.setValue(0); lean.setValue(0);
    play(Animated.parallel([spring(sx, 1.08), spring(sy, 1.08), to(y, pos.current.y - LIFT, 120)]));
    pos.current = { x: pos.current.x, y: pos.current.y - LIFT };
    loop(Animated.parallel([
      Animated.sequence([to(rig.armL, 70, 160), to(rig.armL, 40, 160)]),
      Animated.sequence([to(rig.armR, 40, 160), to(rig.armR, 70, 160)]),
      Animated.sequence([to(rig.legL, 22, 200), to(rig.legL, -6, 200)]),
      Animated.sequence([to(rig.legR, -6, 200), to(rig.legR, 22, 200)]),
    ]));
  };
  const drag = (nx: number, ny: number, vx: number) => {
    const { w: ww } = dims.current;
    const cx = clamp(nx, -SIZE * 0.35, ww - SIZE * 0.65), cy = clamp(ny, dims.current.top, dims.current.h - H * 0.45);
    x.setValue(cx); y.setValue(cy); pos.current = { x: cx, y: cy };
    spin.setValue(Number.isFinite(vx) ? clamp(-vx * 22, -30, 30) : 0);   // he swings against the way he is carried
  };
  const release = (rawVx: number, rawVy: number) => {
    const vx = Number.isFinite(rawVx) ? rawVx : 0, vy = Number.isFinite(rawVy) ? rawVy : 0;   // touches in the same instant give no speed
    stopLoops(); setFx({});
    if (Math.abs(vx) > 0.75 && Math.abs(vx) > Math.abs(vy) * 0.6) {
      if (dims.current.reduce) walkOff(vx < 0 ? 'left' : 'right', 'sad');
      else throwOut(vx < 0 ? 'left' : 'right', vx, vy);
    } else drop();
  };
  const drop = async () => {
    const my = fresh(); setMode('busy');
    const ty = floorY(), { y: y0 } = pos.current;
    play(spring(spin, 0, { friction: 4 }));
    if (y0 > ty) {
      if (!(await leap(my, pos.current.x, ty, 24, 300))) return;
    } else {
      const ms = Math.max(160, Math.sqrt((2 * (ty - y0)) / G) * 1000);
      await play(Animated.parallel([to(y, ty, ms, Easing.in(Easing.quad)), to(rig.legL, 14, ms), to(rig.legR, 14, ms), spring(sx, 1), spring(sy, 1)]));
      if (!still(my)) return;
      pos.current = { x: pos.current.x, y: ty };
      if (!(await land(my))) return;
      if (ty - y0 > dims.current.h * 0.35) say(t('guide.oof'), 1400);
    }
    const nx = clamp(pos.current.x, 6, dims.current.w - SIZE - 6);
    if (nx !== pos.current.x) { await play(to(x, nx, 220)); pos.current = { x: nx, y: ty }; }
    remember({ spot: clamp((nx - 6) / Math.max(1, dims.current.w - SIZE - 12), 0, 1) });
    setFace('happy'); rest(); setMode('bar'); run.where = 'bar';
  };
  const throwOut = async (side: 'left' | 'right', vx: number, vy: number) => {
    const my = fresh(); setMode('busy'); closeBubble();
    // he is gone from the moment he is thrown, even if the screen changes before he has walked off
    const mood: Mood = Math.random() < 0.5 ? 'sad' : 'mad';
    remember({ away: true, mood });
    setFace('wow'); setGloves(['open', 'open']);
    const { w: ww, top } = dims.current;
    const { x: x0, y: y0 } = pos.current;
    const floor = floorY();
    const wallX = side === 'left' ? -SIZE * 0.16 : ww - SIZE * 0.84;
    const speed = clamp(Math.abs(vx) * 1000, 900, 3400);
    const secs = clamp(Math.abs(wallX - x0) / speed, 0.12, 0.6);
    const vy0 = clamp(vy * 1000, -1500, 900);
    const yAt = (s: number) => clamp(y0 + vy0 * s + 0.5 * G * s * s, top, floor);
    loop(Animated.parallel([
      Animated.sequence([to(rig.armL, 85, 90), to(rig.armL, 35, 90)]), Animated.sequence([to(rig.armR, 35, 90), to(rig.armR, 85, 90)]),
      Animated.sequence([to(rig.legL, 26, 110), to(rig.legL, -8, 110)]), Animated.sequence([to(rig.legR, -8, 110), to(rig.legR, 26, 110)]),
    ]));
    await play(Animated.parallel([
      to(x, wallX, secs * 1000, Easing.linear),
      along(y, (p) => yAt(p * secs), secs * 1000),
      to(spin, side === 'left' ? -360 : 360, secs * 1000, Easing.linear),
    ]));
    if (!still(my)) return;
    // BONK
    stopLoops(); spin.setValue(0);
    const yHit = yAt(secs);
    pos.current = { x: wallX, y: yHit };
    haptic.warning();
    setFace('dizzy'); setGloves(['fist', 'fist']);
    setBonk({ side, y: yHit, id: Date.now() });
    const off = side === 'left' ? 16 : -16;
    await play(Animated.parallel([to(sx, 0.6, 70), to(sy, 1.12, 70)]));   // flattened against the side
    if (!still(my)) return;
    wobble();
    await play(Animated.parallel([to(x, wallX + off, 240, Easing.out(Easing.quad)), arms(-30, -30, 200)]));
    if (!still(my)) return;
    // down the wall to the floor, landing on his bottom
    const fallMs = Math.max(180, Math.sqrt((2 * Math.max(0, floor - yHit)) / G) * 1000);
    await play(Animated.parallel([
      to(y, floor + SIT, fallMs, Easing.in(Easing.quad)),
      to(spin, side === 'left' ? 22 : -22, fallMs),
      to(rig.legL, 40, fallMs), to(rig.legR, 40, fallMs),
    ]));
    if (!still(my)) return;
    pos.current = { x: wallX + off, y: floor + SIT };
    haptic.tap();
    play(Animated.parallel([to(sy, 0.8, 80), to(sx, 1.15, 80)])).then((ok) => { if (ok && still(my)) wobble(); });
    play(Animated.parallel([spring(spin, 0, { friction: 5 }), to(rig.legL, 70, 160), to(rig.legR, 70, 160)]));
    setBits({ stars: true });
    await pause(1300);
    if (!still(my)) return;
    // then he takes it badly
    setBits(mood === 'sad' ? { drops: true } : { steam: true });
    if (mood === 'sad') {
      setFace('cry'); setFx({ tears: 'cry' });
      play(arms(4, 4, 200));
      loop(Animated.sequence([to(sy, 0.95, 110), to(sy, 1.03, 110)]));
      say(t('guide.leaveSad'), 2300);
    } else {
      setFace('mad'); setFx({ anger: true });
      play(arms(-40, -40, 160));
      loop(Animated.sequence([to(lean, -4, 70), to(lean, 4, 70)]));
      say(t('guide.leaveMad'), 2300);
    }
    await pause(2300);
    if (!still(my)) return;
    stopLoops(); closeBubble();
    walkOff(side, mood, my);
  };
  /** Gets up and walks out through the side, then waits in the tab. */
  const walkOff = async (side: 'left' | 'right', mood: Mood, mine?: number) => {
    const my = mine ?? fresh();
    setMode('busy'); closeBubble();
    remember({ away: true, mood });
    if (mine === undefined) { setFace('sad'); setFx({ tears: 'sad' }); setBits({}); }
    lean.setValue(0); sy.setValue(1);
    const floor = floorY();
    await play(Animated.parallel([to(y, floor, 200), to(rig.legL, 0, 200), to(rig.legR, 0, 200)]));
    if (!still(my)) return;
    const exit = side === 'left' ? -SIZE - 8 : dims.current.w + 8;
    const ms = (Math.abs(exit - pos.current.x) / (mood === 'mad' ? 280 : 130)) * 1000;
    const step = mood === 'mad' ? 110 : 190;
    loop(Animated.parallel([
      Animated.sequence([Animated.parallel([to(rig.legL, 22, step), to(rig.legR, -12, step)]), Animated.parallel([to(rig.legL, -12, step), to(rig.legR, 22, step)])]),
      Animated.sequence([to(sy, 0.96, step), to(sy, 1.02, step)]),
    ]));
    await play(to(x, exit, dims.current.reduce ? 300 : ms, Easing.linear));
    if (!still(my)) return;
    pos.current = { x: exit, y: floor };
    showTab(mood);
  };

  // ------------------------------------------------------------ taps
  const tap = () => {
    const m = modeRef.current;
    if (m === 'peek') { haptic.tap(); toBar(); return; }
    if (m !== 'bar') return;
    const b = bubbleRef.current;
    if (b?.kind === 'intro') { nextIntro(); return; }
    if (!saved?.introduced) { haptic.tap(); doIntro(0); return; }
    if (b && b.kind !== 'hint' && b.kind !== 'say') { closeBubble(); setFace('happy'); rest(); return; }
    haptic.tap(); menu();
  };

  // the gestures are made once; they reach today's functions through this
  const act = useRef({ tap, pickUp, drag, release });
  act.current = { tap, pickUp, drag, release };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => modeRef.current === 'peek' || modeRef.current === 'bar',
    onPanResponderTerminationRequest: () => !press.current.held,
    onPanResponderGrant: () => {
      const p = press.current;
      p.held = false; p.moved = false; p.bx = pos.current.x; p.by = pos.current.y;
      if (p.timer) clearTimeout(p.timer);
      p.timer = setTimeout(() => { p.timer = null; if (!p.moved && live.current) act.current.pickUp(); }, 300);
    },
    onPanResponderMove: (_, g) => {
      const p = press.current;
      if (p.held) { act.current.drag(p.bx + g.dx, p.by + g.dy - LIFT, g.vx); return; }
      if (Math.abs(g.dx) + Math.abs(g.dy) > 12) { p.moved = true; if (p.timer) { clearTimeout(p.timer); p.timer = null; } }
    },
    onPanResponderRelease: (_, g) => {
      const p = press.current;
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      if (p.held) { p.held = false; act.current.release(g.vx, g.vy); } else if (!p.moved) act.current.tap();
    },
    onPanResponderTerminate: () => {
      const p = press.current;
      if (p.timer) { clearTimeout(p.timer); p.timer = null; }
      if (p.held) { p.held = false; act.current.release(0, 0); }
    },
  })).current;

  // ------------------------------------------------------------ his day
  useEffect(() => {
    live.current = true;
    if (!dims.current.reduce) {
      Animated.loop(Animated.sequence([to(breath, 1.03, 1300), to(breath, 1, 1300)])).start();
      Animated.loop(Animated.sequence([to(rig.sprout, 7, 1500), to(rig.sprout, -5, 1500)])).start();
    }
    const s = saved;
    if (s?.away) showTab(s.mood);
    else if (s?.introduced || run.where === 'bar') popUp();
    else if (run.where === 'tab' && run.peeks >= 2) showTab(null);
    else later(run.peeks ? 700 : 1800, () => { peek(); });
    // blinking, now and then, with open eyes
    const blink = () => later(2400 + Math.random() * 3600, () => {
      if (OPEN_EYES.has(faceRef.current) && modeRef.current !== 'held') {
        Animated.sequence([to(rig.blink, 0.08, 60), to(rig.blink, 1, 90)]).start();
        Animated.sequence([to(tabRig.blink, 0.08, 60), to(tabRig.blink, 1, 90)]).start();
      }
      blink();
    });
    blink();
    // fidgets on the bar, and the tips
    const idle = () => later(6000 + Math.random() * 5000, () => {
      if (modeRef.current === 'bar' && !bubbleRef.current) {
        const r = Math.random();
        if (r < 0.4) look();
        else if (r < 0.6) wave(Math.random() < 0.5 ? 'L' : 'R', 2);
        else if (r < 0.75 && !dims.current.reduce) hop(scene.current);
      }
      idle();
    });
    idle();
    const tipCheck = () => later(5000, () => {
      if (modeRef.current === 'bar' && !bubbleRef.current && saved?.introduced && !saved.away && !dims.current.menuOpen
        && AppState.currentState === 'active' && run.tips < TIPS_PER_RUN && Date.now() >= run.nextTipAt) showTip();
      tipCheck();
    });
    tipCheck();
    return () => {
      live.current = false;
      timers.current.forEach(clearTimeout); timers.current.clear();
      if (press.current.timer) clearTimeout(press.current.timer);
      stopAll(); breath.stopAnimation(); rig.sprout.stopAnimation();
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // the side menu opening over him closes what he was saying
  useEffect(() => { if (menuOpen && bubbleRef.current) closeBubble(); }, [menuOpen]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Android back closes his bubble before it leaves the screen
  const talking = !!bubble && bubble.kind !== 'hint' && bubble.kind !== 'say';
  useEffect(() => {
    if (!talking) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (bubbleRef.current?.kind === 'intro') endIntro(); else { closeBubble(); setFace('happy'); rest(); }
      return true;
    });
    return () => sub.remove();
  }, [talking]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the screen changed size (the bar grew with bigger text, say): back onto the bar
  useEffect(() => { if (modeRef.current === 'bar') place(spotX(), floorY()); }, [w, h]);   // eslint-disable-line react-hooks/exhaustive-deps
  // reduce motion switched on: no more breathing and swaying
  useEffect(() => {
    if (!reduce) return;
    breath.stopAnimation(); breath.setValue(1);
    rig.sprout.stopAnimation(); rig.sprout.setValue(0);
  }, [reduce]);   // eslint-disable-line react-hooks/exhaustive-deps

  const inTab = mode === 'tab';
  const tabFace: Face = tabMood === 'mad' ? 'mad' : tabMood === 'sad' ? 'sad' : 'happy';
  return (
    <>
      <Animated.View pointerEvents="box-none" style={[s.mascot, { transform: [{ translateX: x }, { translateY: y }] }]}>
        <Animated.View
          {...pan.panHandlers}
          pointerEvents={inTab || mode === 'off' ? 'none' : 'auto'}
          accessible={!inTab}
          accessibilityRole="button"
          accessibilityLabel={t('guide.a11yLabel', { name })}
          accessibilityHint={t('guide.a11yHint', { name })}
          accessibilityActions={[{ name: 'activate' }, { name: 'dismiss', label: t('guide.a11yAway', { name }) }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'activate') tap();
            else if (e.nativeEvent.actionName === 'dismiss' && (modeRef.current === 'bar' || modeRef.current === 'peek')) walkOff('left', 'sad');
          }}
          style={{ width: SIZE, height: H, transform: [{ rotate: deg(spin) }, ...about(PIVOT.feet, SIZE, { rotate: deg(lean) }, { scaleX: sx }, { scaleY: Animated.multiply(sy, breath) })] }}
        >
          <CuatroRig size={SIZE} face={face} gloves={gloves} v={rig} extras={fx} />
          {bits.stars ? <DizzyStars /> : null}
          {bits.drops ? <Drops /> : null}
          {bits.steam ? <Steam /> : null}
        </Animated.View>
      </Animated.View>

      {bonk ? <Bonk key={bonk.id} side={bonk.side} y={bonk.y} w={w} text={t('guide.ouch')} onDone={() => setBonk(null)} /> : null}

      {bubble ? (
        <SpeechBubble key={bubble.id} at={bubble.at} w={w}
          onPress={bubble.kind === 'intro' ? nextIntro : bubble.kind === 'say' || bubble.kind === 'hint' ? () => { closeBubble(); if (modeRef.current === 'peek') toBar(); } : undefined}
          onClose={bubble.kind === 'menu' || bubble.kind === 'line' ? () => { closeBubble(); setFace('happy'); rest(); } : undefined}
          closeLabel={t('guide.close')}>
          {bubble.kind === 'hint' || bubble.kind === 'say' ? <Text style={s.say}>{bubble.text}</Text> : null}
          {bubble.kind === 'intro' ? (
            <>
              <Text style={s.kicker}>{name}</Text>
              <Text style={s.text}>{t(`guide.intro${bubble.step + 1}`, { name })}</Text>
              <View style={s.row}>
                {bubble.step + 1 < INTRO.length ? (
                  <>
                    <TouchableOpacity onPress={() => { haptic.tap(); endIntro(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                      <Text style={s.skip}>{t('guide.skip')}</Text>
                    </TouchableOpacity>
                    <Text style={s.hint}>{t('guide.tapToContinue')}  {bubble.step + 1}/{INTRO.length}</Text>
                  </>
                ) : (
                  <Btn label={t('guide.introDone')} onPress={() => { haptic.success(); endIntro(); }} />
                )}
              </View>
            </>
          ) : null}
          {bubble.kind === 'menu' ? (
            <>
              <Text style={s.title}>{t('guide.helpTitle')}</Text>
              <View style={s.chips}>
                {TOPICS.map((k) => (
                  <TouchableOpacity key={k} style={s.chip} onPress={() => ask(k)} activeOpacity={0.8} accessibilityRole="button">
                    <Text style={s.chipText}>{t(`guide.topic_${k}`)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
          {bubble.kind === 'line' ? (
            <>
              {bubble.tip ? <Text style={s.kicker}>{t('guide.psst')}</Text> : null}
              <Text style={s.text}>{bubble.line.text}</Text>
              <View style={s.row}>
                {bubble.line.cta ? <Btn label={bubble.line.cta.label} onPress={() => follow(bubble.line)} /> : null}
                {!bubble.tip ? (
                  <TouchableOpacity onPress={() => { haptic.select(); menu(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                    <Text style={s.more}>{t('guide.moreHelp')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          ) : null}
        </SpeechBubble>
      ) : null}

      {/* his tab on the left edge, only while he is off the screen */}
      <Animated.View pointerEvents={inTab ? 'box-none' : 'none'} style={[s.tab, { top: Math.max(dims.current.top, h * 0.56 - TAB_H / 2), transform: [{ translateX: tabX }] }]}>
        <Pressable onPress={() => { if (modeRef.current === 'tab') comeBack(); }} style={s.tabInner} accessibilityRole="button" accessibilityLabel={t('guide.a11yTab', { name })} hitSlop={{ top: 6, bottom: 6, right: 10 }}>
          {tabUp ? (
            <View style={s.tabPeek} pointerEvents="none">
              <CuatroRig size={60} face={tabFace} gloves={['fist', 'fist']} v={tabRig} extras={tabMood === 'sad' ? { tears: 'sad' } : tabMood === 'mad' ? { anger: true } : undefined} id="t" />
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </>
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.btn} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** His speech bubble, just over his head, with its tail pointing at him. */
function SpeechBubble({ at, w, onPress, onClose, closeLabel, children }: {
  at: { x: number; bottom: number }; w: number; onPress?: () => void; onClose?: () => void; closeLabel: string; children: ReactNode;
}) {
  const width = Math.min(300, w - 24);
  const left = clamp(at.x - width / 2, 12, w - 12 - width);
  const tail = clamp(at.x - left, 20, width - 20);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, friction: 6, tension: 140, ...N }).start(); }, [pop]);
  const body = (
    <View style={s.bubbleBody}>
      {children}
      {onClose ? (
        <TouchableOpacity style={s.x} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.xText}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
  return (
    <Animated.View accessibilityLiveRegion="polite" style={[s.bubble, { width, left, bottom: at.bottom + 12, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
      {onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body}
      <View style={[s.tail, { left: tail - 8 }]} />
    </Animated.View>
  );
}

/** Stars going round his head after he hits the wall. */
function DizzyStars() {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => { const l = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1100, easing: Easing.linear, ...N })); l.start(); return () => l.stop(); }, [turn]);
  const steps = 12, input = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  const rx = SIZE * 0.36, ry = SIZE * 0.09, cx = SIZE / 2 - 8, cy = SIZE * 0.04;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0, 1 / 3, 2 / 3].map((ph, k) => {
        const a = (i: number) => 2 * Math.PI * (input[i] + ph);
        return (
          <Animated.View key={k} style={{ position: 'absolute', width: 16, height: 16, transform: [
            { translateX: turn.interpolate({ inputRange: input, outputRange: input.map((_, i) => cx + rx * Math.cos(a(i))) }) },
            { translateY: turn.interpolate({ inputRange: input, outputRange: input.map((_, i) => cy + ry * Math.sin(a(i))) }) },
            { scale: turn.interpolate({ inputRange: input, outputRange: input.map((_, i) => 0.8 + 0.25 * Math.sin(a(i))) }) },
          ] }}>
            <Part layer={STAR} w={16} pre={`ds${k}_`} box="-32 -32 64 64" />
          </Animated.View>
        );
      })}
    </View>
  );
}
const STAR = star();

/** Tears dripping off the ends of his crying fountains. */
function Drops() {
  const fall = useRef(new Animated.Value(0)).current;
  useEffect(() => { const l = Animated.loop(Animated.timing(fall, { toValue: 1, duration: 650, easing: Easing.in(Easing.quad), ...N })); l.start(); return () => l.stop(); }, [fall]);
  const sc = SIZE / 580, y0 = (122 + 262) * sc;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[-1, 1].map((side) => (
        <Animated.View key={side} style={{ position: 'absolute', left: SIZE / 2 + side * 182 * sc - 5, top: y0, opacity: fall.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] }), transform: [{ translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] }}>
          <Part layer={DROP} w={10} pre={`dr${side}_`} box="-16 -22 32 44" />
        </Animated.View>
      ))}
    </View>
  );
}

/** Steam out of his top when he is mad. */
function Steam() {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => { const l = Animated.loop(Animated.timing(rise, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), ...N })); l.start(); return () => l.stop(); }, [rise]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0.26, 0.74].map((fx, k) => (
        <Animated.View key={k} style={[s.puff, { left: SIZE * fx - 6, top: SIZE * 0.08, opacity: rise.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.95, 0] }), transform: [
          { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
          { translateX: rise.interpolate({ inputRange: [0, 1], outputRange: [0, (k ? 1 : -1) * 6] }) },
          { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) },
        ] }]} />
      ))}
    </View>
  );
}

/** The comic "BONK!" where he hits the side. */
function Bonk({ side, y, w, text, onDone }: { side: 'left' | 'right'; y: number; w: number; text: string; onDone: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(pop, { toValue: 1, duration: 160, easing: Easing.out(Easing.back(2.5)), ...N }), Animated.delay(450), Animated.timing(pop, { toValue: 0, duration: 200, ...N }),
    ]).start(() => done.current());
  }, [pop]);
  return (
    <Animated.View pointerEvents="none" style={[s.bonk, side === 'left' ? { left: 6 } : { left: w - 96 }, { top: Math.max(8, y - 8), opacity: pop, transform: [{ rotate: side === 'left' ? '-12deg' : '12deg' }, { scale: pop }] }]}>
      <Text style={s.bonkText} maxFontSizeMultiplier={1}>{text}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  mascot: { position: 'absolute', left: 0, top: 0, width: SIZE, height: H },
  bubble: {
    position: 'absolute', backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#BBF7D0',
    shadowColor: '#0F2038', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  bubbleBody: { paddingVertical: 12, paddingLeft: 14, paddingRight: 30, gap: 6 },
  tail: {
    position: 'absolute', bottom: -8, width: 16, height: 16, backgroundColor: '#fff', transform: [{ rotate: '45deg' }],
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#BBF7D0',
  },
  kicker: { fontSize: 11, fontWeight: '900', color: '#15803D', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  text: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  say: { fontSize: 15, fontWeight: '700', color: COLORS.text, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  hint: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  skip: { fontSize: 13, color: COLORS.textMuted, fontWeight: '700' },
  more: { fontSize: 13, color: '#15803D', fontWeight: '800' },
  btn: { backgroundColor: '#15803D', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 11 },
  chipText: { fontSize: 13, fontWeight: '800', color: '#14532D' },
  x: { position: 'absolute', top: 8, right: 10 },
  xText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },
  tab: { position: 'absolute', left: 0, width: TAB_W, height: TAB_H },
  tabInner: {
    flex: 1, backgroundColor: '#fff', borderTopRightRadius: 22, borderBottomRightRadius: 22, borderWidth: 1, borderLeftWidth: 0, borderColor: '#BBF7D0',
    shadowColor: '#0F2038', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 2, height: 3 }, elevation: 6, overflow: 'hidden',
  },
  tabPeek: { position: 'absolute', left: -20, top: 2 },
  puff: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#CBD5E1' },
  bonk: { position: 'absolute', backgroundColor: '#FFC533', borderColor: '#0F2038', borderWidth: 2.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  bonkText: { fontSize: 20, fontWeight: '900', color: '#0F2038', letterSpacing: 0.5 },
});
