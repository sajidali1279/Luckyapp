import { Request, Response } from 'express';
import { ShiftType } from '@prisma/client';
import prisma from '../config/prisma';

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
    const tasks = await prisma.dailyTask.findMany({
      where: {
        isActive: true,
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
export async function adminGetTasks(req: Request, res: Response) {
  try {
    const { storeId } = req.query;
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
export async function createTask(req: Request, res: Response) {
  try {
    const { shift, title, description, storeId, sortOrder } = req.body;
    if (!shift || !title) return res.status(400).json({ error: 'shift and title are required' });
    const task = await prisma.dailyTask.create({
      data: { shift, title: title.trim(), description: description?.trim() || null, storeId: storeId || null, sortOrder: sortOrder ?? 0 },
      include: { store: { select: { id: true, name: true } } },
    });
    res.status(201).json({ data: task });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create task' });
  }
}

// PATCH /admin/daily-tasks/:id
export async function updateTask(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { shift, title, description, storeId, sortOrder, isActive } = req.body;
    const task = await prisma.dailyTask.update({
      where: { id },
      data: {
        ...(shift && { shift }),
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(storeId !== undefined && { storeId: storeId || null }),
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

// DELETE /admin/daily-tasks/:id
export async function deleteTask(req: Request, res: Response) {
  try {
    await prisma.dailyTask.delete({ where: { id: req.params.id } });
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
