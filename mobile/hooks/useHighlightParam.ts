import { useCallback, useState } from 'react';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';

/**
 * Reads a `highlightId` route param set by a notification deep link,
 * exposes it for one focus pass, then clears both the local state and
 * the URL param so revisiting the screen later doesn't replay it.
 */
export function useHighlightParam(): string | null {
  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>();
  const [active, setActive] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!highlightId) return;
      setActive(highlightId);
      const timer = setTimeout(() => {
        setActive(null);
        router.setParams({ highlightId: '' });
      }, 1700);
      return () => clearTimeout(timer);
    }, [highlightId])
  );

  return active;
}
