import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { pointsApi } from '../../services/api';
import { COLORS } from '../../constants';
import { format } from 'date-fns';

export default function HistoryScreen() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['my-history'],
    queryFn: ({ pageParam = 1 }) => pointsApi.getMyHistory(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      const { total, limit } = lastPage.data.data;
      return allPages.length * limit < total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const transactions = data?.pages.flatMap((p) => p.data.data.transactions) || [];

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Points History</Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Visit a Lucky Stop and earn your first credits!</Text>
          </View>
        }
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={COLORS.primary} /> : null}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardLeft}>
              <Text style={styles.storeName}>{item.store?.name || 'Lucky Stop'}</Text>
              <Text style={styles.date}>{format(new Date(item.createdAt), 'MMM d, yyyy • h:mm a')}</Text>
              <Text style={styles.category}>{item.category?.replace('_', ' ')}</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.points}>+${item.pointsAwarded.toFixed(2)}</Text>
              <Text style={styles.purchase}>on ${item.purchaseAmount.toFixed(2)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 60, backgroundColor: COLORS.primary },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  list: { padding: 16 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10,
  },
  cardLeft: { flex: 1 },
  storeName: { fontWeight: '700', fontSize: 15, color: COLORS.text },
  date: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  category: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  cardRight: { alignItems: 'flex-end' },
  points: { fontSize: 20, fontWeight: '800', color: COLORS.success },
  purchase: { color: COLORS.textMuted, fontSize: 12 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtext: { color: COLORS.textMuted, marginTop: 8, textAlign: 'center' },
});
