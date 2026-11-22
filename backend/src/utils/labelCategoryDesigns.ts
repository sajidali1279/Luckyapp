// A default label design per category (2026-11-21, admin Labels > Designs > Category defaults). Kept in app_config as JSON
// { "<category, lower case>": "<design id>" }. An item "follows" its category when it has no design of its own: it is on the standard
// built-in look (Classic, no HQ design), or on the design its category gave it. Items given another design by hand keep it.
import { LabelTemplate } from '@prisma/client';
import prisma from '../config/prisma';

export const CATEGORY_DESIGNS_KEY = 'LABEL_CATEGORY_DESIGNS';

export const categoryKey = (c: string | null | undefined) => (c ?? '').trim().toLowerCase();

export async function loadCategoryDesigns(): Promise<Record<string, string>> {
  const row = await prisma.appConfig.findUnique({ where: { key: CATEGORY_DESIGNS_KEY } });
  if (!row) return {};
  try {
    const v = JSON.parse(row.value);
    return v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).filter(([k, d]) => k && typeof d === 'string')) as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

export async function saveCategoryDesigns(map: Record<string, string>) {
  const value = JSON.stringify(map);
  await prisma.appConfig.upsert({ where: { key: CATEGORY_DESIGNS_KEY }, create: { key: CATEGORY_DESIGNS_KEY, value }, update: { value } });
}

/** Whether an item takes its category's design: no design of its own (standard look), or exactly what its category gave it. */
export function followsCategory(label: { template: LabelTemplate | string; designId: string | null }, categoryDesign: string | null | undefined): boolean {
  if (!label.designId) return label.template === LabelTemplate.CLASSIC_RED_BLACK;
  return !!categoryDesign && label.designId === categoryDesign;
}
