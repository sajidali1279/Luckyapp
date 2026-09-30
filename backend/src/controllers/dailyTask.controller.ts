import { Request, Response } from 'express';
import { ShiftType, Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';

// A task's fields, checked, so a mistake gets a sentence instead of "Failed to create task" (a 500)
const SHIFTS: ShiftType[] = ['OPENING', 'MIDDLE', 'CLOSING'];
function taskProblem(b: Record<string, unknown>, creating: boolean): string | null {
  if ((creating || b.shift !== undefined) && !SHIFTS.includes(b.shift as ShiftType)) return 'Pick the shift: Opening, Middle or Closing.';
  if (creating || b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim()) return 'Enter the task.';
    if (b.title.trim().length > 80) return 'Keep the task under 80 characters.';
  }
  if (b.description !== undefined && b.description !== null && (typeof b.description !== 'string' || b.description.trim().length > 500)) return 'Keep the details under 500 characters.';
  if (b.sortOrder !== undefined && (!Number.isInteger(b.sortOrder) || (b.sortOrder as number) < 0 || (b.sortOrder as number) > 999)) return 'The order must be a whole number from 0 to 999.';
  if (b.isActive !== undefined && typeof b.isActive !== 'boolean') return 'On or off must be true or false.';
  return null;
}

const DEFAULT_TASKS: { shift: ShiftType; title: string; description: string; sortOrder: number }[] = [
  // ── Opening (Morning Shift) ──
  { shift: 'OPENING', title: 'Open Store', description: 'Unlock doors, turn on lights, check signage, verify lottery machines are on, and turn on POS systems.', sortOrder: 1 },
  { shift: 'OPENING', title: 'Refrigeration & Bathrooms', description: 'Verify refrigeration temperatures, inspect bathrooms, and sweep the entrance to maintain cleanliness.', sortOrder: 2 },
  { shift: 'OPENING', title: 'Exterior', description: 'Sweep the parking lot, check fuel dispensers for hazards, refill windshield washer fluids, and make sure the squeegee is in great shape — replace it if not.', sortOrder: 3 },
  { shift: 'OPENING', title: 'Perimeter', description: 'Clear trash from exterior bins and sweep the entryway.', sortOrder: 4 },
  { shift: 'OPENING', title: 'Coffee & Fountain', description: 'Brew fresh coffee, wipe down condiment stations, restock cups/lids/straws, and check for expired products.', sortOrder: 5 },
  { shift: 'OPENING', title: 'Food Service', description: 'Turn on hot dog rollers, warmers, and breakfast ovens. Wash utensils and lay out fresh foil liners.', sortOrder: 6 },
  { shift: 'OPENING', title: 'Restrooms', description: 'Restock paper towels, toilet paper, and soap. Do a quick wipe-down of mirrors and sinks.', sortOrder: 7 },

  // ── Midday (Afternoon Shift) ──
  { shift: 'MIDDLE', title: 'Restrooms', description: 'Restock paper towels, toilet paper, and soap. Do a quick wipe-down of mirrors and sinks.', sortOrder: 1 },
  { shift: 'MIDDLE', title: 'Spills & Floors', description: 'Mop up wet spots and sweep high-traffic areas.', sortOrder: 2 },
  { shift: 'MIDDLE', title: 'Cooler Management', description: 'Face products on the shelves and check for any out-of-stock items.', sortOrder: 3 },
  { shift: 'MIDDLE', title: 'Cash Drops', description: 'Drop big bills immediately when cash drawer is over $500.00.', sortOrder: 4 },
  { shift: 'MIDDLE', title: 'Shelves', description: 'Restock shelves and face products to ensure attractive displays.', sortOrder: 5 },
  { shift: 'MIDDLE', title: 'Ice', description: 'Make sure bags of ice are stocked and the ice machine is full.', sortOrder: 6 },
  { shift: 'MIDDLE', title: 'Clean', description: 'Wipe all counters and tables down.', sortOrder: 7 },
  { shift: 'MIDDLE', title: 'Coffee & Fountain', description: 'Brew fresh coffee, wipe down condiment stations, restock cups/lids/straws, and check for expired products.', sortOrder: 8 },
  { shift: 'MIDDLE', title: 'Exterior', description: 'Sweep the parking lot, check fuel dispensers for hazards, take out the trash, degree the pumps, refill windshield washer fluids, and make sure the squeegee is in great shape.', sortOrder: 9 },
  { shift: 'MIDDLE', title: 'Food Service', description: 'Rotate hot foods and replace expired items. Sanitize prep surfaces regularly. Wash utensils, record food temperatures, and refill ice bins.', sortOrder: 10 },

  // ── Closing (Night Shift) ──
  { shift: 'CLOSING', title: 'Food Service Tear-down', description: 'Clean hot-hold units, sanitize prep surfaces, and empty/clean coffee machines and drip trays.', sortOrder: 1 },
  { shift: 'CLOSING', title: 'Trash & Sanitization', description: 'Empty all indoor trash cans and wipe down self-serve beverage machines.', sortOrder: 2 },
  { shift: 'CLOSING', title: 'Floors', description: 'Sweep and mop all retail and food-prep floors using a degreaser.', sortOrder: 3 },
  { shift: 'CLOSING', title: 'Stocking', description: 'Restock shelves, coolers, and freezers so the store is ready for the morning.', sortOrder: 4 },
  { shift: 'CLOSING', title: 'Cash & End of Day', description: 'Reconcile the day\'s safe drops and cash drawers, secure security gates, and lock exterior doors. Complete end of day paperwork. Count registers, lock coolers and storage areas, and clean coffee machines.', sortOrder: 5 },
  { shift: 'CLOSING', title: 'Secure Store', description: 'Set the alarm system and lock all doors to secure the store at closing.', sortOrder: 6 },
];

// GET /daily-tasks?storeId=xxx  — mobile: returns global + store-specific tasks
export async function getTasks(req: Request, res: Response) {
  try {
    const { storeId } = req.query;
    // A store that runs 2 shifts has no middle shift: its staff are not shown Middle tasks (copy the ones it needs into its Opening
    // or Closing list from the admin Daily Tasks page)
    const twoShifts = storeId
      ? (await prisma.store.findUnique({ where: { id: storeId as string }, select: { shiftsPerDay: true } }))?.shiftsPerDay === 2
      : false;
    const tasks = await prisma.dailyTask.findMany({
      where: {
        isActive: true,
        ...(twoShifts ? { shift: { not: ShiftType.MIDDLE } } : {}),
        OR: [
          { storeId: null },
          ...(storeId ? [{ storeId: storeId as string }] : []),
        ],
      },
      orderBy: [{ shift: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, shift: true, title: true, description: true, storeId: true, sortOrder: true },
    });
    res.json({ data: tasks });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
}

// GET /admin/daily-tasks?storeId=xxx|global  — admin panel
export async function adminGetTasks(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const { storeId } = req.query;

    // A Store Manager (below SuperAdmin) can only ever see chain-wide tasks
    // plus their own store(s)' — ignore any other storeId they pass. Uses
    // the manager's FULL store list, not just the first one, so a manager
    // assigned to more than one store sees all of them.
    if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
      const ownStoreIds: string[] = (user as any).storeIds || [];
      const tasks = await prisma.dailyTask.findMany({
        where: { OR: [{ storeId: null }, ...(ownStoreIds.length ? [{ storeId: { in: ownStoreIds } }] : [])] },
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ shift: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      res.json({ data: tasks });
      return;
    }

    const tasks = await prisma.dailyTask.findMany({
      where: storeId === 'global'
        ? { storeId: null }
        : storeId
          ? { storeId: storeId as string }
          : {},
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ shift: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ data: tasks });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
}

// POST /admin/daily-tasks
/** The reason a Middle task cannot go on this store's list, or null. */
async function middleRefusal(storeId: string | null, shift: unknown): Promise<string | null> {
  if (shift !== ShiftType.MIDDLE || !storeId) return null;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, shiftsPerDay: true } });
  return store?.shiftsPerDay === 2 ? `${store.name} runs 2 shifts, so it has no Middle shift. Pick Opening or Closing.` : null;
}

export async function createTask(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const { shift, title, description, sortOrder } = req.body;
    const problem = taskProblem(req.body, true);
    if (problem) return res.status(400).json({ success: false, error: problem });

    // A Store Manager can only ever create a task scoped to one of their own
    // stores — never chain-wide, and never a store they're not assigned to.
    // Honors a requested storeId if it's genuinely theirs (a manager with
    // more than one store picks which); otherwise falls back to their first.
    let storeId: string | null = req.body.storeId || null;
    if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
      const ownStoreIds: string[] = (user as any).storeIds || [];
      const requested = req.body.storeId as string | undefined;
      const ownStoreId = requested && ownStoreIds.includes(requested) ? requested : ownStoreIds[0];
      if (!ownStoreId) return res.status(400).json({ error: 'No store assigned to your account' });
      storeId = ownStoreId;
    } else if (storeId && !(await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }))) {
      return res.status(400).json({ success: false, error: 'That store does not exist.' });
    }

    const noMiddle = await middleRefusal(storeId, shift);
    if (noMiddle) return res.status(400).json({ success: false, error: noMiddle });

    const task = await prisma.dailyTask.create({
      data: { shift, title: title.trim(), description: description?.trim() || null, storeId, sortOrder: sortOrder ?? 0 },
      include: { store: { select: { id: true, name: true } } },
    });
    res.status(201).json({ data: task });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create task' });
  }
}

// PATCH /admin/daily-tasks/:id
export async function updateTask(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const { id } = req.params;
    const isAdmin = hasMinRole(user.role, Role.SUPER_ADMIN);
    const problem = taskProblem(req.body, false);
    if (problem) return res.status(400).json({ success: false, error: problem });

    const existing = await prisma.dailyTask.findUnique({ where: { id }, select: { storeId: true, shift: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'That task does not exist.' });
    if (isAdmin && req.body.storeId && !(await prisma.store.findUnique({ where: { id: req.body.storeId }, select: { id: true } }))) {
      return res.status(400).json({ success: false, error: 'That store does not exist.' });
    }
    if (!isAdmin) {
      const ownStoreIds: string[] = (user as any).storeIds || [];
      if (existing.storeId === null || !ownStoreIds.includes(existing.storeId)) {
        return res.status(403).json({ error: 'You can only edit your own store\'s tasks' });
      }
    }

    const { shift, title, description, storeId, sortOrder, isActive } = req.body;
    const nextStore = isAdmin && storeId !== undefined ? (storeId || null) : existing.storeId;
    const noMiddle = await middleRefusal(nextStore, shift ?? existing.shift);
    if (noMiddle) return res.status(400).json({ success: false, error: noMiddle });
    const task = await prisma.dailyTask.update({
      where: { id },
      data: {
        ...(shift && { shift }),
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        // A Store Manager can't reassign a task away from their own store.
        ...(isAdmin && storeId !== undefined && { storeId: storeId || null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { store: { select: { id: true, name: true } } },
    });
    res.json({ data: task });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update task' });
  }
}

// POST /admin/daily-tasks/copy-middle  { storeId, to: 'OPENING' | 'CLOSING' }
// A 2-shift store has no middle shift, so the chain's Middle duties (restrooms, cash drops, ice...) would go undone there. This copies them
// into the store's own Opening or Closing list in one go, skipping any the store already has (same title on that shift).
export async function copyMiddleTasks(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const { storeId, to } = req.body ?? {};
    if (to !== ShiftType.OPENING && to !== ShiftType.CLOSING) return res.status(400).json({ success: false, error: 'Pick Opening or Closing.' });
    if (typeof storeId !== 'string' || !storeId) return res.status(400).json({ success: false, error: 'Pick the store.' });
    if (!hasMinRole(user.role, Role.SUPER_ADMIN) && !((user as any).storeIds || []).includes(storeId)) {
      return res.status(403).json({ success: false, error: "You can only change your own store's tasks" });
    }
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
    if (!store) return res.status(404).json({ success: false, error: 'That store does not exist.' });

    const [middle, already] = await Promise.all([
      prisma.dailyTask.findMany({ where: { storeId: null, shift: ShiftType.MIDDLE, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      prisma.dailyTask.findMany({ where: { storeId, shift: to }, select: { title: true, sortOrder: true } }),
    ]);
    const have = new Set(already.map((t) => t.title.trim().toLowerCase()));
    const start = already.reduce((m, t) => Math.max(m, t.sortOrder), 0);
    const add = middle.filter((t) => !have.has(t.title.trim().toLowerCase()));
    if (add.length) {
      await prisma.dailyTask.createMany({
        data: add.map((t, i) => ({ shift: to, title: t.title, description: t.description, storeId, sortOrder: Math.min(999, start + i + 1) })),
      });
    }
    res.json({ success: true, data: { added: add.length, skipped: middle.length - add.length, store: store.name } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Could not copy the tasks' });
  }
}

// DELETE /admin/daily-tasks/:id
export async function deleteTask(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const { id } = req.params;

    const existing = await prisma.dailyTask.findUnique({ where: { id }, select: { storeId: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'That task does not exist.' });
    if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
      const ownStoreIds: string[] = (user as any).storeIds || [];
      if (existing.storeId === null || !ownStoreIds.includes(existing.storeId)) {
        return res.status(403).json({ error: 'You can only delete your own store\'s tasks' });
      }
    }

    await prisma.dailyTask.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
}

// POST /admin/daily-tasks/seed-defaults  — one-time seed of the standard checklists
export async function seedDefaultTasks(req: Request, res: Response) {
  try {
    const existing = await prisma.dailyTask.count({ where: { storeId: null } });
    if (existing > 0) return res.status(409).json({ error: 'Default tasks already exist. Delete them first if you want to re-seed.' });
    await prisma.dailyTask.createMany({ data: DEFAULT_TASKS });
    res.status(201).json({ message: `Seeded ${DEFAULT_TASKS.length} default tasks` });
  } catch (e) {
    res.status(500).json({ error: 'Seed failed' });
  }
}
