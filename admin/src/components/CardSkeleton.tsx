import { Skeleton } from './ui/skeleton';

interface CardSkeletonProps {
  count?: number;
}

// Generic loading placeholder for non-tabular data-driven pages (KPI cards,
// list items, chat threads, etc). See TableSkeleton for the tabular version.
export default function CardSkeleton({ count = 4 }: CardSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}
