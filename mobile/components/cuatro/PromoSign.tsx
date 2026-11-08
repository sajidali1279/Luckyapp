// The sign Cuatro holds up for a business promotion (2026-11-08): a white board on a stick with the business's name and a small "Ad" tag
// (paid placements are labelled as ads). Drawn beside him, on the side with room, at his hand's height.
import { StyleSheet, View } from 'react-native';
import { Text } from '../ScaledText';
import { COLORS } from '../../constants';

export const SIGN_W = 104;

export default function PromoSign({ business, adLabel }: { business: string; adLabel: string }) {
  return (
    <View style={s.wrap} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.board}>
        <View style={s.tag}><Text style={s.tagText}>{adLabel}</Text></View>
        <Text style={s.name} numberOfLines={2}>{business}</Text>
      </View>
      <View style={s.stick} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: SIGN_W, alignItems: 'center' },
  board: { width: SIGN_W, minHeight: 44, backgroundColor: '#fff', borderRadius: 10, borderWidth: 2.5, borderColor: '#1a3a2a',
    paddingHorizontal: 8, paddingTop: 12, paddingBottom: 6, justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tag: { position: 'absolute', top: -2, right: -2, backgroundColor: COLORS.primary, borderTopRightRadius: 8, borderBottomLeftRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '900', color: '#1a3a2a', textAlign: 'center', lineHeight: 16 },
  stick: { width: 5, height: 26, borderRadius: 2, backgroundColor: '#8a5a2b', marginTop: -1 },
});
