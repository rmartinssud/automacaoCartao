import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';

const data = new Uint8Array(fs.readFileSync('ANM__Livreto  Academicos  10 NOVEMBRO  DE 2025 (1).pdf'));
const doc = await pdfjs.getDocument({ data }).promise;

const page = await doc.getPage(49);
const tc = await page.getTextContent();

// Group by Y coordinate (same as buildLinesFromPdfTextItems in gerar-cartoes.ts)
const rows = new Map<number, Array<{ x: number; str: string }>>();
for (const item of tc.items as any[]) {
  const str = (item?.str ?? '').trim();
  if (!str) continue;
  const x = item.transform?.[4] ?? 0;
  const y = item.transform?.[5] ?? 0;
  const yKey = Math.round(y / 2) * 2;
  const row = rows.get(yKey) ?? [];
  row.push({ x, str });
  rows.set(yKey, row);
}

const ySorted = [...rows.keys()].sort((a, b) => b - a);
const lines = ySorted.map(y => {
  const row = rows.get(y) ?? [];
  row.sort((a, b) => a.x - b.x);
  return row.map(r => r.str).join(' ').replace(/\s+/g, ' ').trim();
}).filter(Boolean);

console.log('=== Lines from page 49 ===');
lines.forEach((l, i) => console.log(i, JSON.stringify(l)));

process.exit(0);
