// A month of promotions and deals on the store calendar: what runs on each day, live, scheduled or past, so HQ can see gaps and overlaps
// before posting. Each day lists what runs on it; a happy-hour promotion carries a clock. Clicking one shows its details.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Button, Card, Badge, Chip } from '../kit';
import Modal from '../Modal';
import { C, FONT, RADIUS } from '../../lib/theme';
import { storeToday, addDays, storeDayLong } from '../../lib/storeDates';
import { hoursLabel } from './HappyHours';

type Show = 'all' | 'promotions' | 'deals';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_IN_CELL = 3;

function monthKey(day: string) { return day.slice(0, 7); }
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthName(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
/** Monday-first weekday of a 'YYYY-MM-DD' (0 = Monday). */
function weekdayMon(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export default function OfferCalendar({ offers, past, stores }: { offers: any[]; past: any[]; stores: any[] }) {
  const today = storeToday();
  const [month, setMonth] = useState(monthKey(today));
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<any | null>(null);

  // Every offer once (live and scheduled come from one list, past from another), with its first and last store day
  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...offers, ...past].filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true))).map((o) => ({
      o, first: storeToday(new Date(o.startDate)), last: storeToday(new Date(o.endDate)), deal: !!o.dealText,
      ended: Date.parse(o.endDate) < Date.now() || o.isActive === false,
    }));
  }, [offers, past]);

  const first = `${month}-01`;
  const lead = weekdayMon(first);
  const gridStart = addDays(first, -lead);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
  const rows = days.slice(35).every((d) => monthKey(d) !== month) ? days.slice(0, 35) : days;

  const on = (day: string) => items
    .filter((it) => it.first <= day && day <= it.last && (show === 'all' || (show === 'deals') === it.deal))
    .sort((a, b) => Number(a.deal) - Number(b.deal) || a.first.localeCompare(b.first));

  const storeName = (o: any) => (o.type === 'ALL_STORES' ? 'All stores' : o.store?.name ?? stores.find((s) => s.id === o.storeId)?.name ?? 'One store');

  return (
    <Card padding={0}>
      {open && (
        <Modal title={open.o.title} subtitle={`${storeDayLong(open.o.startDate)} to ${storeDayLong(open.o.endDate)}`} onClose={() => setOpen(null)} maxWidth={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: FONT.body, color: C.text2 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge tone={open.ended ? 'neutral' : open.first > today ? 'info' : 'success'}>{open.ended ? 'Ended' : open.first > today ? 'Scheduled' : 'Live'}</Badge>
              <Badge>{open.deal ? 'Deal' : 'Promotion'}</Badge>
              <Badge>{storeName(open.o)}</Badge>
            </div>
            {open.deal && <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{open.o.dealText}</div>}
            {open.o.description && <div style={{ lineHeight: 1.5 }}>{open.o.description}</div>}
            {hoursLabel(open.o) && <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Clock size={14} aria-hidden /> Pays only {hoursLabel(open.o)}</div>}
          </div>
        </Modal>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" icon={<ChevronLeft />} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} />
        <h2 style={{ margin: 0, fontSize: FONT.section, fontWeight: 600, color: C.text, minWidth: 150, textAlign: 'center' }}>{monthName(month)}</h2>
        <Button size="sm" variant="ghost" icon={<ChevronRight />} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} />
        {month !== monthKey(today) && <Button size="sm" onClick={() => setMonth(monthKey(today))}>This month</Button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Chip role="radio" selected={show === 'all'} onClick={() => setShow('all')}>All</Chip>
          <Chip role="radio" selected={show === 'promotions'} onClick={() => setShow('promotions')}>Promotions</Chip>
          <Chip role="radio" selected={show === 'deals'} onClick={() => setShow('deals')}>Deals</Chip>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div role="grid" aria-label={`Offers in ${monthName(month)}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(96px, 1fr))', minWidth: 700 }}>
          {WEEKDAYS.map((w) => <div key={w} role="columnheader" style={{ padding: '8px 8px 6px', fontSize: FONT.caption, fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.border}` }}>{w}</div>)}
          {rows.map((day, i) => {
            const list = on(day);
            const inMonth = monthKey(day) === month;
            return (
              <div key={day} role="gridcell" aria-label={`${storeDayLong(`${day}T18:00:00Z`)}: ${list.length} ${list.length === 1 ? 'offer' : 'offers'}`}
                style={{
                  minHeight: 104, padding: 6, borderRight: (i % 7) < 6 ? `1px solid ${C.border}` : 'none', borderBottom: `1px solid ${C.border}`,
                  background: day === today ? C.primaryTint : inMonth ? C.surface : C.page, display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                <div style={{ fontSize: FONT.caption, fontWeight: day === today ? 700 : 500, color: inMonth ? (day === today ? C.primary : C.text2) : C.muted }}>
                  {Number(day.slice(8))}{day === today ? ' Today' : ''}
                </div>
                {list.slice(0, MAX_IN_CELL).map((it) => (
                  <button key={it.o.id} type="button" onClick={() => setOpen(it)} title={`${it.o.title} (${storeName(it.o)})`}
                    aria-label={`${it.deal ? `${it.o.dealText} ` : ''}${it.o.title}, ${storeName(it.o)}${hoursLabel(it.o) ? ', happy hours' : ''}${it.ended ? ', ended' : ''}`}
                    style={{
                      all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, lineHeight: 1.3,
                      padding: '2px 6px', borderRadius: RADIUS.sm, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      color: it.deal ? C.text : '#fff', background: it.deal ? C.warningTint : C.primary, opacity: it.ended ? 0.55 : 1,
                      border: it.deal ? `1px solid ${C.border}` : 'none',
                    }}>
                    {hoursLabel(it.o) && <Clock size={11} aria-hidden style={{ flexShrink: 0 }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.deal ? `${it.o.dealText} ${it.o.title}` : it.o.title}</span>
                  </button>
                ))}
                {list.length > MAX_IN_CELL && (
                  <span style={{ fontSize: 11, color: C.muted }} title={list.slice(MAX_IN_CELL).map((x) => x.o.title).join(', ')}>+{list.length - MAX_IN_CELL} more</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 14px', fontSize: FONT.small, color: C.muted }}>
        <span><span style={{ ...swatch, background: C.primary }} /> Promotion (cashback)</span>
        <span><span style={{ ...swatch, background: C.warningTint, border: `1px solid ${C.border}` }} /> Deal</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} aria-hidden /> Happy hours</span>
        <span>Faded: ended. Store days, Central time.</span>
      </div>
    </Card>
  );
}

const swatch: React.CSSProperties = { display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: -1 };
