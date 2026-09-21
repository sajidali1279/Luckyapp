// What an account has done in the system, so "Delete" can be refused for anyone who has work on record.
//
// A staff member's sales, redemptions, ratings, reports, orders and print jobs are records other people and other numbers depend on
// (a customer's balance, a store's bill, a leaderboard). Deleting the account used to erase the sales it had granted and then, if the
// database refused the account itself, leave the account in place with the sales gone. Now an account with any work on record cannot be
// deleted, only deactivated, and the person is told why in one sentence.

import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export interface Footprint {
  sales: number;
  redemptions: number;
  ratings: number;
  dailyReports: number;
  itemRequests: number;
  orderLists: number;
  orderItems: number;
  printJobs: number;
  notices: number;
  jobOpenings: number;
}

const LABELS: { key: keyof Footprint; one: string; many: string }[] = [
  { key: 'sales', one: 'sale', many: 'sales' },
  { key: 'redemptions', one: 'redemption handled', many: 'redemptions handled' },
  { key: 'ratings', one: 'rating', many: 'ratings' },
  { key: 'dailyReports', one: 'daily report', many: 'daily reports' },
  { key: 'itemRequests', one: 'item request', many: 'item requests' },
  { key: 'orderLists', one: 'order list', many: 'order lists' },
  { key: 'orderItems', one: 'item added to an order list', many: 'items added to order lists' },
  { key: 'printJobs', one: 'label print', many: 'label prints' },
  { key: 'notices', one: 'notice', many: 'notices' },
  { key: 'jobOpenings', one: 'job posting', many: 'job postings' },
];

/** How much each kind of record points at this staff member (a customer's history is handled by anonymizing, not counted here). */
export async function staffFootprint(db: Db, userId: string): Promise<Footprint> {
  const [sales, credit, catalog, ratings, dailyReports, itemRequests, orderLists, orderItems, printJobs, notices, jobOpenings] = await Promise.all([
    db.pointsTransaction.count({ where: { grantedById: userId } }),
    db.creditRedemption.count({ where: { processedBy: userId } }),
    db.catalogRedemption.count({ where: { processedById: userId } }),
    db.employeeRating.count({ where: { employeeId: userId } }),
    db.dailyReport.count({ where: { submittedById: userId } }),
    db.employeeItemRequest.count({ where: { submittedById: userId } }),
    db.orderList.count({ where: { openedById: userId } }),
    db.orderListItem.count({ where: { addedById: userId } }),
    db.printJob.count({ where: { printedById: userId } }),
    db.adminNotice.count({ where: { createdById: userId } }),
    db.jobOpening.count({ where: { createdById: userId } }),
  ]);
  return { sales, redemptions: credit + catalog, ratings, dailyReports, itemRequests, orderLists, orderItems, printJobs, notices, jobOpenings };
}

export const footprintTotal = (f: Footprint) => Object.values(f).reduce((a, b) => a + b, 0);

/** "240 sales, 4 daily reports and 16 item requests" (the three largest, in plain words). */
export function footprintText(f: Footprint): string {
  const parts = LABELS.filter((l) => f[l.key] > 0)
    .sort((a, b) => f[b.key] - f[a.key])
    .slice(0, 3)
    .map((l) => `${f[l.key].toLocaleString('en-US')} ${f[l.key] === 1 ? l.one : l.many}`);
  if (parts.length === 0) return '';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The sentence that refuses a delete. */
export function cannotDeleteMessage(name: string | null, f: Footprint): string {
  const who = name?.trim() || 'This person';
  return `${who} has work on record (${footprintText(f)}), so the account can only be deactivated. Deactivating stops them signing in and keeps every record.`;
}
