import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useCurrentStoreId } from '../utils/geo';
import PriceCheckModal from './PriceCheckModal';

/**
 * Price Check from the side menu (2026-11-10): the same scanner as the Labels screen's Price Check button, opened straight away for the
 * store this person is at (GPS among their stores, as Labels does). It opens fresh on each visit; closing it goes back to Home.
 */
export default function PriceCheckScreen({ homeRoute }: { homeRoute: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const storeIds = useAuthStore((s) => s.user?.storeIds);
  // The store list every signed-in person may read (the same query Labels uses)
  const { data } = useQuery({ queryKey: ['gas-prices'], queryFn: () => storesApi.getGasPrices() });
  const allStores: any[] = data?.data?.data || [];
  const storeId = useCurrentStoreId(allStores, storeIds);

  const [open, setOpen] = useState(false);
  useFocusEffect(useCallback(() => {
    setOpen(true);
    return () => setOpen(false);
  }, []));

  const close = () => { setOpen(false); router.navigate(homeRoute as any); };

  if (!storeId) {
    return (
      <View style={st.empty}>
        <Text style={st.emptyText}>{t('sharedPriceCheck.noStore')}</Text>
      </View>
    );
  }
  return (
    <View style={st.screen}>
      {open && <PriceCheckModal visible onClose={close} storeId={storeId} />}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: COLORS.background },
  emptyText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
});
