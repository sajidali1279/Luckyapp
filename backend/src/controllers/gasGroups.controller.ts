// Gas price groups (2026-11-20, admin Stores > Gas prices): HQ names groups of stores that always share a gas price ("Denison": #9 and
// #10), so a price is typed once for the group. Kept in app_config as JSON, no table. A store is in at most one group. The prices
// themselves are still saved store by store (PATCH /stores/:storeId/gas-prices), so every rule and notice there stays the same.
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';

export const GAS_GROUPS_KEY = 'GAS_PRICE_GROUPS';

export const gasGroupsSchema = z.object({
  groups: z.array(z.object({
    id: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1, 'Give each group a name.').max(40, 'Keep a group name under 40 characters.'),
    storeIds: z.array(z.string().min(1).max(64)).min(2, 'A group needs at least 2 stores.').max(100),
  })).max(30, 'At most 30 groups.'),
}).superRefine((v, ctx) => {
  const seen = new Map<string, string>();
  const names = new Set<string>();
  for (const g of v.groups) {
    const n = g.name.toLowerCase();
    if (names.has(n)) ctx.addIssue({ code: 'custom', message: `Two groups are called "${g.name}". Give each its own name.` });
    names.add(n);
    for (const s of new Set(g.storeIds)) {
      const other = seen.get(s);
      if (other) ctx.addIssue({ code: 'custom', message: `A store is in both "${other}" and "${g.name}". A store can be in one group only.` });
      seen.set(s, g.name);
    }
  }
});
export type GasGroup = z.infer<typeof gasGroupsSchema>['groups'][number];

/** The saved groups. Unreadable or missing: none. */
export async function loadGasGroups(): Promise<GasGroup[]> {
  const row = await prisma.appConfig.findUnique({ where: { key: GAS_GROUPS_KEY } });
  if (!row) return [];
  try {
    const parsed = gasGroupsSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data.groups : [];
  } catch {
    return [];
  }
}

/** GET /stores/gas-groups: the groups, with stores that no longer exist left out (a group left with fewer than 2 is dropped). */
export async function getGasGroups(_req: AuthRequest, res: Response) {
  const [groups, stores] = await Promise.all([loadGasGroups(), prisma.store.findMany({ select: { id: true } })]);
  const ids = new Set(stores.map((s) => s.id));
  const live = groups.map((g) => ({ ...g, storeIds: g.storeIds.filter((s) => ids.has(s)) })).filter((g) => g.storeIds.length >= 2);
  res.json({ success: true, data: { groups: live } });
}

/** PUT /stores/gas-groups { groups }: saves them all at once (audited). */
export async function putGasGroups(req: AuthRequest, res: Response) {
  const parsed = gasGroupsSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const next = parsed.data.groups.map((g) => ({ ...g, storeIds: [...new Set(g.storeIds)] }));
  const allIds = [...new Set(next.flatMap((g) => g.storeIds))];
  const stores = await prisma.store.findMany({ where: { id: { in: allIds } }, select: { id: true, name: true } });
  if (stores.length !== allIds.length) { res.status(400).json({ success: false, error: 'One of the stores does not exist any more. Reload the page and try again.' }); return; }
  const before = await loadGasGroups();
  const value = JSON.stringify({ groups: next });
  await prisma.appConfig.upsert({ where: { key: GAS_GROUPS_KEY }, create: { key: GAS_GROUPS_KEY, value }, update: { value } });
  const nameOf = new Map(stores.map((s) => [s.id, s.name]));
  const summary = next.length
    ? `Gas price groups: ${next.map((g) => `${g.name} (${g.storeIds.map((s) => nameOf.get(s) ?? s).join(', ')})`).join('; ')}`
    : 'Gas price groups: none';
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'GAS_GROUPS', entity: 'store', entityId: 'gas-groups',
    details: { summary, before, after: next }, storeId: null,
  });
  res.json({ success: true, data: { groups: next } });
}
