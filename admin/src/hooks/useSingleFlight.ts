import { useRef } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';

/**
 * Runs a mutation at most once at a time: a second call while the first is still going is ignored. `isPending` only turns true on the
 * next render, and a fast double click lands before that, so a button that relies on `disabled={isPending}` alone can still send twice.
 */
export function useSingleFlight<TData, TError, TVars, TContext>(mutation: UseMutationResult<TData, TError, TVars, TContext>) {
  const busy = useRef(false);
  return (vars: TVars) => {
    if (busy.current) return;
    busy.current = true;
    mutation.mutate(vars, { onSettled: () => { busy.current = false; } });
  };
}
