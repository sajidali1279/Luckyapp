import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants';
import { CheckCircleIcon, CircleIcon, PrinterIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';
import KeyboardSafe from './KeyboardSafe';
import ModalToastHost from './ModalToastHost';
import { SheetSettings, A4Sizes, A4_DEFAULTS, cleanSheet, fitIssue } from '../utils/labelSheet';
import { printTestSheet } from '../utils/printLabels';

// Which label paper My Prints prints on: US Letter with 30 labels (as always), or A4 with 18 tall labels, turned sideways (for a shelf
// edge) or upright (for a door or a peg). A4 sheets differ by maker, so their sizes can be adjusted here, checked with a test page of
// outlines printed on plain paper. The choice is kept on this phone.

const SIZE_FIELDS: (keyof A4Sizes)[] = ['labelW', 'labelH', 'top', 'left', 'gapX', 'gapY'];

export function paperSummary(t: (k: string) => string, sheet: SheetSettings): string {
  return sheet.format === 'letter30'
    ? t('labelPaper.paperLetter')
    : `${t('labelPaper.paperA4')} · ${t(sheet.design === 'upright' ? 'labelPaper.upright' : 'labelPaper.sideways')}`;
}

export default function LabelPaperModal({ visible, sheet, accentColor, onChange, onClose }: {
  visible: boolean;
  sheet: SheetSettings;
  accentColor: string;
  onChange: (next: SheetSettings) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const [showSizes, setShowSizes] = useState(false);
  const [texts, setTexts] = useState<Record<keyof A4Sizes, string>>(() => sizeTexts(sheet.a4));
  const [editing, setEditing] = useState<keyof A4Sizes | null>(null);
  const [printingTest, setPrintingTest] = useState(false);

  // The boxes show the kept numbers, except the one being typed in (so "31." is not rewritten while typing)
  useEffect(() => {
    setTexts(prev => {
      const next = sizeTexts(sheet.a4);
      if (editing) next[editing] = prev[editing];
      return next;
    });
  }, [sheet.a4, editing]);

  const set = (next: Partial<SheetSettings>) => onChange(cleanSheet({ ...sheet, ...next }));
  const tall = sheet.format === 'a4x18';
  const issue = tall ? fitIssue(sheet.a4) : null;

  async function testPage() {
    if (printingTest) return;
    if (issue) { Toast.show({ type: 'error', text1: t('labelPaper.fixSizesFirst') }); return; }
    setPrintingTest(true);
    try {
      await printTestSheet(sheet);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: t('labelPaper.testFailed'), text2: err?.message });
    } finally {
      setPrintingTest(false);
    }
  }

  const option = (selected: boolean, title: string, sub: string, onPress: () => void, a11y: string) => (
    <TouchableOpacity
      style={[st.option, selected && { borderColor: accentColor, backgroundColor: `${accentColor}0D` }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
    >
      {selected ? <CheckCircleIcon size={20} color={accentColor} strokeWidth={2.4} /> : <CircleIcon size={20} color={COLORS.border} strokeWidth={2} />}
      <View style={{ flex: 1 }}>
        <Text style={[st.optionTitle, selected && { color: accentColor }]}>{title}</Text>
        <Text style={st.optionSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSafe style={st.overlay}>
        <View style={[st.card, { maxHeight: screenHeight * 0.88 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={st.titleRow}>
              <PrinterIcon size={20} color={accentColor} strokeWidth={2.2} />
              <Text style={st.title}>{t('labelPaper.title')}</Text>
            </View>

            <View accessibilityRole="radiogroup" style={st.group}>
              {option(!tall, t('labelPaper.paperLetter'), t('labelPaper.paperLetterSub'), () => set({ format: 'letter30' }),
                `${t('labelPaper.paperLetter')}, ${t('labelPaper.paperLetterSub')}`)}
              {option(tall, t('labelPaper.paperA4'), t('labelPaper.paperA4Sub'), () => set({ format: 'a4x18' }),
                `${t('labelPaper.paperA4')}, ${t('labelPaper.paperA4Sub')}`)}
            </View>

            {tall && (
              <>
                <Text style={st.section}>{t('labelPaper.design')}</Text>
                <View accessibilityRole="radiogroup" style={st.group}>
                  {option(sheet.design === 'sideways', t('labelPaper.sideways'), t('labelPaper.sidewaysSub'), () => set({ design: 'sideways' }),
                    `${t('labelPaper.sideways')}, ${t('labelPaper.sidewaysSub')}`)}
                  {option(sheet.design === 'upright', t('labelPaper.upright'), t('labelPaper.uprightSub'), () => set({ design: 'upright' }),
                    `${t('labelPaper.upright')}, ${t('labelPaper.uprightSub')}`)}
                </View>

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
                    {SIZE_FIELDS.map(k => (
                      <View key={k} style={st.sizeRow}>
                        <Text style={st.sizeLabel}>{t(`labelPaper.${k}`)}</Text>
                        <TextInput
                          style={st.sizeInput}
                          value={texts[k]}
                          keyboardType="decimal-pad"
                          maxLength={5}
                          onFocus={() => setEditing(k)}
                          onBlur={() => setEditing(null)}
                          onChangeText={text => {
                            const clean = text.replace(',', '.').replace(/[^0-9.]/g, '');
                            setTexts(prev => ({ ...prev, [k]: clean }));
                            const v = parseFloat(clean);
                            if (Number.isFinite(v)) set({ a4: { ...sheet.a4, [k]: v } });
                          }}
                          accessibilityLabel={`${t(`labelPaper.${k}`)} (mm)`}
                        />
                        <Text style={st.sizeUnit}>mm</Text>
                      </View>
                    ))}
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, width: '100%', maxWidth: 380 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  group: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 12 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  optionSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  sizesToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, paddingVertical: 6, alignSelf: 'flex-start' },
  sizesToggleText: { fontSize: 14.5, fontWeight: '700' },
  sizesBox: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginTop: 4, gap: 8 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sizeLabel: { flex: 1, fontSize: 13.5, color: COLORS.text },
  sizeInput: { width: 70, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 15, color: COLORS.text, backgroundColor: '#fff', textAlign: 'right' },
  sizeUnit: { fontSize: 13, color: COLORS.textMuted, width: 26 },
  link: { fontSize: 13.5, fontWeight: '700', textDecorationLine: 'underline' },
  warn: { fontSize: 13.5, fontWeight: '700', color: COLORS.error, marginTop: 10, lineHeight: 19 },
  hint: { fontSize: 12.5, color: COLORS.textMuted, lineHeight: 18, marginTop: 4 },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, marginTop: 14 },
  testBtnText: { fontSize: 14.5, fontWeight: '700' },
  doneBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  doneBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
});
