import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
import path from 'node:path';

async function extractPage(pdfPath: string, pageNum: number) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  console.log('Total pages:', doc.numPages);
  const page = await doc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const strings = textContent.items.map(item => (item as any).str).join(' ');
  console.log('--- Page', pageNum, '---');
  console.log(strings);
}

const pdfPath = path.resolve('ANM__Livreto  Academicos  10 NOVEMBRO  DE 2025 (1).pdf');
extractPage(pdfPath, 49).catch(console.error);
