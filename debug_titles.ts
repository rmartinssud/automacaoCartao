// Quick test: extract titles from PDF and check if MILTON is present
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

function normalizeUpperNoAccents(value: string) {
  return value.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "").toUpperCase();
}

const NAME_STOP_WORDS = new Set([
  "SECÇÃO", "SEÇÃO", "CIRURGIA", "MEDICINA", "ORTOPEDIA", "PEDIATRIA",
  "NASC", "NASC.", "NASCIMENTO", "RESIDÊNCIA", "RESIDENCIA",
  "AV", "AV.", "RUA", "AVENIDA", "ESTRADA", "TRAVESSA", "RODOVIA",
  "TEL", "TEL.", "TELEFONE", "CEL", "CEL.", "FAX",
  "E-MAIL", "EMAIL", "PATRONO", "ANTECESSOR", "SAUDADO",
  "SOB", "PRESIDÊNCIA", "PRESIDENCIA", "CAD", "NÚMERO", "NUMERO",
]);

function isLikelyPersonName(name: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (/\d/.test(name)) return false;
  if (name.includes('@') || name.includes('http')) return false;
  if (!words.every(w => /^[A-Za-záâãàéêíóôõúçñÁÂÃÀÉÊÍÓÔÕÚÇÑ]+$/.test(w))) return false;
  const upper = normalizeUpperNoAccents(name);
  for (const sw of NAME_STOP_WORDS) {
    if (upper.includes(sw)) return false;
  }
  return true;
}

const data = new Uint8Array(fs.readFileSync('ANM__Livreto  Academicos  10 NOVEMBRO  DE 2025 (1).pdf'));
const doc = await pdfjs.getDocument({ data }).promise;

const allTitles: string[] = [];

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items as any[];

  const rows = new Map<number, Array<{ x: number; str: string }>>();
  for (const item of items) {
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

  // Path 2: all-caps name line
  for (const line of lines) {
    if (/^[A-ZÁÂÃÀÉÊÍÓÔÕÚÇÑ][A-ZÁÂÃÀÉÊÍÓÔÕÚÇÑ\s]+$/.test(line)) {
      if (isLikelyPersonName(line)) {
        allTitles.push(line);
      }
    }
  }
}

console.log(`Total all-caps name lines found: ${allTitles.length}`);
const miltonFound = allTitles.some(t => t.toLowerCase().includes('milton'));
console.log('MILTON found:', miltonFound);
if (miltonFound) {
  console.log('Entry:', allTitles.find(t => t.toLowerCase().includes('milton')));
}

// Show a sample
console.log('\nSample entries:');
allTitles.slice(0, 20).forEach(t => console.log(' ', t));

process.exit(0);
