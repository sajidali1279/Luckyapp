// A month of promotions and deals on the store calendar: what runs on each day, live, scheduled or past, so HQ can see gaps and overlaps
// before posting. Each day lists what runs on it; a happy-hour promotion carries a clock. Clicking one shows its details. Where the page is
// too narrow for a month grid (a phone), the same days come as an agenda: one row for each day that has something on, from today.
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Button, Card, Badge, Chip, EmptyState } from '../kit';
import Modal from '../Modal';
import { C, FONT, RADIUS } from '../../lib/theme';
import { storeToday, addDays, storeDayLong } from '../../lib/storeDates';
import { hoursLabel } from './HappyHours';

type Show = 'all' | 'promotions' | 'deals';
type Item = { o: any; first: string; last: string; deal: boolean; ended: boolean };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_IN_CELL = 3;
const GRID_MIN = 700;   // the grid's width; a narrower page gets the agenda

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
/** "Sat, Oct 25, 2026" for a store day. */
function dayTitle(day: string) { return `${WEEKDAYS[weekdayMon(day)]}, ${storeDayLong(`${day}T18:00:00Z`)}`; }

/** Whether the element is narrower than the month grid needs (measured on the element, since the side menu takes part of the screen). */
function useNarrow(ref: React.RefObject<HTMLElement | null>) {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth < GRID_MIN);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref]);
  return narrow;
}

export default function OfferCalendar(props: { offers: any[]; past: any[]; stores: any[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const narrow = useNarrow(wrap);
  return <div ref={wrap}><CalendarBody {...props} narrow={narrow} /></div>;
}

function CalendarBody({ offers, past, stores, narrow }: { offers: any[]; past: any[]; stores: any[]; narrow: boolean }) {
  const today = storeToday();
  const [month, setMonth] = useState(monthKey(today));
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<Item | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  // Every offer once (live and scheduled come from one list, past from another), with its first and last store day
  const items = useMemo<Item[]>(() => {
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
  const weeks = Array.from({ length: rows.length / 7 }, (_, w) => rows.slice(w * 7, w * 7 + 7));

  const on = (day: string) => items
    .filter((it) => it.first <= day && day <= it.last && (show === 'all' || (show === 'deals') === it.deal))
    .sort((a, b) => Number(a.deal) - Number(b.deal) || a.first.localeCompare(b.first));

  // The agenda: this month's days that have something on, from today when it is the current month
  const agenda: { day: string; list: Item[] }[] = [];
  if (narrow) {
    for (let day = month === monthKey(today) ? today : first; monthKey(day) === month; day = addDays(day, 1)) {
      const list = on(day);
      if (list.length > 0) agenda.push({ day, list });
    }
  }

  const storeName = (o: any) => (o.type === 'ALL_STORES' ? 'All stores' : o.store?.name ?? stores.find((s) => s.id === o.storeId)?.name ?? 'One store');
  const dayList = dayOpen ? on(dayOpen) : [];

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
      {dayOpen && (
        <Modal title={dayTitle(dayOpen)} subtitle={`${dayList.length} ${dayList.length === 1 ? 'offer' : 'offers'} on this day`} onClose={() => setDayOpen(null)} maxWidth={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayList.map((it) => <Pill key={it.o.id} it={it} store={storeName(it.o)} roomy onOpen={() => { setDayOpen(null); setOpen(it); }} />)}
          </div>
        </Modal>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" icon={<ChevronLeft />} aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} />
        <h2 style={{ margin: 0, fontSize: FONT.section, fontWeight: 600, color: C.text, minWidth: 150, textAlign: 'center' }}>{monthName(month)}</h2>
        <Button size="sm" variant="ghost" icon={<ChevronRight />} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} />
        {month !== monthKey(today) && <Button size="sm" onClick={() => setMonth(monthKey(today))}>This month</Button>}
        <div role="radiogroup" aria-label="Show" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Chip role="radio" selected={show === 'all'} onClick={() => setShow('all')}>All</Chip>
          <Chip role="radio" selected={show === 'promotions'} onClick={() => setShow('promotions')}>Promotions</Chip>
          <Chip role="radio" selected={show === 'deals'} onClick={() => setShow('deals')}>Deals</Chip>
        </div>
      </div>
      {narrow ? (
        agenda.length === 0 ? (
          <div style={{ padding: 14 }}>
            <EmptyState title={month === monthKey(today) ? 'Nothing on for the rest of this month' : `Nothing on in ${monthName(month)}`} description="Use the arrows to look at another month." />
          </div>
        ) : (
          <ul aria-label={`Offers in ${monthName(month)}`} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {agenda.map(({ day, list }) => (
              <li key={day} style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: day === today ? C.primaryTint : C.surface }}>
                <div style={{ width: 48, flexShrink: 0 }}>
                  <div style={{ fontSize: FONT.caption, color: C.muted }}>{WEEKDAYS[weekdayMon(day)]}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: day === today ? C.primary : C.text }}>{Number(day.slice(8))}</div>
                  {day === today && <div style={{ fontSize: FONT.caption, fontWeight: 600, color: C.primary }}>Today</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map((it) => <Pill key={it.o.id} it={it} store={storeName(it.o)} roomy onOpen={() => setOpen(it)} />)}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div role="grid" aria-label={`Offers in ${monthName(month)}`} style={{ minWidth: GRID_MIN }}>
            <div role="row" style={weekRow}>
              {WEEKDAYS.map((w) => <div key={w} role="columnheader" style={{ padding: '8px 8px 6px', fontSize: FONT.caption, fontWeight: 600, color: C.muted, borderBottom: `1px solid ${C.border}` }}>{w}</div>)}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} role="row" style={weekRow}>
                {week.map((day, i) => {
                  const list = on(day);
                  const inMonth = monthKey(day) === month;
                  return (
                    <div key={day} role="gridcell" aria-label={`${storeDayLong(`${day}T18:00:00Z`)}: ${list.length} ${list.length === 1 ? 'offer' : 'offers'}`}
                      style={{
                        minHeight: 104, padding: 6, borderRight: i < 6 ? `1px solid ${C.border}` : 'none', borderBottom: `1px solid ${C.border}`,
                        background: day === today ? C.primaryTint : inMonth ? C.surface : C.page, display: 'flex', flexDirection: 'column', gap: 3,
                      }}>
                      <div style={{ fontSize: FONT.caption, fontWeight: day === today ? 700 : 500, color: inMonth ? (day === today ? C.primary : C.text2) : C.muted }}>
                        {Number(day.slice(8))}{day === today ? ' Today' : ''}
                      </div>
                      {list.slice(0, MAX_IN_CELL).map((it) => <Pill key={it.o.id} it={it} store={storeName(it.o)} onOpen={() => setOpen(it)} />)}
                      {list.length > MAX_IN_CELL && (
                        <button type="button" onClick={() => setDayOpen(day)} aria-label={`${list.length - MAX_IN_CELL} more on ${dayTitle(day)}`} style={moreButton}>
                          +{list.length - MAX_IN_CELL} more
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '10px 14px', fontSize: FONT.small, color: C.muted }}>
        <span><span style={{ ...swatch, background: C.primary }} /> Promotion (cashback)</span>
        <span><span style={{ ...swatch, ...dealLook, width: 14 }} /> Deal</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} aria-hidden /> Happy hours</span>
        <span>Faded: ended. Store days, Central time.</span>
      </div>
    </Card>
  );
}

/** One offer on one day: a button that opens its details. `roomy` (the agenda and the day list) gives it the full title on as many
 *  lines as it needs, with its store under it; in a grid cell it is one line cut short. */
function Pill({ it, store, onOpen, roomy }: { it: Item; store: string; onOpen: () => void; roomy?: boolean }) {
  const words = it.deal ? `${it.o.dealText} ${it.o.title}` : it.o.title;
  const hours = hoursLabel(it.o);
  return (
    <button type="button" onClick={onOpen} title={`${it.o.title} (${store})`}
      aria-label={`${it.deal ? `${it.o.dealText} ` : ''}${it.o.title}, ${store}${hours ? ', happy hours' : ''}${it.ended ? ', ended' : ''}`}
      style={{
        ...pillReset, display: 'flex', alignItems: roomy ? 'flex-start' : 'center', gap: 6, width: '100%', textAlign: 'left', cursor: 'pointer',
        fontSize: roomy ? FONT.body : 11.5, lineHeight: 1.3, padding: roomy ? '8px 10px' : '2px 6px', borderRadius: RADIUS.sm, opacity: it.ended ? 0.55 : 1,
        ...(it.deal ? { ...dealLook, color: C.text } : { background: C.primary, color: '#fff', border: '1px solid transparent' }),
        ...(roomy ? {} : { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
      }}>
      {hours && <Clock size={roomy ? 14 : 11} aria-hidden style={{ flexShrink: 0, marginTop: roomy ? 2 : 0 }} />}
      <span style={{ minWidth: 0, ...(roomy ? { overflowWrap: 'anywhere' } : { overflow: 'hidden', textOverflow: 'ellipsis' }) }}>
        <span style={{ fontWeight: roomy ? 600 : 400 }}>{words}</span>
        {roomy && <span style={{ display: 'block', fontSize: FONT.caption, opacity: 0.8 }}>{store}</span>}
      </span>
    </button>
  );
}

const weekRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(96px, 1fr))' };
// A button with its browser look taken off, spelled out so the page's keyboard focus ring (index.css) still shows on it
const pillReset: CSSProperties = { margin: 0, fontFamily: 'inherit', boxSizing: 'border-box' };
const moreButton: CSSProperties = {
  ...pillReset, alignSelf: 'flex-start', padding: '1px 4px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
  color: C.primary, textDecoration: 'underline',
};
/** A deal: a light tint with the brand red bar on its left, so it reads as different from a promotion at a glance. */
const dealLook: CSSProperties = { background: C.dangerTint, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.brand}` };
const swatch: CSSProperties = { display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: -1, boxSizing: 'border-box' };
