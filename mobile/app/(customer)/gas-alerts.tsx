// Gas price alerts (2026-10-23, HQ switch in admin > Engagement): "tell me when regular is at or under $X at this store". The server checks
// each time HQ updates the prices, and sends one push per drop (it re-arms once the price goes back above the alert).
import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Text } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { COLORS } from '../../constants';
import { engagementApi, storesApi } from '../../services/api';
import { haptic } from '../../utils/haptics';
import ErrorState from '../../components/ErrorState';
import BackButton from '../../components/BackButton';
import KeyboardSafe from '../../components/KeyboardSafe';
import { useCurrentStoreId } from '../../utils/geo';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import LargeTitleHeader, { useLargeTitleScroll } from '../../components/LargeTitleHeader';
import { useEngagement } from '../../hooks/useEngagement';

type Fuel = 'GAS' | 'DIESEL';
const price = (n: number | null | undefined, none: string) => (n == null ? none : `$${Number(n).toFixed(2)}`);

export default function GasAlertsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const largeTitle = useLargeTitleScroll();
  const eng = useEngagement(undefined, true);
  const stores = useQuery({ queryKey: ['gas-prices'], queryFn: () => storesApi.getGasPrices(), staleTime: 30_000 });
  const list: any[] = (stores.data?.data?.data ?? []).filter((x: any) => x.gasPricePerGallon != null || x.dieselPricePerGallon != null);
  const nearest = useCurrentStoreId(list, list.map((x) => x.id));
  const [picked, setPicked] = useState<string | null>(null);
  const storeId = picked ?? nearest ?? list[0]?.id ?? null;
  const store = list.find((x) => x.id === storeId);
  const [fuel, setFuel] = useState<Fuel>('GAS');
  const [text, setText] = useState('');
  const { refreshing, onRefresh } = usePullRefresh([() => eng.refetch(), () => stores.refetch()]);

  const alerts = eng.data?.gasAlerts ?? [];
  const nameOf = (id: string) => (stores.data?.data?.data ?? []).find((x: any) => x.id === id)?.name ?? '';
  const current = store ? (fuel === 'GAS' ? store.gasPricePerGallon : store.dieselPricePerGallon) : null;

  const save = useMutation({
    mutationFn: () => engagementApi.putGasAlert({ storeId: storeId!, fuel, maxPrice: Number(text.replace(',', '.')) }),
    onSuccess: () => { haptic.success(); setText(''); Toast.show({ type: 'success', text1: t('engagement.alertSaved') }); qc.invalidateQueries({ queryKey: ['engagement'] }); },
    onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.error || t('engagement.alertFailed') }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => engagementApi.deleteGasAlert(id),
    onSuccess: () => { haptic.tap(); qc.invalidateQueries({ queryKey: ['engagement'] }); },
    onError: () => Toast.show({ type: 'error', text1: t('engagement.alertFailed') }),
  });
  const valid = !!storeId && Number(text.replace(',', '.')) >= 0.5;

  return (
    <View style={s.root}>
      <LargeTitleHeader title={t('engagement.gasTitle')} subtitle={t('engagement.gasSub')} scrollY={largeTitle.scrollY} left={<BackButton variant="light" />} />
      {eng.isLoading || stores.isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : eng.isError || stores.isError ? (
        <ErrorState message={t('engagement.loadError')} onRetry={() => { eng.refetch(); stores.refetch(); }} />
      ) : eng.data?.gasAlerts == null ? (
        <View style={s.center}><Text style={s.muted}>{t('engagement.gasOff')}</Text></View>
      ) : (
        <KeyboardSafe style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} onScroll={largeTitle.onScroll} scrollEventThrottle={largeTitle.scrollEventThrottle}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}>
            <View style={s.card}>
              <Text style={s.label}>{t('engagement.gasStore')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {list.map((x) => (
                  <TouchableOpacity key={x.id} onPress={() => setPicked(x.id)} style={[s.chip, x.id === storeId && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: x.id === storeId }}>
                    <Text style={[s.chipText, x.id === storeId && s.chipTextOn]}>{x.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={s.row}>
                {(['GAS', 'DIESEL'] as Fuel[]).map((f) => (
                  <TouchableOpacity key={f} onPress={() => setFuel(f)} style={[s.chip, { flex: 1, alignItems: 'center' }, f === fuel && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: f === fuel }}>
                    <Text style={[s.chipText, f === fuel && s.chipTextOn]}>{f === 'GAS' ? t('engagement.gas') : t('engagement.diesel')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.muted}>{t('engagement.gasNow', { price: price(current, t('profile.notSet')) })}</Text>
              <Text style={s.label}>{t('engagement.gasMax')}</Text>
              <View style={s.row}>
                <Text style={s.dollar}>$</Text>
                <TextInput style={s.input} value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="2.99" placeholderTextColor={COLORS.textMuted} maxLength={6} accessibilityLabel={t('engagement.gasMax')} />
                <TouchableOpacity style={[s.btn, (!valid || save.isPending) && { opacity: 0.5 }]} disabled={!valid || save.isPending} onPress={() => save.mutate()} accessibilityRole="button">
                  {save.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>{t('engagement.alertSave')}</Text>}
                </TouchableOpacity>
              </View>
            </View>

            <Text style={s.section}>{t('engagement.gasYours')}</Text>
            {alerts.length === 0 ? <Text style={s.muted}>{t('engagement.gasNone')}</Text> : alerts.map((a) => (
              <View key={a.id} style={[s.card, s.alertRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.alertTitle}>{nameOf(a.storeId)}</Text>
                  <Text style={s.muted}>{t('engagement.alertLine', { fuel: a.fuel === 'GAS' ? t('engagement.gas') : t('engagement.diesel'), price: price(a.maxPrice, t('profile.notSet')) })}</Text>
                </View>
                <TouchableOpacity onPress={() => remove.mutate(a.id)} disabled={remove.isPending} style={s.del} accessibilityRole="button" accessibilityLabel={t('engagement.alertRemove')}>
                  <Text style={s.delText}>{t('engagement.alertRemove')}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </KeyboardSafe>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16, gap: 12, paddingBottom: 60 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: '#EEF1F5' },
  label: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  muted: { fontSize: 13, color: COLORS.textMuted },
  section: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  chipTextOn: { color: '#fff' },
  dollar: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  input: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, fontSize: 18, fontWeight: '700', color: COLORS.text, backgroundColor: '#fff' },
  btn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 18, height: 46, alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  alertRow: { flexDirection: 'row', alignItems: 'center' },
  alertTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  del: { paddingHorizontal: 12, paddingVertical: 8 },
  delText: { color: COLORS.danger ?? '#DC2626', fontWeight: '700', fontSize: 13 },
});
