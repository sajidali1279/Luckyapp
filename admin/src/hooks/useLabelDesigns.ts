import { useQuery } from '@tanstack/react-query';
import { labelsApi } from '../services/api';
import { LabelDesign, rememberDesigns } from '../utils/labelDesign';

/** HQ's label designs (2026-11-21). Loading them also tells the print code, so any label carrying a design id prints in it. */
export function useLabelDesigns() {
  const q = useQuery({
    queryKey: ['label-designs'],
    queryFn: async () => {
      const r = await labelsApi.designs();
      const list: LabelDesign[] = Array.isArray(r.data?.data) ? r.data.data : [];
      rememberDesigns(list);
      return list;
    },
    staleTime: 60_000,
  });
  return { designs: q.data ?? [], isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
