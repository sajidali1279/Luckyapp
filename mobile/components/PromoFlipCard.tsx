import { useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '../constants';
import { BuildingIcon, MapPinIcon, GlobeIcon, MegaphoneIcon } from './Icons';

interface Ad {
  id: string;
  businessName: string;
  adTitle: string;
  adBody: string;
  adImageUrl: string | null;
  website: string | null;
  location: string | null;
}

const CARD_HEIGHT = 168;

// A single featured local-business ad on Home, shown as a compact card that
// flips (not scrolls) to reveal more detail — location + directions/website
// live only on the back, so the front stays a clean teaser rather than a
// wall of text. When there's no active ad, shows the "advertise your
// business" entry point instead of an empty/flippable card.
export default function PromoFlipCard({ ad }: { ad: Ad | null }) {
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  function toggleFlip() {
    Animated.spring(flipAnim, {
      toValue: flipped ? 0 : 1,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setFlipped((f) => !f);
  }

  if (!ad) {
    return (
      <TouchableOpacity
        style={s.ctaCard}
        activeOpacity={0.88}
        onPress={() => router.push('/(customer)/ads')}
        accessibilityRole="button"
        accessibilityLabel="Have a local business? Advertise it here"
      >
        <View style={s.ctaIconWrap}>
          <MegaphoneIcon size={22} color="#f97316" strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.ctaTitle}>Have a business? Promote it!</Text>
          <Text style={s.ctaSub}>Check out our advertising options</Text>
        </View>
        <Text style={s.ctaArrow}>›</Text>
      </TouchableOpacity>
    );
  }

  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [0, 0, 1, 1] });

  // ad is guaranteed non-null here (the `if (!ad) return` above already
  // handled that case) — TS just can't see that guarantee across these
  // nested function declarations, hence the assertions.
  function openDirections() {
    if (!ad!.location) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ad!.location)}`).catch(() => {});
  }

  function openWebsite() {
    if (!ad!.website) return;
    Linking.openURL(ad!.website).catch(() => {});
  }

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={toggleFlip}
      style={s.cardWrap}
      accessibilityRole="button"
      accessibilityLabel={flipped ? `${ad.businessName}, tap to flip back` : `${ad.businessName}: ${ad.adTitle}, tap for details`}
    >
      <Animated.View style={[s.face, { opacity: frontOpacity, transform: [{ rotateY: frontInterpolate }] }]}>
        {ad.adImageUrl ? (
          <Image source={{ uri: ad.adImageUrl }} style={s.frontImage} resizeMode="cover" />
        ) : (
          <View style={[s.frontImage, s.frontImagePlaceholder]}>
            <BuildingIcon size={32} color={COLORS.primary} strokeWidth={1.5} />
          </View>
        )}
        <View style={s.sponsoredTag}>
          <Text style={s.sponsoredTagText}>Sponsored</Text>
        </View>
        <View style={s.frontTextWrap}>
          <Text style={s.frontBizName} numberOfLines={1}>{ad.businessName}</Text>
          <Text style={s.frontTitle} numberOfLines={1}>{ad.adTitle}</Text>
        </View>
        <Text style={s.tapHintFront}>Tap for details</Text>
      </Animated.View>

      <Animated.View style={[s.face, s.backFace, { opacity: backOpacity, transform: [{ rotateY: backInterpolate }] }]}>
        <Text style={s.backBizName} numberOfLines={1}>{ad.businessName}</Text>
        <Text style={s.backBody} numberOfLines={3}>{ad.adBody}</Text>

        {ad.location ? (
          <View style={s.backRow}>
            <MapPinIcon size={13} color={COLORS.textMuted} strokeWidth={2} />
            <Text style={s.backRowText} numberOfLines={1}>{ad.location}</Text>
          </View>
        ) : null}

        <View style={s.backActions}>
          {ad.location ? (
            <TouchableOpacity
              style={s.backActionBtn}
              onPress={openDirections}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Get directions to ${ad.businessName}`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <MapPinIcon size={13} color="#fff" strokeWidth={2.5} />
              <Text style={s.backActionBtnText}>Directions</Text>
            </TouchableOpacity>
          ) : null}
          {ad.website ? (
            <TouchableOpacity
              style={[s.backActionBtn, s.backActionBtnAlt]}
              onPress={openWebsite}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Visit ${ad.businessName}'s website`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <GlobeIcon size={13} color={COLORS.primary} strokeWidth={2.5} />
              <Text style={[s.backActionBtnText, s.backActionBtnAltText]}>Website</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={s.tapHintBack}>Tap to flip back</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  cardWrap: { height: CARD_HEIGHT, marginBottom: 4 },
  face: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  frontImage: { width: '100%', height: '100%' },
  frontImagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary + '12' },
  sponsoredTag: {
    position: 'absolute', top: 10, left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sponsoredTagText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  frontTextWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14, paddingVertical: 10,
  },
  frontBizName: { color: '#fff', fontSize: 13, fontWeight: '700', opacity: 0.9 },
  frontTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 1 },
  tapHintFront: {
    position: 'absolute', top: 10, right: 10,
    color: '#fff', fontSize: 10, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },

  backFace: {
    padding: 16,
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBizName: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  backBody: { fontSize: 13, color: COLORS.textMuted, lineHeight: 18, marginTop: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  backRowText: { fontSize: 12, color: COLORS.textMuted, flex: 1 },
  backActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  backActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary, borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  backActionBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  backActionBtnAlt: { backgroundColor: COLORS.primary + '12' },
  backActionBtnAltText: { color: COLORS.primary },
  tapHintBack: {
    position: 'absolute', bottom: 10, right: 14,
    fontSize: 10, fontWeight: '700', color: COLORS.textMuted,
  },

  ctaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff7ed', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  ctaIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#f9731618', alignItems: 'center', justifyContent: 'center',
  },
  ctaTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  ctaSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  ctaArrow: { fontSize: 22, color: '#f97316', fontWeight: '700' },
});
