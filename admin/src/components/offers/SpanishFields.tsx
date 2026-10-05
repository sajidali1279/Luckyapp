// An offer's words in Spanish (optional): customers who use the app in Spanish see them, and their pushes use the Spanish title.
// "Suggest a translation" asks the server (Claude) for a version to read and change; nothing is posted without HQ seeing it here.
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Languages } from 'lucide-react';
import { offersApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { Button, Field } from '../kit';
import { C, FONT, INPUT, RADIUS } from '../../lib/theme';

export type SpanishWords = { titleEs: string; descriptionEs: string; dealTextEs: string };
export const NO_SPANISH: SpanishWords = { titleEs: '', descriptionEs: '', dealTextEs: '' };
export const spanishFrom = (o: { titleEs?: string | null; descriptionEs?: string | null; dealTextEs?: string | null }): SpanishWords =>
  ({ titleEs: o.titleEs ?? '', descriptionEs: o.descriptionEs ?? '', dealTextEs: o.dealTextEs ?? '' });

export function SpanishFields({ idPrefix, value, onChange, english, withDeal }: {
  idPrefix: string;
  value: SpanishWords;
  onChange: (v: SpanishWords) => void;
  english: { title: string; description: string; dealText?: string };   // what to translate
  withDeal?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const has = !!(value.titleEs || value.descriptionEs || value.dealTextEs);
  const canSuggest = !!(english.title.trim() || english.description.trim() || english.dealText?.trim());
  async function suggest() {
    setBusy(true);
    try {
      const res = await offersApi.translate({ title: english.title.trim(), description: english.description.trim(), dealText: withDeal ? (english.dealText ?? '').trim() : '' });
      const d = res.data?.data ?? {};
      onChange({ titleEs: d.titleEs || value.titleEs, descriptionEs: d.descriptionEs || value.descriptionEs, dealTextEs: withDeal ? (d.dealTextEs || value.dealTextEs) : value.dealTextEs });
      toast.success('Spanish suggested. Read it, and change anything before posting.');
    } catch (err) { toast.error(serverMessage(err, 'Could not suggest a translation. Type the Spanish yourself.')); }
    finally { setBusy(false); }
  }
  return (
    <details open={has} style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: '10px 12px', background: C.subtle }} data-testid={`${idPrefix}-spanish`}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: FONT.body, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Languages size={15} aria-hidden /> Spanish <span style={{ fontWeight: 400, color: C.muted, fontSize: FONT.small }}>(optional: customers using the app in Spanish see it)</span>
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" icon={<Languages />} disabled={busy || !canSuggest} onClick={suggest}>{busy ? 'Translating…' : 'Suggest a translation'}</Button>
          <span style={{ fontSize: FONT.caption, color: C.muted }}>{canSuggest ? 'From the English above. Always read it before posting.' : 'Write the English first.'}</span>
        </div>
        <Field label="Title in Spanish" htmlFor={`${idPrefix}-title-es`}>
          <input id={`${idPrefix}-title-es`} className="ui-input" style={INPUT} maxLength={100} value={value.titleEs} onChange={(e) => onChange({ ...value, titleEs: e.target.value })} placeholder="e.g. Martes de Tacos" />
        </Field>
        {withDeal && (
          <Field label="Deal text in Spanish" htmlFor={`${idPrefix}-deal-es`}>
            <input id={`${idPrefix}-deal-es`} className="ui-input" style={INPUT} maxLength={40} value={value.dealTextEs} onChange={(e) => onChange({ ...value, dealTextEs: e.target.value })} placeholder="e.g. 2 por $5" />
          </Field>
        )}
        <Field label="Description in Spanish" htmlFor={`${idPrefix}-desc-es`}>
          <textarea id={`${idPrefix}-desc-es`} className="ui-input" style={{ ...INPUT, minHeight: 60, resize: 'vertical' }} maxLength={500} value={value.descriptionEs} onChange={(e) => onChange({ ...value, descriptionEs: e.target.value })} />
        </Field>
      </div>
    </details>
  );
}
