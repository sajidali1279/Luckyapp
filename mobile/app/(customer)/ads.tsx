import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, StatusBar, ScrollView,
  ActivityIndicator, RefreshControl, TouchableOpacity, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { promotionsApi } from '../../services/api';
import { COLORS } from '../../constants';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import FadeSlideIn from '../../components/FadeSlideIn';
import PromoteBusinessModal from '../../components/PromoteBusinessModal';
import { MegaphoneIcon, BuildingIcon, GlobeIcon } from '../../components/Icons';

interface Ad {
  id: string;
  businessName: string;
  adTitle: string;
  adBody: string;
  adImageUrl: string | null;
  website: string | null;
  publishedAt: string;
  adExpiresAt: string | null;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AdsScreen() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['published-promotions'],
    queryFn: () => promotionsApi.getPublished(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: myPromoData } = useQuery({
    queryKey: ['my-promo-request'],
    queryFn: () => promotionsApi.getMy(),
  });
  const myPromoStatus: string | undefined = myPromoData?.data?.data?.status;

  const ads: Ad[] = data?.data?.data ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['published-promotions'] });
    setRefreshing(false);
  }, [qc]);

  function renderItem({ item }: { item: Ad }) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.bizIconWrap}>
            <BuildingIcon size={20} color={COLORS.primary} strokeWidth={1.75} />
          </View>
          <View style={s.cardHeaderText}>
            <Text style={s.bizName}>{item.businessName}</Text>
            <Text style={s.cardTime}>{timeAgo(item.publishedAt)}</Text>
          </View>
          <View style={s.adBadge}>
            <Text style={s.adBadgeText}>Ad</Text>
          </View>
        </View>

        {item.adImageUrl ? (
          <Image source={{ uri: item.adImageUrl }} style={s.adImage} resizeMode="cover" />
        ) : null}
        <Text style={s.adTitle}>{item.adTitle}</Text>
        <Text style={s.adBody}>{item.adBody}</Text>

        {item.website ? (
          <TouchableOpacity
            style={s.websiteBtn}
            onPress={() => Linking.openURL(item.website!).catch(() => {})}
            activeOpacity={0.75}
            accessibilityRole="link"
            accessibilityLabel={`Visit ${item.businessName}'s website`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <GlobeIcon size={14} color={COLORS.primary} strokeWidth={2} />
              <Text style={s.websiteBtnText}>Visit Website</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {item.adExpiresAt && new Date(item.adExpiresAt) > new Date() && (
          <Text style={s.expiresText}>
            Offer expires {new Date(item.adExpiresAt).toLocaleDateString()}
          </Text>
        )}
      </View>
    );
  }

  function PromoteCta() {
    return (
      <View style={s.promoCard}>
        <View style={s.promoIconWrap}>
          <BuildingIcon size={22} color="#f97316" strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.promoTitle}>Own a local business?</Text>
          <Text style={s.promoSub}>
            Auto care, towing, landscaping, or anything else - promote it to every Lucky Stop customer here.
          </Text>
          <Text style={s.promoDisclaimer}>Charges may apply, contact us for details</Text>
        </View>
        {myPromoStatus === 'PENDING' ? (
          <View style={[s.promoBadge, { backgroundColor: '#fffbeb' }]}>
            <Text style={[s.promoBadgeText, { color: '#b45309' }]}>Pending</Text>
          </View>
        ) : myPromoStatus === 'APPROVED' ? (
          <View style={[s.promoBadge, { backgroundColor: '#f0fdf4' }]}>
            <Text style={[s.promoBadgeText, { color: '#16a34a' }]}>Live</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={s.promoBtn}
            onPress={() => setShowPromoteModal(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Promote your business"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={s.promoBtnText}>Promote →</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={s.header}>
        <Text style={s.headerTitle}>Local Ads</Text>
        <Text style={s.headerSub}>Businesses in your community</Text>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : isError ? (
        <ErrorState message="Failed to load ads." onRetry={() => refetch()} />
      ) : ads.length === 0 ? (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          <PromoteCta />
          <EmptyState
            icon={<MegaphoneIcon size={52} color="#C4CAD4" strokeWidth={1.25} />}
            title="No ads yet"
            subtitle="Local business advertisements will appear here. Check back soon!"
          />
        </ScrollView>
      ) : (
        <FadeSlideIn style={{ flex: 1 }}>
          <FlatList
            data={ads}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            ListHeaderComponent={PromoteCta}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
          />
        </FadeSlideIn>
      )}

      <PromoteBusinessModal visible={showPromoteModal} onClose={() => setShowPromoteModal(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },

  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff7ed',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  promoIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f9731618',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  promoSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },
  promoDisclaimer: { fontSize: 10, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' },
  promoBtn: {
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  promoBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  promoBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  promoBadgeText: { fontSize: 11, fontWeight: '800' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 0 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bizIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: { flex: 1 },
  bizName: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  cardTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  adBadge: {
    backgroundColor: '#f9731618',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#f9731630',
  },
  adBadgeText: { fontSize: 10, fontWeight: '800', color: '#f97316' },

  adImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 2 },
  adTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, lineHeight: 22 },
  adBody: { fontSize: 14, color: COLORS.textMuted, lineHeight: 21 },

  websiteBtn: {
    backgroundColor: COLORS.primary + '12',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  websiteBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  expiresText: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' },
});
