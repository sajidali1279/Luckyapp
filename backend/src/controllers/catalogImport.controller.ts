import { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { AuthRequest } from '../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT = `This is a page from a wholesale/distributor product catalog book.
Extract every product visible on this page.

For each product return:
- name: the full product name exactly as printed (e.g. "FIJI WATER LITER", "SAN PELLEGRINO 500ML PET", "PATHWATER ALKALINE PH9.5+")
- barcode: the numeric code printed beside or beneath the barcode lines — digits only (e.g. "35121770"). Use null if not visible or not present.
- category: infer from the product type (e.g. "Water", "Snacks", "Dairy", "Beverages", "Frozen Foods", "Hot Foods", "Tobacco / Vapes")

The page may have rotated text — read it regardless of orientation.
Return ONLY a valid JSON array, no explanation, no markdown fences:
[{"name":"...","barcode":"...","category":"..."},...]`;

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export async function extractFromPhoto(req: AuthRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No image provided' });
    return;
  }

  const base64 = req.file.buffer.toString('base64');
  const mediaType = (req.file.mimetype || 'image/jpeg') as MediaType;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text',  text: PROMPT },
        ],
      }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Extract JSON array — handles any leading/trailing text the model might add
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      res.status(422).json({ success: false, error: 'No products found in image' });
      return;
    }

    let items: { name: string; barcode: string | null; category: string | null }[] = [];
    try {
      items = JSON.parse(match[0]);
    } catch {
      res.status(422).json({ success: false, error: 'Could not parse product list' });
      return;
    }

    // Clean and validate
    items = items
      .filter(item => typeof item.name === 'string' && item.name.trim())
      .map(item => ({
        name:     item.name.trim(),
        barcode:  typeof item.barcode === 'string' && item.barcode.trim() ? item.barcode.trim() : null,
        category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null,
      }));

    res.json({ success: true, data: { items, count: items.length } });

  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY not set on server — add it in Render environment variables' });
    } else {
      console.error('[catalogImport]', err?.message || err);
      res.status(500).json({ success: false, error: err?.message || 'Image processing failed' });
    }
  }
}
