// Rules for a store's own details: phone, coordinates, gas prices, and whether it is open for business.

import { Response } from 'express';
import prisma from '../config/prisma';

/** A gas or diesel price per gallon: from $0.50 to $20, at most three decimals (3.199). A typed 0.319 is caught by the page's own check on size. */
export const GAS_PRICE_MIN = 0.5;
export const GAS_PRICE_MAX = 20;

/** A store phone stored as +1 and ten digits, or null when it is not a full ten-digit US number ("(580) 924-9898", "580-924-9898" and "+1 580 924 9898" are one number). */
export function storePhone(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return ten.length === 10 ? `+1${ten}` : null;
}

// The chain runs in the lower 48 states. A pair outside them is a typo: swapped latitude and longitude, or a missing minus sign on the longitude.
export const US_BOUNDS = { latMin: 24, latMax: 50, lngMin: -125, lngMax: -66 };
export function inUnitedStates(lat: number, lng: number): boolean {
  return lat >= US_BOUNDS.latMin && lat <= US_BOUNDS.latMax && lng >= US_BOUNDS.lngMin && lng <= US_BOUNDS.lngMax;
}
export const COORDINATES_MESSAGE = 'Those coordinates are not in the United States. Check that the latitude and longitude are not swapped and that the longitude has its minus sign (for Texas, about 26 to 36 and -94 to -106).';
export const COORDINATE_PAIR_MESSAGE = 'Give both the latitude and the longitude, or leave both empty.';

/**
 * Answers a POS operation (a grant, a redemption, a benefit claim) at a store that is closed or does not exist, and returns true when it has.
 * Deactivating a store used to change only what customers see: cashiers could keep granting points there.
 */
export async function refuseIfStoreClosed(res: Response, storeId: string): Promise<boolean> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, isActive: true } });
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return true; }
  if (!store.isActive) {
    res.status(409).json({ success: false, error: `${store.name} is closed, so sales and redemptions cannot be recorded there. Ask HQ to reopen it.` });
    return true;
  }
  return false;
}
