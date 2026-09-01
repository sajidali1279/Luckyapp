interface DataTablePaginationProps {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  extraInfo?: string;
}

export default function DataTablePagination({ page, totalPages, onPrevious, onNext, extraInfo }: DataTablePaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-4">
      <button
        className="rounded-lg border border-border bg-background px-5 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onPrevious}
        disabled={page === 1}
      >
        ← Prev
      </button>
      <span className="text-sm font-medium text-muted-foreground">Page {page} of {totalPages}{extraInfo ? ` ${extraInfo}` : ''}</span>
      <button
        className="rounded-lg border border-border bg-background px-5 py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onNext}
        disabled={page === totalPages}
      >
        Next →
      </button>
    </div>
  );
}
