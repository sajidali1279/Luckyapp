// The mascot's name on the automated pushes (2026-10-25, admin > Engagement > Cuatro): while HQ has the mascot and its push signature on,
// the smart nudges, the welcome series, the birthday push and the challenge-of-the-week push start with the mascot's name, as if it wrote
// them ("Cuatro: 🎁 So close!"). Pushes about a sale, an order, a payout or an alert the customer set up never do.
import { engagement } from './appSettings';

export function voiced(title: string): string {
  const m = engagement().mascot;
  return m.enabled && m.pushVoice ? `${m.name}: ${title}` : title;
}
