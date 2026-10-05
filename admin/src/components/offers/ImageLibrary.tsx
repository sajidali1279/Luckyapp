// The Lucky Stop picture library (lib/offerImages.ts): pick one of the ready-made offer pictures instead of looking for a file. It opens
// on the offer's own category; the picture chosen is uploaded like any other (as a file), so nothing else changes.
import { useState } from 'react';
import Modal from '../Modal';
import { Chip } from '../kit';
import { C, FONT, RADIUS } from '../../lib/theme';
import { OFFER_IMAGES, type OfferImage } from '../../lib/offerImages';

const CAT_LABEL: Record<string, string> = {
  GROCERIES: 'Groceries', FROZEN_FOODS: 'Frozen', FRESH_FOODS: 'Fresh', GAS: 'Gas', DIESEL: 'Diesel', HOT_FOODS: 'Hot Foods', OTHER: 'Other',
};

/** The picture as a file, ready for the form (the same upload as a picture chosen from the computer). */
export async function libraryFile(img: OfferImage): Promise<File> {
  const res = await fetch(img.src);
  if (!res.ok) throw new Error('Could not load that picture.');
  const blob = await res.blob();
  return new File([blob], img.src.split('/').pop() ?? 'offer.webp', { type: blob.type || 'image/webp' });
}

export function ImageLibrary({ category, onPick, onClose }: { category?: string | null; onPick: (img: OfferImage) => void; onClose: () => void }) {
  // Store-wide (no category) opens on Other: the gifts, stars and coins
  const [cat, setCat] = useState<string>(category && CAT_LABEL[category] ? category : 'OTHER');
  const shown = OFFER_IMAGES.filter((i) => i.category === cat);
  return (
    <Modal title="Lucky Stop pictures" subtitle="Ready-made offer pictures, 1200 x 600. Pick one; you can still change it later." onClose={onClose} maxWidth={860}>
      <div role="group" aria-label="Picture category" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {Object.entries(CAT_LABEL).map(([value, label]) => (
          <Chip key={value} selected={cat === value} onClick={() => setCat(value)}>
            {label} ({OFFER_IMAGES.filter((i) => i.category === value).length})
          </Chip>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 10, maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
        {shown.map((img) => (
          <button key={img.src} type="button" onClick={() => onPick(img)} aria-label={`Use the ${img.label} picture`} title={img.label}
            style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, overflow: 'hidden', background: C.surface, cursor: 'pointer', textAlign: 'left' }}>
            <img src={img.src} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '2 / 1', objectFit: 'cover' }} />
            <span style={{ display: 'block', padding: '5px 8px', fontSize: FONT.caption, color: C.text2 }}>{img.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
