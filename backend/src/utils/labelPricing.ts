export interface LabelBase {
  priceText: string | null;
}

export interface StoreLabelOverride {
  priceText: string | null;
}

/**
 * A store's effective price for a catalog item: its own override if it has
 * one, otherwise the catalog's base price — which can itself be null (a
 * Label created from a scan, before anyone has set a price). Every layer
 * that needs an effective price calls this instead of reimplementing the
 * fallback; a null result means "no price at all," which every caller must
 * treat as non-printable, never as an empty string.
 */
export function resolveEffectivePrice(label: LabelBase, storeLabel?: StoreLabelOverride | null): string | null {
  return storeLabel?.priceText ?? label.priceText;
}
