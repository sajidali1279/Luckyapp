export interface LabelBase {
  priceText: string;
}

export interface StoreLabelOverride {
  priceText: string | null;
}

/**
 * A store's effective price for a catalog item: its own override if it has
 * one, otherwise the catalog's base price. The one place this logic lives —
 * every layer that needs an effective price (API responses, print HTML,
 * admin/mobile display) calls this instead of reimplementing the fallback.
 */
export function resolveEffectivePrice(label: LabelBase, storeLabel?: StoreLabelOverride | null): string {
  return storeLabel?.priceText ?? label.priceText;
}
