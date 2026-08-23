import { View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { GasPumpIcon, TruckIcon } from './Icons';
import { useRecentlyChanged } from '../utils/geo';

function fmtPrice(n: number | null | undefined) {
  return n != null ? `$${n.toFixed(3)}` : '—';
}

function PriceRow({
  icon, label, price, changed,
}: { icon: React.ReactNode; label: string; price: number | null | undefined; changed: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!changed) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [changed]);

  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        {icon}
        <Text style={s.label}>{label}</Text>
      </View>
      <View style={s.rowRight}>
        {changed && (
          <Animated.View style={[s.changeTag, { opacity: pulse }]}>
            <Text style={s.changeTagText}>Change Needed</Text>
          </Animated.View>
        )}
        <Text style={[s.price, changed && s.priceChanged]}>{fmtPrice(price)}/gal</Text>
      </View>
    </View>
  );
}

export default function GasPriceCard({
  gasPrice, dieselPrice, gasUpdatedAt, dieselUpdatedAt,
}: {
  gasPrice: number | null | undefined;
  dieselPrice: number | null | undefined;
  gasUpdatedAt: string | null | undefined;
  dieselUpdatedAt: string | null | undefined;
}) {
  const gasChanged = useRecentlyChanged(gasUpdatedAt);
  const dieselChanged = useRecentlyChanged(dieselUpdatedAt);

  if (gasPrice == null && dieselPrice == null) return null;

  return (
    <View style={s.card}>
      {gasPrice != null && (
        <PriceRow icon={<GasPumpIcon size={16} color="#fff" strokeWidth={2} />} label="Gas" price={gasPrice} changed={gasChanged} />
      )}
      {dieselPrice != null && (
        <PriceRow icon={<TruckIcon size={16} color="#fff" strokeWidth={2} />} label="Diesel" price={dieselPrice} changed={dieselChanged} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: 20, marginBottom: 10, paddingVertical: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 7,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },
  price: { color: '#fff', fontSize: 14, fontWeight: '800' },
  priceChanged: { color: '#fca5a5' },
  changeTag: {
    backgroundColor: '#dc2626', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  changeTagText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
});
