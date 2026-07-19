// Every notification destination URL, built once here instead of re-derived
// (and drifting out of sync) by three separate mobile role-switches and an
// admin page. Optional ids are omitted from the query string when absent —
// the destination screen's highlight hook just no-ops if nothing matches.

function withHighlight(base: string, id?: string): string {
  return id ? `${base}?highlightId=${id}` : base;
}

// ─── Mobile: Customer ──────────────────────────────────────────────────────
export function offerUrl(): string {
  return '/(customer)/home?scrollTo=offers';
}
export function careersUrl(): string {
  return '/(customer)/careers';
}
export function gasPriceUrlCustomer(): string {
  return '/(customer)/home?scrollTo=gas';
}
export function pointsUrl(transactionId?: string): string {
  return withHighlight('/(customer)/history', transactionId);
}
export function redemptionUrl(redemptionId?: string): string {
  return withHighlight('/(customer)/rewards', redemptionId);
}
export function productRequestUrlCustomer(requestId: string): string {
  return withHighlight('/(customer)/request-product', requestId);
}
export function disputeResolvedUrl(disputeId: string): string {
  return withHighlight('/(customer)/my-disputes', disputeId);
}

// ─── Mobile: Employee ──────────────────────────────────────────────────────
export function hotFoodOrderUrl(orderId: string): string {
  return `/(employee)/hot-food?tab=PENDING&highlightId=${orderId}`;
}
export function gasPriceUrlEmployee(): string {
  return '/(employee)/scan';
}
export function shiftRequestUrlEmployee(): string {
  return '/(employee)/requests';
}
export function storeRequestUrlEmployee(requestId: string): string {
  return withHighlight('/(employee)/requests', requestId);
}
export function scheduleUrl(): string {
  return '/(employee)/schedule';
}
export function stockRequestUrlEmployee(requestId: string): string {
  return `/(employee)/stock-request?tab=mine&highlightId=${requestId}`;
}
export function disputeSubmittedUrlEmployee(): string {
  return '/(employee)/home';
}

// ─── Mobile: Store Manager ─────────────────────────────────────────────────
export function stockRequestUrlManager(requestId: string): string {
  return `/(manager)/requests?tab=stock&highlightId=${requestId}`;
}
export function productRequestUrlManager(requestId: string): string {
  return `/(manager)/requests?tab=products&highlightId=${requestId}`;
}
export function alertUrlManager(requestId?: string): string {
  const base = '/(manager)/requests?tab=alerts';
  return requestId ? `${base}&highlightId=${requestId}` : base;
}

// ─── Admin web ──────────────────────────────────────────────────────────────
export function adminDisputeUrl(disputeId: string): string {
  return `/customers?tab=disputes&highlightId=${disputeId}`;
}
export function adminAlertUrl(storeId: string, requestId: string): string {
  return `/store-requests?storeId=${storeId}&tab=employee&highlightId=${requestId}`;
}
export function adminProductRequestUrl(storeId: string, requestId: string): string {
  return `/store-requests?storeId=${storeId}&tab=product&highlightId=${requestId}`;
}
export function adminStockRequestUrl(storeId: string, requestId: string): string {
  return `/store-requests?storeId=${storeId}&tab=stock&highlightId=${requestId}`;
}
