/** The server's own explanation of a refusal ("over $800 needs a Super Admin", "already handled"), or the fallback line. */
export function serverMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === 'string' && msg ? msg : fallback;
}

/**
 * What to tell someone when a save failed: the server's own sentence when it sent one, a line about the connection when it never
 * answered (so nobody wonders whether the change went through), otherwise the fallback.
 */
export function failureMessage(e: unknown, fallback: string): string {
  const answered = (e as { response?: unknown })?.response;
  if (!answered) return 'Could not reach the server, so nothing was changed. Check the connection and try again.';
  return serverMessage(e, fallback);
}

const FIELD_NAMES: Record<string, string> = {
  storeId: 'Store', bonusRate: 'Bonus', tierBonusRates: 'Tier bonuses', gasBonusCentsPerGallon: 'Cents per gallon',
  dealText: 'Deal text', startDate: 'Start date', endDate: 'End date', linkUrl: 'Link', sortOrder: 'Order',
  pin: 'PIN', newPin: 'New PIN', currentPin: 'Current PIN', phone: 'Phone number', requires21: 'Age restriction',
};

function fieldName(key: string): string {
  return FIELD_NAMES[key] ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/**
 * A sentence for whatever the server sent as `error`. Many routes answer a refused form with zod's flatten() object
 * ({ formErrors, fieldErrors }), which is not text: put into a toast it crashes the page ("Objects are not valid as a
 * React child"). The response interceptor in services/api.ts runs every such answer through here, so every place that
 * reads `response.data.error` gets a string.
 */
export function refusalText(error: unknown): string {
  if (typeof error === 'string') return error;
  const generic = 'Some of the values were not accepted. Please check the form and try again.';
  if (Array.isArray(error)) return error.filter((x) => typeof x === 'string').join(' ') || generic;
  if (!error || typeof error !== 'object') return generic;
  const { formErrors, fieldErrors } = error as { formErrors?: unknown; fieldErrors?: unknown };
  const parts: string[] = [];
  if (Array.isArray(formErrors)) parts.push(...formErrors.filter((x): x is string => typeof x === 'string'));
  if (fieldErrors && typeof fieldErrors === 'object') {
    for (const [key, msgs] of Object.entries(fieldErrors as Record<string, unknown>)) {
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) if (typeof m === 'string') parts.push(m.endsWith('.') ? m : `${fieldName(key)}: ${m}`);
    }
  }
  return parts.length ? parts.slice(0, 3).join(' ') : generic;
}
