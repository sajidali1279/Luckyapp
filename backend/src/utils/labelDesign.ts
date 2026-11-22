// Label designs HQ makes (2026-11-21, admin Labels > Designs). The settings are checked strictly here because the HQ website and the
// app turn them straight into the CSS of a printed page: colours are only #rrggbb, every choice is from a fixed list, every number has
// a range. The same shape lives in admin/src/utils/labelDesign.ts and mobile/utils/labelDesign.ts (keep the three the same).
import { z } from 'zod';

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'A colour is a # and six letters or numbers, like #b91c1c.').transform((v) => v.toLowerCase());
const range = (min: number, max: number, what: string) =>
  z.number({ message: `Give the ${what} as a number.` }).min(min, `The ${what} is at least ${min}.`).max(max, `The ${what} is at most ${max}.`);

export const FRAME_SHAPES = ['square', 'rounded', 'pill', 'double', 'dashed', 'dotted', 'none'] as const;
export const STRIPE_SIDES = ['none', 'top', 'bottom', 'left'] as const;
export const FONTS = ['sans', 'serif', 'condensed', 'rounded'] as const;

export const designSettingsSchema = z.object({
  frame: z.object({ shape: z.enum(FRAME_SHAPES), color: hex, width: range(0.5, 4, 'frame thickness') }),
  stripe: z.object({ side: z.enum(STRIPE_SIDES), color: hex, size: range(1, 6, 'stripe size') }),
  colors: z.object({ name: hex, price: hex, deal: hex }),
  sizes: z.object({ name: range(0.7, 1.5, 'name size'), price: range(0.7, 1.4, 'price size'), deal: range(0.7, 1.4, 'deal size') }),
  font: z.enum(FONTS),
  nameBold: z.boolean(),
  // a small mark before the name: an emoji or one or two characters (shown as text, never as markup)
  icon: z.string().trim().max(8, 'The icon is one or two characters.').default(''),
  showBarcode: z.boolean(),
  watermark: z.boolean(),
}).strict();
export type DesignSettings = z.infer<typeof designSettingsSchema>;

export const designSchema = z.object({
  name: z.string({ message: 'Give the design a name.' }).trim().min(1, 'Give the design a name.').max(40, 'Keep the name under 40 characters.'),
  settings: designSettingsSchema,
}).strict();

/** A label's own size nudge: 70% to 140% of its design, in 5% steps (null = as the design). */
export const textScaleField = z.number().min(0.7, 'The text can be made at most 30% smaller.').max(1.4, 'The text can be made at most 40% bigger.')
  .transform((v) => Math.round(v * 20) / 20).nullable();
