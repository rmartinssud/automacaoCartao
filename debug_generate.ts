import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
import { generatePdf } from './gerar-cartoes.js';

async function run() {
  const result = await generatePdf({
    inputPath: 'ANM__Livreto  Academicos  10 NOVEMBRO  DE 2025 (1).pdf',
    outputPath: 'debug_output.pdf',
    widthMm: 156, heightMm: 110, marginMm: 8,
    titleFontSizePt: 14, titleFontWeight: 'bold', titleFontStyle: 'normal',
    titleTextAlign: 'left', bodyTextAlign: 'left', bodyLineHeight: 1.25,
    titleBodyGapMm: 6, headerContentGapMm: 0, headerEnabled: false,
    headerImageBoxWidthMm: 0, headerImageBoxHeightMm: 0,
    headerImageAlignX: 'center', headerImageAlignY: 'middle',
    headerLeftImageDataUrl: '', headerRightImageDataUrl: '',
    headerTextTemplate: '', headerTextAlign: 'center',
    headerFontSizePt: 10, headerFontWeight: 'normal', headerFontStyle: 'normal',
    headerLineHeight: 1.2, footerContentGapMm: 0, footerEnabled: false,
    footerImageBoxWidthMm: 0, footerImageBoxHeightMm: 0,
    footerImageAlignX: 'center', footerImageAlignY: 'middle',
    footerLeftImageDataUrl: '', footerRightImageDataUrl: '',
    footerTextTemplate: '', footerTextAlign: 'center',
    footerFontSizePt: 10, footerFontWeight: 'normal', footerFontStyle: 'normal',
    footerLineHeight: 1.2, bodyTemplate: 'Primeiro paragrafo do corpo.\n{{imagem}}\nSegundo paragrafo do corpo que contorna a imagem.',
    removals: ["EXMO. SENHOR ACADÊMICO", "PROFESSOR DOUTOR"],
    onlyName: false, includeTitle: true, standardizeTitleHeader: false,
    defaultGender: 'auto', forcedFemaleNames: [], forcedMaleNames: [],
    limit: 1,
    bodyImageEnabled: true,
    bodyImageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    bodyImageWidth: "300px",
    bodyImageHeight: "147px",
    bodyImagePosition: "float-right",
    bodyImageMarginMm: 5
  }, (p) => console.log(p));
  console.log('Result:', result.stats);
}
run();
