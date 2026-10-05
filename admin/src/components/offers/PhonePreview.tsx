// How an offer will look on a customer's phone, before it is posted: the push it sends, its card in the offers list (the picture cut to
// a square from the middle) and its wide slide, in English or Spanish. Drawn to match the app (mobile app/(customer)/home.tsx).
import { useEffect, useMemo, useState } from 'react';
import { Chip } from '../kit';
import { FONT } from '../../lib/theme';

export type PreviewOffer = {
  kind: 'promo' | 'deal';
  title: string; description: string; dealText?: string;
  titleEs?: string; descriptionEs?: string; dealTextEs?: string;
  bonus?: { pct?: number | null; cents?: number | null; tiers?: boolean } | null;   // what it pays (the pill)
  hours?: { days: number[]; from: string; to: string } | null;
  where: string;            // the store's name (one store); every store is worded in the language shown
  image?: File | string | null;
  single: boolean;          // one store's offer (its customers are told)
};

const RED = '#CC2936', NAVY = '#1D3557', MUTED = '#6b7280';
const DAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] };
const clock = (t: string) => { const h = Number(t.slice(0, 2)), m = t.slice(3, 5); return `${h % 12 === 0 ? 12 : h % 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'AM' : 'PM'}`; };

/** "Tue, all day" / "mar, todo el día" / "Mon-Fri, 3 PM to 6 PM" / "lun-vie, de 3 PM a 6 PM", as the app words them. */
function hoursWords(h: PreviewOffer['hours'], lang: 'en' | 'es'): string | null {
  if (!h || !h.from || !h.to) return null;
  const days = h.days.length > 0 && h.days.length < 7 ? [...h.days].sort((a, b) => a - b) : null;
  let dayText = lang === 'es' ? 'Todos los días' : 'Every day';
  if (days) {
    const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    dayText = run && days.length >= 3 ? `${DAYS[lang][days[0]]}-${DAYS[lang][days[days.length - 1]]}` : days.map((d) => DAYS[lang][d]).join(', ');
  }
  if (h.from === '00:00' && h.to === '00:00') return lang === 'es' ? `${dayText}, todo el día` : `${dayText}, all day`;
  return lang === 'es' ? `${dayText}, de ${clock(h.from)} a ${clock(h.to)}` : `${dayText}, ${clock(h.from)} to ${clock(h.to)}`;
}
const pct = (f: number) => { const v = Math.round(f * 1000) / 10; return Number.isInteger(v) ? String(v) : v.toFixed(1); };

export function PhonePreview({ offer }: { offer: PreviewOffer }) {
  const hasEs = !!(offer.titleEs || offer.descriptionEs || offer.dealTextEs);
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const src = useMemo(() => (offer.image instanceof File ? URL.createObjectURL(offer.image) : offer.image || null), [offer.image]);
  useEffect(() => () => { if (offer.image instanceof File && src) URL.revokeObjectURL(src); }, [src, offer.image]);
  const es = lang === 'es';
  const title = (es && offer.titleEs) || offer.title;
  const desc = (es && offer.descriptionEs) || offer.description;
  const deal = (es && offer.dealTextEs) || offer.dealText;
  const hours = hoursWords(offer.hours, lang);
  const pill = offer.bonus?.cents != null ? `+${offer.bonus.cents}¢/gal` : offer.bonus?.pct != null ? (es ? `+${pct(offer.bonus.pct)}% de reembolso` : `+${pct(offer.bonus.pct)}% cashback`) : null;
  const push = offer.kind === 'promo'
    ? { t: es ? '🎉 ¡Nueva promoción!' : '🎉 New Promotion!', b: es ? `${title}. Mira los detalles en la app de Lucky Stop.` : `${title}. Check the Lucky Stop app for details.` }
    : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }} data-testid="phone-preview">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: FONT.small, fontWeight: 600, color: '#374151' }}>On a customer's phone</span>
        <Chip selected={!es} onClick={() => setLang('en')}>English</Chip>
        <Chip selected={es} onClick={() => setLang('es')} title={hasEs ? undefined : 'No Spanish words yet: a Spanish reader sees the English'}>Español</Chip>
      </div>
      <div style={{ width: 300, borderRadius: 30, border: '8px solid #111827', background: '#F8F9FA', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.18)', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
        {push && (
          <div style={{ background: 'linear-gradient(180deg, #2b3a55, #1D3557)', padding: '14px 10px 12px' }}>
            <div style={{ background: 'rgba(255,255,255,.92)', borderRadius: 14, padding: '9px 11px', display: 'flex', gap: 9 }} aria-label="The push notification">
              <div style={{ width: 26, height: 26, borderRadius: 7, background: RED, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>LS</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{push.t}</div>
                <div style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.35 }}>{push.b}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#c7d2e3', textAlign: 'center', marginTop: 6 }}>
              {offer.single ? (es ? 'A los clientes de esa tienda' : "To that store's customers") : (es ? 'A todos los clientes' : 'To every customer')}
            </div>
          </div>
        )}
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* the wide slide (Today's offers) */}
          <div style={{ width: '100%', aspectRatio: '2 / 1', borderRadius: 16, overflow: 'hidden', background: src ? '#000' : NAVY, position: 'relative' }} aria-label="The wide slide">
            {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ color: '#fff', padding: 14, fontWeight: 800, fontSize: deal ? 22 : 15 }}>{deal || title}</div>}
            {pill && <span style={{ position: 'absolute', left: 10, bottom: 10, background: RED, color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 8, padding: '3px 8px' }}>{pill}</span>}
          </div>
          {/* the card in the offers list */}
          <div style={{ display: 'flex', background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,.06)' }} aria-label="The offer card">
            <div style={{ width: 84, minHeight: 84, flexShrink: 0, background: src ? '#000' : '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {src ? <img src={src} alt="" style={{ width: 84, height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 26 }}>🏷️</span>}
            </div>
            <div style={{ padding: 10, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {deal && offer.kind === 'deal' && <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{deal}</div>}
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>{title}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: NAVY }}>{offer.single ? offer.where : (es ? 'Todas las tiendas Lucky Stop' : 'All Lucky Stop stores')}</div>
              {desc && <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{desc}</div>}
              {pill && <span style={{ alignSelf: 'flex-start', marginTop: 5, background: RED, color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 8, padding: '3px 8px' }}>{pill}</span>}
              {hours && <div style={{ fontSize: 10.5, color: '#374151', marginTop: 3 }}>🕒 {hours}</div>}
            </div>
          </div>
        </div>
      </div>
      {es && !hasEs && <div style={{ fontSize: FONT.caption, color: MUTED }}>No Spanish words yet: a Spanish reader sees the English.</div>}
    </div>
  );
}
