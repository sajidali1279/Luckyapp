// Settings > Rewards & offers > Joining bonus (2026-10-17): new customers get one free item a day for their first days. HQ switches it on
// or off, sets the number of days and the items (picture, English and Spanish name, on or off, add more). It was fixed in the code.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { settingsApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDay } from '../lib/storeDates';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Button, Card, Badge, Field, Notice } from './kit';
import ConfirmModal from './ConfirmModal';
import { useSettings, LastChanged } from './SettingsCards';

interface Item { key?: string; name: string; nameEs: string; emoji: string; active: boolean }
interface Welcome { enabled: boolean; offSince: string | null; days: number; items: Item[]; emojis: string[]; minDays: number; maxDays: number; maxItems: number }

const same = (a: Item[], b: Item[]) => a.length === b.length && a.every((x, i) => x.name === b[i].name && x.nameEs === b[i].nameEs && x.emoji === b[i].emoji && x.active === b[i].active);

export default function WelcomeBonusSettings() {
  const qc = useQueryClient();
  const q = useSettings();
  const saved = q.data?.data?.data?.welcome as Welcome | undefined;
  const [days, setDays] = useState('7');
  const [items, setItems] = useState<Item[]>([]);
  const [askOff, setAskOff] = useState(false);
  useEffect(() => { if (saved) { setDays(String(saved.days)); setItems(saved.items.map((i) => ({ ...i }))); } }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['settings-history'] }); };
  const save = useMutation({
    mutationFn: () => settingsApi.saveWelcome({ days: Number(days), items: items.map((i) => ({ key: i.key, name: i.name, nameEs: i.nameEs, emoji: i.emoji, active: i.active })) }),
    onSuccess: () => done('Saved. Phones show it the next time the welcome card loads.'),
    onError: (e) => toast.error(serverMessage(e, 'Could not save.')),
  });
  const flip = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.saveWelcome({ enabled }),
    onSuccess: (_d, enabled) => { setAskOff(false); done(enabled ? 'The joining bonus is on for new sign-ups.' : 'The joining bonus is off for new sign-ups.'); },
    onError: (e) => { setAskOff(false); toast.error(serverMessage(e, 'Could not change it.')); },
  });

  if (q.isLoading) return <Card padding={18}><div style={{ color: TEXT_MUTED }}>Loading…</div></Card>;
  if (q.isError || !saved) return <Card padding={18}><Notice tone="danger">Could not load the joining bonus settings.</Notice></Card>;

  const d = Number(days);
  const daysOk = Number.isInteger(d) && d >= saved.minDays && d <= saved.maxDays;
  const changed = !daysOk || d !== saved.days || !same(items, saved.items);
  const namesOk = items.every((i) => i.name.trim());
  const set = (at: number, patch: Partial<Item>) => setItems((p) => p.map((x, i) => (i === at ? { ...x, ...patch } : x)));

  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>Joining bonus</div>
        <Badge tone={saved.enabled ? 'success' : 'neutral'}>{saved.enabled ? 'On' : 'Off'}</Badge>
        <div style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant={saved.enabled ? 'secondary' : 'primary'} disabled={flip.isPending} onClick={() => (saved.enabled ? setAskOff(true) : flip.mutate(true))}>
            {saved.enabled ? 'Switch off' : 'Switch on'}
          </Button>
        </div>
      </div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px' }}>
        A new customer picks one free item a day, for their first days after signing up, and shows the code at the register (or the cashier gives it from the scan). No purchase needed.
      </p>
      {!saved.enabled && (
        <Notice>
          Off{saved.offSince ? ` since ${storeDay(saved.offSince)}` : ''}: nobody who signs up now gets it. Customers who joined before it was switched off keep their days.
        </Notice>
      )}

      <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
        <Field label={`Number of days (${saved.minDays} to ${saved.maxDays})`} htmlFor="wb-days">
          <input id="wb-days" style={{ ...INPUT, maxWidth: 120 }} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
        {daysOk && d !== 7 && <Notice tone="warning">The printed welcome posters say 7 days. Customers on their first days now get {d}.</Notice>}

        <div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: FONT.body, marginBottom: 6 }}>Items to choose from</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map((it, at) => (
              <div key={it.key ?? `new-${at}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, opacity: it.active ? 1 : 0.75 }}>
                <select aria-label="Picture" value={it.emoji} onChange={(e) => set(at, { emoji: e.target.value })} style={{ ...INPUT, width: 64, fontSize: 18, padding: '4px 6px' }}>
                  {saved.emojis.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                <input aria-label="Name in English" placeholder="Name (English)" maxLength={40} value={it.name} onChange={(e) => set(at, { name: e.target.value })} style={{ ...INPUT, flex: '1 1 170px', minWidth: 0 }} />
                <input aria-label="Name in Spanish" placeholder="Nombre (español)" maxLength={40} value={it.nameEs} onChange={(e) => set(at, { nameEs: e.target.value })} style={{ ...INPUT, flex: '1 1 170px', minWidth: 0 }} />
                <Button size="sm" variant={it.active ? 'secondary' : 'primary'} onClick={() => set(at, { active: !it.active })}>{it.active ? 'On' : 'Off'}</Button>
                {!it.key && <Button size="sm" variant="secondary" onClick={() => setItems((p) => p.filter((_, i) => i !== at))}>Remove</Button>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: FONT.small, color: TEXT_MUTED, marginTop: 6 }}>
            Switch an item off to stop offering it; saved items are never deleted, so gifts already given keep their name. The Spanish name is shown when the app is in Spanish.
          </div>
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="secondary" disabled={items.length >= saved.maxItems} onClick={() => setItems((p) => [...p, { name: '', nameEs: '', emoji: '🎁', active: true }])}>
              Add an item{items.length >= saved.maxItems ? ` (${saved.maxItems} at most)` : ''}
            </Button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="primary" disabled={!changed || !daysOk || !namesOk || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        {changed && <Button variant="secondary" onClick={() => { setDays(String(saved.days)); setItems(saved.items.map((i) => ({ ...i }))); }}>Undo changes</Button>}
        {!daysOk && <span style={{ fontSize: FONT.small, color: C.danger }}>Days must be {saved.minDays} to {saved.maxDays}.</span>}
        {daysOk && !namesOk && <span style={{ fontSize: FONT.small, color: C.danger }}>Every item needs an English name.</span>}
      </div>
      <LastChanged actions={['SETTINGS_WELCOME_UPDATE']} />
      <ConfirmModal
        open={askOff}
        title="Switch off the joining bonus?"
        danger
        busy={flip.isPending}
        confirmLabel="Switch off"
        message={<p style={{ margin: 0 }}>Nobody who signs up from now on gets free welcome items. Customers who already joined keep their days. You can switch it back on here at any time.</p>}
        onConfirm={() => flip.mutate(false)}
        onCancel={() => setAskOff(false)}
      />
    </Card>
  );
}
