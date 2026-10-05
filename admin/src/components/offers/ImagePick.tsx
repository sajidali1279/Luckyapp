// The picture of an offer: choose one, see it, take it off. The app shows it as a wide slide (2:1) and as a small square cut from the
// middle, so a wide picture with its subject in the centre works best (the Lucky Stop offer images are 1200 x 600).
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ImagePlus, Images, X } from 'lucide-react';
import { ImageLibrary, libraryFile } from './ImageLibrary';
import { Button } from '../kit';
import { C, FONT, RADIUS } from '../../lib/theme';

export function ImagePick({ id, file, onFile, current, removed, onRemoveCurrent, category, label = 'Picture (optional)' }: {
  id: string;
  file: File | null;
  onFile: (f: File | null) => void;
  current?: string | null;          // the picture it already has (editing)
  removed?: boolean;                // the current picture is to be taken off
  onRemoveCurrent?: (remove: boolean) => void;
  category?: string | null;        // the offer's category: the picture library opens on it
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const shown = preview ?? (current && !removed ? current : null);
  const tooBig = file && file.size > 10 * 1024 * 1024;
  const [library, setLibrary] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {library && (
        <ImageLibrary category={category} onClose={() => setLibrary(false)} onPick={async (img) => {
          setLibrary(false); setLoading(true);
          try { onFile(await libraryFile(img)); if (onRemoveCurrent) onRemoveCurrent(false); }
          catch { toast.error('Could not load that picture. Try again, or upload one.'); }
          finally { setLoading(false); }
        }} />
      )}
      <label htmlFor={id} style={{ fontSize: FONT.small, fontWeight: 600, color: C.text2 }}>{label}</label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 200, height: 100, borderRadius: RADIUS.md, border: `1px dashed ${C.border}`, background: C.subtle, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {shown ? <img src={shown} alt="Offer picture" style={{ width: '100%', height: '100%', objectFit: 'cover' }} data-testid={`${id}-preview`} />
            : <span style={{ fontSize: FONT.small, color: C.muted }}>{removed ? 'Picture taken off' : 'No picture'}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input id={id} ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={label} style={{ display: 'none' }}
            onChange={(e) => { onFile(e.target.files?.[0] ?? null); if (onRemoveCurrent) onRemoveCurrent(false); }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" icon={<Images />} disabled={loading} onClick={() => setLibrary(true)}>{loading ? 'Loading…' : 'Lucky Stop pictures'}</Button>
            <Button size="sm" icon={<ImagePlus />} onClick={() => input.current?.click()}>{shown ? 'Upload another' : 'Upload a picture'}</Button>
            {file && <Button size="sm" variant="ghost" icon={<X />} onClick={() => { onFile(null); if (input.current) input.current.value = ''; }}>Undo</Button>}
            {!file && current && onRemoveCurrent && !removed && <Button size="sm" variant="ghost" icon={<X />} onClick={() => onRemoveCurrent(true)}>Take it off</Button>}
            {!file && current && onRemoveCurrent && removed && <Button size="sm" variant="ghost" onClick={() => onRemoveCurrent(false)}>Keep it</Button>}
          </div>
          <span style={{ fontSize: FONT.caption, color: tooBig ? C.danger : C.muted, maxWidth: 320, lineHeight: 1.45 }}>
            {tooBig ? 'That picture is over 10 MB. Choose a smaller one.' : 'Wide works best (1200 x 600). The middle shows in the small square in the app.'}
          </span>
        </div>
      </div>
    </div>
  );
}
