// Sizes and add-ons on a hot food item (2026-11-14, the owner's "build your own" loaded chips): the customer picks a size (a small or a
// large bag) and any add-ons (pico de gallo, beans, cheeses...), each add-on priced per size, and the price adds up. HQ sets them on the
// catalog item (admin Hot food > Catalog > the item > Sizes and add-ons). Kept as JSON on the item; an order line keeps what was chosen.
//
// Price of one = the item's price + the size's price + each add-on's price for that size. With no sizes, add-ons have one price ('one').

export interface ItemSize { id: string; name: string; nameEs?: string | null; price: number }
export interface ItemAddOn { id: string; name: string; nameEs?: string | null; prices: Record<string, number>; active: boolean }
export interface ItemOptions { sizes: ItemSize[]; addOns: ItemAddOn[]; maxAddOns: number | null }
export const ONE = 'one';   // the add-on price key when the item has no sizes

const MAX_SIZES = 6, MAX_ADDONS = 40, MAX_PICK = 25;
const money = (n: unknown, max: number): number | null => {
  const v = typeof n === 'string' ? Number(n) : n;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return null;
  return Math.round(v * 100) / 100;
};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';

/** HQ's sizes and add-ons, checked: null when there are none; an error in words when something is wrong (nothing is silently dropped). */
export function cleanOptions(v: unknown): { data: ItemOptions | null } | { error: string } {
  if (v === null || v === undefined) return { data: null };
  if (typeof v !== 'object') return { error: 'Send the sizes and add-ons as a list.' };
  const o = v as any;
  const rawSizes = Array.isArray(o.sizes) ? o.sizes : [];
  const rawAdds = Array.isArray(o.addOns) ? o.addOns : [];
  if (rawSizes.length > MAX_SIZES) return { error: `At most ${MAX_SIZES} sizes.` };
  if (rawAdds.length > MAX_ADDONS) return { error: `At most ${MAX_ADDONS} add-ons.` };
  const used = new Set<string>();
  const idFor = (given: unknown, name: string) => {
    let id = typeof given === 'string' && /^[a-z0-9-]{1,32}$/.test(given) ? given : slug(name);
    while (used.has(id)) id = `${id.slice(0, 28)}-${used.size}`;
    used.add(id);
    return id;
  };
  const sizes: ItemSize[] = [];
  for (const s of rawSizes) {
    const name = text(s?.name, 30);
    if (!name) return { error: 'Give every size a name, like Small or Large.' };
    if (sizes.some((x) => x.name.toLowerCase() === name.toLowerCase())) return { error: `Two sizes are called "${name}".` };
    const price = money(s?.price ?? 0, 100);
    if (price === null) return { error: `The price of the ${name} size must be from $0 to $100.` };
    sizes.push({ id: idFor(s?.id, name), name, nameEs: text(s?.nameEs, 30) || null, price });
  }
  const keys = sizes.length ? sizes.map((s) => s.id) : [ONE];
  const addOns: ItemAddOn[] = [];
  for (const a of rawAdds) {
    const name = text(a?.name, 40);
    if (!name) return { error: 'Give every add-on a name, like Pico de gallo.' };
    if (addOns.some((x) => x.name.toLowerCase() === name.toLowerCase())) return { error: `Two add-ons are called "${name}".` };
    const prices: Record<string, number> = {};
    for (const k of keys) {
      // a size the add-on has no price for yet: the price it has for another size, else $0 (HQ sees it in the table)
      const given = a?.prices?.[k] ?? (sizes.length ? undefined : a?.price);
      const p = money(given ?? 0, 50);
      if (p === null) return { error: `The price of ${name}${sizes.length ? ` (${sizes.find((s) => s.id === k)?.name})` : ''} must be from $0 to $50.` };
      prices[k] = p;
    }
    addOns.push({ id: idFor(a?.id, name), name, nameEs: text(a?.nameEs, 40) || null, prices, active: a?.active !== false });
  }
  let maxAddOns: number | null = null;
  if (o.maxAddOns !== undefined && o.maxAddOns !== null && o.maxAddOns !== '') {
    const m = Number(o.maxAddOns);
    if (!Number.isInteger(m) || m < 1 || m > MAX_PICK) return { error: `The most add-ons in one order must be from 1 to ${MAX_PICK}.` };
    maxAddOns = m;
  }
  if (!sizes.length && !addOns.length) return { data: null };
  return { data: { sizes, addOns, maxAddOns } };
}

/** The options as stored (any JSON from the database), or null */
export function optionsOf(v: unknown): ItemOptions | null {
  const c = cleanOptions(v);
  return 'data' in c ? c.data : null;
}

/** One line's price and words for what the customer chose, or why it cannot be ordered */
export function priceChoice(item: { name: string; price: number; options?: unknown }, sizeId: string | null | undefined, addOnIds: string[] | null | undefined):
  { unit: number; label: string; chosen: { size: string | null; addOns: string[] } } | { error: string } {
  const o = optionsOf(item.options);
  const picks = [...new Set((addOnIds ?? []).filter((x) => typeof x === 'string'))];
  if (!o) {
    if (sizeId || picks.length) return { error: `${item.name} has no sizes or add-ons any more. Refresh the menu and try again.` };
    return { unit: item.price, label: item.name, chosen: { size: null, addOns: [] } };
  }
  let size: ItemSize | null = null;
  if (o.sizes.length) {
    size = o.sizes.find((s) => s.id === sizeId) ?? null;
    if (!size) return { error: `Choose a size for ${item.name}.` };
  } else if (sizeId) return { error: `${item.name} has no sizes. Refresh the menu and try again.` };
  const key = size ? size.id : ONE;
  const adds: ItemAddOn[] = [];
  for (const id of picks) {
    const a = o.addOns.find((x) => x.id === id);
    if (!a || !a.active) return { error: `An add-on for ${item.name} is not available any more. Refresh the menu and try again.` };
    adds.push(a);
  }
  if (o.maxAddOns && adds.length > o.maxAddOns) return { error: `${item.name} can have up to ${o.maxAddOns} add-ons.` };
  if (adds.length > MAX_PICK) return { error: `Up to ${MAX_PICK} add-ons on one item.` };
  // in HQ's order, so the same choice reads the same way
  adds.sort((a, b) => o.addOns.indexOf(a) - o.addOns.indexOf(b));
  const unit = Math.round((item.price + (size?.price ?? 0) + adds.reduce((n, a) => n + (a.prices[key] ?? 0), 0)) * 100) / 100;
  const words = [size?.name, adds.length ? adds.map((a) => a.name).join(', ') : null].filter(Boolean).join(': ');
  return { unit, label: words ? `${item.name} (${words})` : item.name, chosen: { size: size?.name ?? null, addOns: adds.map((a) => a.name) } };
}

/** The cart line key an order uses for an item with choices: the same item with other choices is another line */
export function choiceKey(itemId: string, sizeId: string | null | undefined, addOnIds: string[] | null | undefined): string {
  return `opt:${itemId}|${sizeId ?? ''}|${[...new Set(addOnIds ?? [])].sort().join(',')}`;
}
export function parseChoiceKey(key: string): { itemId: string; sizeId: string | null; addOnIds: string[] } | null {
  if (!key.startsWith('opt:')) return null;
  const [itemId, sizeId, adds] = key.slice(4).split('|');
  return { itemId, sizeId: sizeId || null, addOnIds: adds ? adds.split(',').filter(Boolean) : [] };
}
