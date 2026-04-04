import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, StatusBar,
  ActivityIndicator, RefreshControl, TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { promotionsApi } from '../../services/api';
import { COLORS } from '../../constants';
import EmptyState from '../../components/EmptyState';

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

  const { data, isLoading } = useQuery({
    queryKey: ['published-promotions'],
    queryFn: () => promotionsApi.getPublished(),
    staleTime: 5 * 60 * 1000,
  });

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
            <Text style={s.bizIcon}>🏢</Text>
          </View>
          <View style={s.cardHeaderText}>
            <Text style={s.bizName}>{item.businessName}</Text>
            <Text style={s.cardTime}>{timeAgo(item.publishedAt)}</Text>
          </View>
          <View style={s.adBadge}>
            <Text style={s.adBadgeText}>Ad</Text>
          </View>
        </View>

        <Text style={s.adTitle}>{item.adTitle}</Text>
        <Text style={s.adBody}>{item.adBody}</Text>

        {item.website ? (
          <TouchableOpacity
            style={s.websiteBtn}
            onPress={() => Linking.openURL(item.website!).catch(() => {})}
            activeOpacity={0.75}
          >
            <Text style={s.websiteBtnText}>🌐 Visit Website</Text>
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
      ) : ads.length === 0 ? (
        <EmptyState
          emoji="📣"
          title="No ads yet"
          subtitle="Local business advertisements will appear here. Check back soon!"
        />
      ) : (
        <FlatList
          data={ads}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      )}
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
  bizIcon: { fontSize: 20 },
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
