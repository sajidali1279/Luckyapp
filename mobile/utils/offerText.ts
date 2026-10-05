// An offer's words in Spanish: the Spanish title, description and deal text HQ wrote, each one only where it was written (the English
// otherwise). The rest of the app reads title, description and dealText as before.
export interface OfferWords { title?: string; description?: string | null; dealText?: string | null; titleEs?: string | null; descriptionEs?: string | null; dealTextEs?: string | null }

export function spanishOffer<T extends OfferWords>(o: T): T {
  return {
    ...o,
    title: o.titleEs?.trim() || o.title,
    description: o.descriptionEs?.trim() || o.description,
    dealText: o.dealText ? (o.dealTextEs?.trim() || o.dealText) : o.dealText,   // a deal stays a deal; a promotion gets no deal text
  };
}
