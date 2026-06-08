import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extract(pdfPath: string) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  console.log('Pages:', doc.numPages);
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item: any) => (item as any).str).join(' ');
    if (strings.toLowerCase().includes('nilton')) {
      console.log('--- Page', i, '---');
      console.log(strings);
    }
  }
}

extract(path.resolve('ANM__Livreto  Academicos  10 NOVEMBRO  DE 2025.pdf')).catch(console.error);
