import { useState } from 'react';

// Drives a RefreshControl from one or more react-query refetch functions.
// It keeps its own flag instead of reusing a query's isRefetching, so a
// background refetch (on focus, on an interval) never makes the pull
// spinner appear by itself.
export function usePullRefresh(refetches: Array<() => Promise<unknown>>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled(refetches.map(refetch => refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  return { refreshing, onRefresh };
}
