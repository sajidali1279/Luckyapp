// Common gas-station drinks & chips with realistic Texas convenience-store
// pricing (researched Aug 2026 — Dallas 7-Eleven, gas-station energy drink
// and chip pricing surveys) to speed up building a store's first label batch.
// Prices are starting points, not live data — always editable per label.
export interface LabelPreset {
  name: string;
  category: 'Drinks' | 'Chips & Snacks';
  priceText: string;
}

export const LABEL_PRESETS: LabelPreset[] = [
  // ── Drinks ──────────────────────────────────────────────────────────────
  { name: 'Monster Energy 16oz', category: 'Drinks', priceText: '$3.29' },
  { name: 'Monster Ultra 16oz', category: 'Drinks', priceText: '$3.29' },
  { name: 'Monster Zero Ultra 16oz', category: 'Drinks', priceText: '$3.29' },
  { name: 'Red Bull 8.4oz', category: 'Drinks', priceText: '$2.99' },
  { name: 'Red Bull 12oz', category: 'Drinks', priceText: '$3.49' },
  { name: 'Bang Energy 16oz', category: 'Drinks', priceText: '$2.99' },
  { name: 'Celsius 12oz', category: 'Drinks', priceText: '$2.99' },
  { name: 'Reign Energy 16oz', category: 'Drinks', priceText: '$3.29' },
  { name: '5-Hour Energy 1.93oz', category: 'Drinks', priceText: '$3.99' },
  { name: 'Coca-Cola 20oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'Pepsi 20oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'Dr Pepper 20oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'Sprite 20oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'Mountain Dew 20oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'Big Red 20oz', category: 'Drinks', priceText: '$2.49' },
  { name: 'Fanta Orange 20oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'Dr Pepper 2 Liter', category: 'Drinks', priceText: '$3.49' },
  { name: 'Gatorade 28oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'Powerade 32oz', category: 'Drinks', priceText: '$2.79' },
  { name: 'BodyArmor 16oz', category: 'Drinks', priceText: '$2.99' },
  { name: 'Dasani Water 16.9oz', category: 'Drinks', priceText: '$1.79' },
  { name: 'Aquafina Water 16.9oz', category: 'Drinks', priceText: '$1.79' },
  { name: 'Smartwater 20oz', category: 'Drinks', priceText: '$2.49' },
  { name: 'Ozarka Water 16.9oz', category: 'Drinks', priceText: '$1.79' },
  { name: 'Topo Chico 12oz', category: 'Drinks', priceText: '$2.29' },
  { name: 'Arizona Iced Tea 23oz', category: 'Drinks', priceText: '$1.29' },
  { name: 'Snapple 16oz', category: 'Drinks', priceText: '$2.29' },
  { name: 'Minute Maid Lemonade 15.2oz', category: 'Drinks', priceText: '$2.29' },

  // ── Chips & Snacks ──────────────────────────────────────────────────────
  { name: "Doritos Nacho Cheese 2.75oz", category: 'Chips & Snacks', priceText: '$2.49' },
  { name: 'Doritos Cool Ranch 2.75oz', category: 'Chips & Snacks', priceText: '$2.49' },
  { name: 'Doritos Spicy Sweet Chili 2.75oz', category: 'Chips & Snacks', priceText: '$2.49' },
  { name: "Lay's Classic 2.625oz", category: 'Chips & Snacks', priceText: '$2.29' },
  { name: "Lay's Barbecue 2.625oz", category: 'Chips & Snacks', priceText: '$2.29' },
  { name: "Lay's Sour Cream & Onion 2.625oz", category: 'Chips & Snacks', priceText: '$2.29' },
  { name: 'Cheetos Crunchy 2oz', category: 'Chips & Snacks', priceText: '$2.29' },
  { name: "Cheetos Flamin' Hot 2oz", category: 'Chips & Snacks', priceText: '$2.49' },
  { name: 'Fritos Original 2oz', category: 'Chips & Snacks', priceText: '$2.29' },
  { name: 'Fritos Chili Cheese 2oz', category: 'Chips & Snacks', priceText: '$2.29' },
  { name: 'Takis Fuego 4oz', category: 'Chips & Snacks', priceText: '$3.49' },
  { name: 'Ruffles Original 2.625oz', category: 'Chips & Snacks', priceText: '$2.29' },
  { name: 'Ruffles Cheddar & Sour Cream 2.625oz', category: 'Chips & Snacks', priceText: '$2.29' },
  { name: 'Pringles Original 2.36oz', category: 'Chips & Snacks', priceText: '$2.49' },
  { name: 'Pringles Sour Cream & Onion 2.36oz', category: 'Chips & Snacks', priceText: '$2.49' },
  { name: 'Sun Chips Harvest Cheddar 2.75oz', category: 'Chips & Snacks', priceText: '$2.49' },
  { name: 'Funyuns Onion Rings 2.375oz', category: 'Chips & Snacks', priceText: '$2.29' },
  { name: 'Combos Pretzel Cheddar 1.7oz', category: 'Chips & Snacks', priceText: '$2.29' },
  { name: 'Cheez-It Original 3oz', category: 'Chips & Snacks', priceText: '$2.49' },
  { name: "Munchies Flamin' Hot Mix 3oz", category: 'Chips & Snacks', priceText: '$2.49' },
  { name: 'Tostitos Bite Size 2.75oz', category: 'Chips & Snacks', priceText: '$2.49' },
  { name: "Chester's Puffcorn 4.5oz", category: 'Chips & Snacks', priceText: '$2.29' },
  { name: "Jack Link's Beef Jerky Original 2.85oz", category: 'Chips & Snacks', priceText: '$6.99' },
  { name: 'Slim Jim Giant Stick', category: 'Chips & Snacks', priceText: '$2.29' },
];
