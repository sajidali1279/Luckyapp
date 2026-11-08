// Who saw and tapped a business promotion (2026-11-08): the app tells the server once per promotion, kind and day, in small batches, so
// Lucky Stop can show a business real numbers when it charges for an ad. Never a reason for anything to fail.
import { promotionsApi } from '../services/api';

export type PromoSource = 'ads' | 'home' | 'cuatro';
type Item = { id: string; kind: 'VIEW' | 'TAP'; source: PromoSource };

const sent = new Set<string>();
let queue: Item[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

function flush() {
  timer = null;
  const items = queue.splice(0, 50);
  if (items.length) promotionsApi.seen(items).catch(() => {});
  if (queue.length) timer = setTimeout(flush, 1500);
}

/** A promotion was shown (VIEW) or acted on (TAP): sent once per promotion, kind and day from this phone. */
export function promoSeen(id: string | null | undefined, kind: 'VIEW' | 'TAP', source: PromoSource) {
  if (!id) return;
  const key = `${today()}|${id}|${kind}`;
  if (sent.has(key)) return;
  sent.add(key);
  queue.push({ id, kind, source });
  if (!timer) timer = setTimeout(flush, 1500);
}
