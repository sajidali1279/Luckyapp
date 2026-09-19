import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Cart, addEntries, bumpEntry, removeEntries, setEntryQuantity, setEntryPrice, pruneEntries,
} from '../utils/labelCart';

interface LabelCartState {
  // Keyed by cartKey(userId, storeId); see utils/labelCart.ts for the rules.
  carts: Record<string, Cart>;
  add: (key: string, labelIds: string[]) => void;
  // Scanning an item already in the cart adds one more copy. Returns the
  // resulting quantity so the caller can say "x2 in My Prints".
  addOrBump: (key: string, labelId: string) => number;
  remove: (key: string, labelIds: string[]) => void;
  setQuantity: (key: string, labelId: string, qty: number) => void;
  setPrice: (key: string, labelId: string, price: string | null, expiryDays: number | null) => void;
  clear: (key: string) => void;
  prune: (key: string, validIds: ReadonlySet<string>) => void;
}

// Writes one cart back, dropping the key entirely once it's empty so storage
// doesn't accumulate a stub for every user/store pair that ever opened Labels.
function withCart(carts: Record<string, Cart>, key: string, next: Cart): Record<string, Cart> {
  if (carts[key] === next) return carts;
  const out = { ...carts };
  if (Object.keys(next).length === 0) delete out[key];
  else out[key] = next;
  return out;
}

export const useLabelCart = create<LabelCartState>()((set, get) => ({
  carts: {},

  add: (key, labelIds) =>
    set(s => ({ carts: withCart(s.carts, key, addEntries(s.carts[key] ?? {}, labelIds)) })),

  addOrBump: (key, labelId) => {
    const { cart, quantity } = bumpEntry(get().carts[key] ?? {}, labelId);
    set(s => ({ carts: withCart(s.carts, key, cart) }));
    return quantity;
  },

  remove: (key, labelIds) =>
    set(s => ({ carts: withCart(s.carts, key, removeEntries(s.carts[key] ?? {}, labelIds)) })),

  setQuantity: (key, labelId, qty) =>
    set(s => ({ carts: withCart(s.carts, key, setEntryQuantity(s.carts[key] ?? {}, labelId, qty)) })),

  setPrice: (key, labelId, price, expiryDays) =>
    set(s => ({ carts: withCart(s.carts, key, setEntryPrice(s.carts[key] ?? {}, labelId, price, expiryDays)) })),

  clear: key =>
    set(s => ({ carts: withCart(s.carts, key, {}) })),

  prune: (key, validIds) =>
    set(s => {
      const current = s.carts[key];
      return current ? { carts: withCart(s.carts, key, pruneEntries(current, validIds)) } : s;
    }),
}));

// ── Persistence ───────────────────────────────────────────────────────────────
// Kept on the phone so an app restart doesn't lose a half-built list.
//
// Hand-rolled on purpose instead of zustand's `persist` middleware: the
// `zustand/middleware` entry point ships an ESM build that uses `import.meta`,
// which Metro can resolve for the app bundle and which fails to evaluate. The
// plain `zustand` entry (all authStore.ts uses) has no such problem.

const STORAGE_KEY = 'label-cart-v1';
const STORAGE_VERSION = 1;

AsyncStorage.getItem(STORAGE_KEY)
  .then(raw => {
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.version !== STORAGE_VERSION || typeof saved.carts !== 'object' || !saved.carts) return;
    // Anything already changed since launch wins over what was saved.
    useLabelCart.setState(s => ({ carts: { ...saved.carts, ...s.carts } }));
  })
  .catch(() => {});

useLabelCart.subscribe((state, prev) => {
  if (state.carts === prev.carts) return;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, carts: state.carts })).catch(() => {});
});
