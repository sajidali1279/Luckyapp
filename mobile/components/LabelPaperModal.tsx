import { ReactElement, useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants';
import { PrinterIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';
import KeyboardSafe from './KeyboardSafe';
import ModalToastHost from './ModalToastHost';
import { SheetSettings, A4Sizes, A4_DEFAULTS, SIZE_LIMITS, cleanSheet, fitIssue, perSheet, LetterNudge, NUDGE_LIMITS, LETTER_NUDGE_DEFAULTS } from '../utils/labelSheet';
import { printTestSheet } from '../utils/printLabels';

// Which label paper My Prints prints on: US Letter with 30 labels (as always), or A4 with 18 tall labels, turned sideways (for a shelf
// edge) or upright (for a door or a peg). Also where the first free label is on a sheet that has some peeled off already. A4 sheets
// differ by maker, so their sizes can be adjusted here (buttons of half a millimetre, or typed), checked with a test page of outlines
// printed on plain paper. The paper is kept on this phone; the first free label is for the next print only.

const SIZE_FIELDS: (keyof A4Sizes)[] = ['labelW', 'labelH', 'top', 'left', 'gapX', 'gapY'];
const STEP_MM = 0.5;

export function paperSummary(t: (k: string, o?: any) => string, sheet: SheetSettings, startAt = 1): string {
  const paper = sheet.format === 'letter30'
    ? t('labelPaper.paperLetter')
    : `${t('labelPaper.paperA4')} · ${t(sheet.design === 'upright' ? 'labelPaper.upright' : 'labelPaper.sideways')}`;
  return startAt > 1 ? `${paper}${t('labelPaper.rowStarts', { n: startAt })}` : paper;
}

// The store's printer fine-tune as the server keeps it
export interface StorePrinter { storeId: string; storeName: string; down: number; right: number; updatedAt: string | null; updatedBy: string | null }

export default function LabelPaperModal({ visible, sheet, startAt, accentColor, onChange, onStartAt, onClose, printer, storeName, canSetPrinter, onSavePrinter }: {
  visible: boolean;
  printer?: StorePrinter | null;
  storeName?: string;
  canSetPrinter?: boolean;
  onSavePrinter?: (nudge: LetterNudge) => Promise<void>;
  sheet: SheetSettings;
  startAt: number;
  accentColor: string;
  onChange: (next: SheetSettings) => void;
  onStartAt: (n: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const [showSizes, setShowSizes] = useState(false);
  const [texts, setTexts] = useState<Record<keyof A4Sizes, string>>(() => sizeTexts(sheet.a4));
  const [editing, setEditing] = useState<keyof A4Sizes | null>(null);
  const [printingTest, setPrintingTest] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  // The fine-tune being tried: starts from the store's numbers; a manager can test it and then save it for the store
  const [draft, setDraft] = useState<LetterNudge>(sheet.letter);
  const [savingPrinter, setSavingPrinter] = useState(false);
  useEffect(() => { if (visible) setDraft(sheet.letter); }, [visible, sheet.letter.down, sheet.letter.right]);
  const draftChanged = draft.down !== sheet.letter.down || draft.right !== sheet.letter.right;

  // The boxes show the kept numbers, except the one being typed in (so "31." is not rewritten while typing)
  useEffect(() => {
    setTexts(prev => {
      const next = sizeTexts(sheet.a4);
      if (editing) next[editing] = prev[editing];
      return next;
    });
  }, [sheet.a4, editing]);

  const set = (next: Partial<SheetSettings>) => onChange(cleanSheet({ ...sheet, ...next }));
  const setSize = (k: keyof A4Sizes, v: number) => set({ a4: { ...sheet.a4, [k]: Math.round(v * 10) / 10 } });
  const setNudge = (k: keyof LetterNudge, v: number) => setDraft(d => ({ ...d, [k]: Math.min(NUDGE_LIMITS[k][1], Math.max(NUDGE_LIMITS[k][0], Math.round(v * 10) / 10)) }));
  async function savePrinter() {
    if (!onSavePrinter || savingPrinter) return;
    setSavingPrinter(true);
    try {
      await onSavePrinter(draft);
      Toast.show({ type: 'success', text1: t('labelPaper.printerSaved', { store: storeName ?? '' }) });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: t('labelPaper.printerSaveFailed'), text2: err?.response?.data?.error ?? err?.message });
    } finally {
      setSavingPrinter(false);
    }
  }
  const tall = sheet.format === 'a4x18';
  const per = perSheet(sheet);
  const issue = tall ? fitIssue(sheet.a4) : null;
  const pickStart = (n: number) => onStartAt(Math.min(per, Math.max(1, n)));

  async function testPage() {
    if (printingTest) return;
    if (issue) { Toast.show({ type: 'error', text1: t('labelPaper.fixSizesFirst') }); return; }
    setPrintingTest(true);
    try {
      await printTestSheet({ ...sheet, letter: draft });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: t('labelPaper.testFailed'), text2: err?.message });
    } finally {
      setPrintingTest(false);
    }
  }

  // A choice drawn as a card: a small picture, a title and a line under it
  const card = (selected: boolean, picture: ReactElement, title: string, sub: string, onPress: () => void, column = false) => (
    <TouchableOpacity
      style={[st.card, column && st.cardColumn, selected && { borderColor: accentColor, backgroundColor: `${accentColor}0F` }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${sub}`}
    >
      {picture}
      <View style={column ? { alignItems: 'center' } : { flex: 1 }}>
        <Text style={[st.cardTitle, selected && { color: accentColor }, column && { textAlign: 'center' }]}>{title}</Text>
        <Text style={[st.cardSub, column && { textAlign: 'center' }]}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );

  const sheetPicture = (cols: number, rows: number, w: number, h: number) => (
    <View style={[st.mini, { width: cols * (w + 2) + 8 }]}>
      {Array.from({ length: cols * rows }, (_, i) => <View key={i} style={[st.miniCell, { width: w, height: h }]} />)}
    </View>
  );

  const tagPicture = (upright: boolean) => (
    <View style={[st.tag, { borderTopColor: accentColor }]}>
      {upright ? (
        <>
          <View style={st.tagName} />
          <Text style={[st.tagPrice, { color: accentColor }]}>$2.79</Text>
          <View style={st.tagCode} />
        </>
      ) : (
        <Text style={[st.tagPrice, { color: accentColor, transform: [{ rotate: '90deg' }], width: 60, textAlign: 'center' }]}>$2.79</Text>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSafe style={st.overlay}>
        <View style={[st.box, { maxHeight: screenHeight * 0.9 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={st.titleRow}>
              <PrinterIcon size={20} color={accentColor} strokeWidth={2.2} />
              <Text style={st.title}>{t('labelPaper.title')}</Text>
            </View>

            <Text style={st.section}>{t('labelPaper.paper')}</Text>
            <View accessibilityRole="radiogroup" style={st.group}>
              {card(!tall, sheetPicture(3, 10, 9, 3), t('labelPaper.paperLetter'), t('labelPaper.paperLetterSub'), () => set({ format: 'letter30' }))}
              {card(tall, sheetPicture(6, 3, 4, 13), t('labelPaper.paperA4'), t('labelPaper.paperA4Sub'), () => { set({ format: 'a4x18' }); onStartAt(Math.min(startAt, 18)); })}
            </View>

            {tall && (
              <>
                <Text style={st.section}>{t('labelPaper.design')}</Text>
                <View accessibilityRole="radiogroup" style={st.row2}>
                  {card(sheet.design === 'sideways', tagPicture(false), t('labelPaper.sideways'), t('labelPaper.sidewaysSub'), () => set({ design: 'sideways' }), true)}
                  {card(sheet.design === 'upright', tagPicture(true), t('labelPaper.upright'), t('labelPaper.uprightSub'), () => set({ design: 'upright' }), true)}
                </View>
              </>
            )}

            <Text style={st.section}>{t('labelPaper.startAt')}</Text>
            <Text style={st.hint}>{t('labelPaper.startHelp')}</Text>
            <View style={st.startRow}>
              <View style={[st.pick, { width: tall ? 6 * 32 + 10 : 3 * 58 + 10 }]} accessibilityRole="radiogroup">
                {Array.from({ length: per }, (_, i) => {
                  const n = i + 1;
                  const used = n < startAt;
                  const first = n === startAt;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[st.pickCell, tall ? { width: 30, height: 44 } : { width: 56, height: 18 }, used && st.pickUsed, first && { backgroundColor: accentColor, borderColor: accentColor }]}
                      onPress={() => pickStart(n)}
                      hitSlop={tall ? undefined : { top: 2, bottom: 2 }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: first }}
                      accessibilityLabel={t('labelPaper.startA11y', { n })}
                    >
                      {!used && <Text style={[st.pickText, first && { color: '#fff', fontWeight: '800' }]}>{n}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <View style={st.stepper}>
                  <TouchableOpacity style={st.stepBtn} onPress={() => pickStart(startAt - 1)} accessibilityRole="button" accessibilityLabel={t('labelPaper.earlier')}>
                    <Text style={st.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={st.stepValue}>{startAt}</Text>
                  <TouchableOpacity style={st.stepBtn} onPress={() => pickStart(startAt + 1)} accessibilityRole="button" accessibilityLabel={t('labelPaper.later')}>
                    <Text style={st.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={st.hint}>{startAt > 1 ? t('labelPaper.startNote', { n: startAt - 1 }) : t('labelPaper.startFirst')}</Text>
              </View>
            </View>

            {tall && (
              <>
                <TouchableOpacity
                  style={st.sizesToggle}
                  onPress={() => setShowSizes(v => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showSizes }}
                  accessibilityLabel={t('labelPaper.sizes')}
                >
                  <Text style={[st.sizesToggleText, { color: accentColor }]}>{t('labelPaper.sizes')}</Text>
                  {showSizes ? <ChevronUpIcon size={18} color={accentColor} /> : <ChevronDownIcon size={18} color={accentColor} />}
                </TouchableOpacity>

                {showSizes && (
                  <View style={st.sizesBox}>
                    <Text style={st.hint}>{t('labelPaper.sizesHint')}</Text>
                    {SIZE_FIELDS.map(k => {
                      const name = t(`labelPaper.${k}`);
                      return (
                        <View key={k} style={st.sizeRow}>
                          <Text style={st.sizeLabel}>{name}</Text>
                          <View style={st.stepper}>
                            <TouchableOpacity style={st.stepBtnSm} onPress={() => setSize(k, sheet.a4[k] - STEP_MM)} disabled={sheet.a4[k] <= SIZE_LIMITS[k][0]}
                              accessibilityRole="button" accessibilityLabel={t('labelPaper.less', { field: name })}>
                              <Text style={st.stepBtnText}>−</Text>
                            </TouchableOpacity>
                            <TextInput
                              style={st.sizeInput}
                              value={texts[k]}
                              keyboardType="decimal-pad"
                              maxLength={5}
                              selectTextOnFocus
                              onFocus={() => setEditing(k)}
                              onBlur={() => setEditing(null)}
                              onChangeText={text => {
                                const clean = text.replace(',', '.').replace(/[^0-9.]/g, '');
                                setTexts(prev => ({ ...prev, [k]: clean }));
                                const v = parseFloat(clean);
                                if (Number.isFinite(v)) setSize(k, v);
                              }}
                              accessibilityLabel={`${name} (mm)`}
                            />
                            <TouchableOpacity style={st.stepBtnSm} onPress={() => setSize(k, sheet.a4[k] + STEP_MM)} disabled={sheet.a4[k] >= SIZE_LIMITS[k][1]}
                              accessibilityRole="button" accessibilityLabel={t('labelPaper.more', { field: name })}>
                              <Text style={st.stepBtnText}>+</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={st.sizeUnit}>mm</Text>
                        </View>
                      );
                    })}
                    <TouchableOpacity onPress={() => set({ a4: { ...A4_DEFAULTS } })} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                      <Text style={[st.link, { color: accentColor }]}>{t('labelPaper.reset')}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {issue && (
                  <Text style={st.warn} accessibilityRole="alert">
                    {t(issue.edge === 'right' ? 'labelPaper.fitRight' : 'labelPaper.fitBottom', { mm: issue.mm })}
                  </Text>
                )}

                <TouchableOpacity
                  style={[st.testBtn, { borderColor: accentColor }, (printingTest || !!issue) && { opacity: 0.5 }]}
                  onPress={testPage}
                  disabled={printingTest}
                  accessibilityRole="button"
                  accessibilityLabel={t('labelPaper.testPage')}
                >
                  <PrinterIcon size={16} color={accentColor} strokeWidth={2.2} />
                  <Text style={[st.testBtnText, { color: accentColor }]}>{t('labelPaper.testPage')}</Text>
                </TouchableOpacity>
                <Text style={st.hint}>{t('labelPaper.testPageSub')}</Text>
                <Text style={[st.hint, { marginTop: 8 }]}>{t('labelPaper.printHint')}</Text>
              </>
            )}

            {!tall && (
              <>
                {/* Letter: the sheet's layout is fixed, but most printers place the page a millimetre or two off. Move it by that much. */}
                <TouchableOpacity
                  style={st.sizesToggle}
                  onPress={() => setShowNudge(v => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showNudge }}
                  accessibilityLabel={t('labelPaper.nudge')}
                >
                  <Text style={[st.sizesToggleText, { color: accentColor }]}>{t('labelPaper.nudge')}</Text>
                  {showNudge ? <ChevronUpIcon size={18} color={accentColor} /> : <ChevronDownIcon size={18} color={accentColor} />}
                </TouchableOpacity>

                {showNudge && (
                  <View style={st.sizesBox}>
                    <Text style={st.hint}>{t(canSetPrinter ? 'labelPaper.nudgeHint' : 'labelPaper.nudgeHintStaff', { store: storeName ?? '' })}</Text>
                    <Text style={[st.hint, { fontWeight: '700' }]}>
                      {printer?.updatedBy
                        ? t('labelPaper.printerSetBy', { name: printer.updatedBy.split(' ')[0], store: storeName ?? printer.storeName })
                        : t('labelPaper.printerNotSet', { store: storeName ?? printer?.storeName ?? '' })}
                    </Text>
                    {(['down', 'right'] as (keyof LetterNudge)[]).map(k => {
                      const name = t(k === 'down' ? 'labelPaper.moveDown' : 'labelPaper.moveRight');
                      const v = draft[k];
                      return (
                        <View key={k} style={st.sizeRow}>
                          <Text style={st.sizeLabel}>{name}</Text>
                          <View style={st.stepper}>
                            {canSetPrinter && <TouchableOpacity style={st.stepBtnSm} onPress={() => setNudge(k, v - STEP_MM)} disabled={v <= NUDGE_LIMITS[k][0]}
                              accessibilityRole="button" accessibilityLabel={t('labelPaper.less', { field: name })}>
                              <Text style={st.stepBtnText}>−</Text>
                            </TouchableOpacity>}
                            <Text style={[st.sizeInput, { textAlignVertical: 'center' }]} accessibilityLabel={`${name}: ${v} mm`}>{v}</Text>
                            {canSetPrinter && <TouchableOpacity style={st.stepBtnSm} onPress={() => setNudge(k, v + STEP_MM)} disabled={v >= NUDGE_LIMITS[k][1]}
                              accessibilityRole="button" accessibilityLabel={t('labelPaper.more', { field: name })}>
                              <Text style={st.stepBtnText}>+</Text>
                            </TouchableOpacity>}
                          </View>
                          <Text style={st.sizeUnit}>mm</Text>
                        </View>
                      );
                    })}
                    {canSetPrinter && (
                      <>
                        <TouchableOpacity onPress={() => setDraft({ ...LETTER_NUDGE_DEFAULTS })} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                          <Text style={[st.link, { color: accentColor }]}>{t('labelPaper.nudgeReset')}</Text>
                        </TouchableOpacity>
                        {draftChanged && (
                          <TouchableOpacity
                            style={[st.doneBtn, { backgroundColor: accentColor, marginTop: 10 }, savingPrinter && { opacity: 0.6 }]}
                            onPress={savePrinter}
                            disabled={savingPrinter}
                            accessibilityRole="button"
                          >
                            <Text style={st.doneBtnText}>{t('labelPaper.printerSave', { store: storeName ?? '' })}</Text>
                          </TouchableOpacity>
                        )}
                        {draftChanged && <Text style={st.hint}>{t('labelPaper.printerTryFirst')}</Text>}
                      </>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={[st.testBtn, { borderColor: accentColor }, printingTest && { opacity: 0.5 }]}
                  onPress={testPage}
                  disabled={printingTest}
                  accessibilityRole="button"
                  accessibilityLabel={t('labelPaper.testPage')}
                >
                  <PrinterIcon size={16} color={accentColor} strokeWidth={2.2} />
                  <Text style={[st.testBtnText, { color: accentColor }]}>{t('labelPaper.testPage')}</Text>
                </TouchableOpacity>
                <Text style={st.hint}>{t('labelPaper.testPageLetterSub')}</Text>
                <Text style={[st.hint, { marginTop: 8 }]}>{t('labelPaper.printHintLetter')}</Text>
              </>
            )}

            <TouchableOpacity style={[st.doneBtn, { backgroundColor: accentColor }]} onPress={onClose} accessibilityRole="button">
              <Text style={st.doneBtnText}>{t('labelPaper.done')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardSafe>
      <ModalToastHost />
    </Modal>
  );
}

function sizeTexts(a: A4Sizes): Record<keyof A4Sizes, string> {
  return Object.fromEntries(SIZE_FIELDS.map(k => [k, String(a[k])])) as Record<keyof A4Sizes, string>;
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { backgroundColor: '#fff', borderRadius: 18, padding: 18, width: '100%', maxWidth: 400 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  section: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  group: { gap: 8 },
  row2: { flexDirection: 'row', gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 10 },
  cardColumn: { flex: 1, flexDirection: 'column', gap: 8, paddingVertical: 12 },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  mini: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 4, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 3, backgroundColor: '#fff' },
  miniCell: { backgroundColor: '#BFDBFE', borderRadius: 1 },
  tag: { width: 30, height: 56, borderWidth: 1.5, borderColor: '#334155', borderTopWidth: 4, borderRadius: 3, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, overflow: 'hidden', backgroundColor: '#fff' },
  tagName: { width: 20, height: 3, backgroundColor: '#334155', borderRadius: 1 },
  tagPrice: { fontSize: 10, fontWeight: '900' },
  tagCode: { width: 12, height: 10, backgroundColor: '#334155', opacity: 0.8 },
  startRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 8 },
  pick: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 4, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 4, backgroundColor: '#F8FAFC' },
  pickCell: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pickUsed: { backgroundColor: '#E2E8F0', borderColor: '#E2E8F0' },
  pickText: { fontSize: 10, color: COLORS.textMuted },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  stepBtnSm: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  stepBtnText: { fontSize: 19, fontWeight: '700', color: COLORS.text },
  stepValue: { minWidth: 40, textAlign: 'center', fontSize: 16, fontWeight: '800', color: COLORS.text },
  sizesToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 16, paddingVertical: 6, alignSelf: 'flex-start' },
  sizesToggleText: { fontSize: 14.5, fontWeight: '700' },
  sizesBox: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginTop: 4, gap: 10 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sizeLabel: { flex: 1, fontSize: 13.5, color: COLORS.text },
  sizeInput: { width: 54, paddingVertical: 6, fontSize: 15, fontWeight: '700', color: COLORS.text, backgroundColor: '#fff', textAlign: 'center' },
  sizeUnit: { fontSize: 12.5, color: COLORS.textMuted, width: 24 },
  link: { fontSize: 13.5, fontWeight: '700', textDecorationLine: 'underline' },
  warn: { fontSize: 13.5, fontWeight: '700', color: COLORS.error, marginTop: 10, lineHeight: 19 },
  hint: { fontSize: 12.5, color: COLORS.textMuted, lineHeight: 18, marginTop: 2 },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, marginTop: 14 },
  testBtnText: { fontSize: 14.5, fontWeight: '700' },
  doneBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  doneBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
});
