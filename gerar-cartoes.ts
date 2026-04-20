import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

type Card = { title: string; body: string; headerText: string; footerText: string };

const defaultBodyText =
  "Tenho a honra de dirigir-me a Vossa Excelência para pedir vênia ao meu propósito de inscrição à vacância da Cadeira Número Dezessete, da Secção de Medicina, da Egrégia Academia Nacional de Medicina, patronímica de Carlos Pinto Seidl, ocupada pelo inesquecível Acadêmico Professor Dr. Omar da Rosa Santos, por quem sentíamos especial respeito e carinho.\n" +
  "A presença nas reuniões de quintas-feiras, durante os vários anos, muito serviu ao meu conhecimento médico e permitiu conhecer pessoalmente a todos, admirando cada um.\n" +
  "Ao inscrever-me para esse conclave prevaleceu meu espírito acadêmico, que sonha um dia poder equiparar-se à magnitude dos pares acadêmicos que formam o notável colegiado da Academia Nacional de Medicina.\n" +
  "Senhor Acadêmico, solicitarei em breve a Vossa Excelência a permissão de uma visita de apresentação.\n" +
  "Atenciosamente\n" +
  "Luiz Werber-Bandeira";

export type ProgressUpdate = { percent: number; message: string };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value: string) {
  return value.replaceAll("\\n", "\n").replaceAll("\\r", "\r");
}

function collectTextFields(node: unknown, pathPrefix = "$", out: Array<{ path: string; value: string }> = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectTextFields(item, `${pathPrefix}[${index}]`, out));
    return out;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const nextPath = `${pathPrefix}.${key}`;
      if (key === "text" && typeof value === "string") {
        out.push({ path: nextPath, value });
      }
      collectTextFields(value, nextPath, out);
    }
    return out;
  }
  return out;
}

function lastNonEmptyLine(value: string) {
  const lines = value
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

function extractUntilFirstComma(value: string) {
  const commaIndex = value.indexOf(",");
  if (commaIndex === -1) return value.trim();
  return value.slice(0, commaIndex).trim();
}

function isLikelyTitleWithName(value: string) {
  const normalized = normalizeText(value).trim();
  const upper = normalized.toUpperCase();

  if (!(upper.includes("EXMO") || upper.includes("EXMA"))) return false;
  if (!upper.includes("ACAD")) return false;
  if (!upper.includes("PROFESSOR")) return false;

  const candidate = extractPersonCandidate(normalized);
  if (!candidate) return false;
  if (isHeaderToken(candidate)) return false;
  if (/[0-9]/.test(candidate)) return false;
  if (candidate.split(/\s+/g).filter(Boolean).length < 2) return false;

  return true;
}

export type GenerateOptions = {
  inputPath: string;
  outputPath: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  titleFontSizePt: number;
  titleFontWeight: number | "normal" | "bold";
  titleFontStyle: "normal" | "italic";
  titleTextAlign: "left" | "center" | "right";
  bodyTextAlign: "left" | "center" | "right";
  bodyLineHeight: number;
  titleBodyGapMm: number;
  headerContentGapMm: number;
  headerEnabled: boolean;
  headerImageBoxWidthMm: number;
  headerImageBoxHeightMm: number;
  headerImageAlignX: "left" | "center" | "right";
  headerImageAlignY: "top" | "middle" | "bottom";
  headerLeftImageDataUrl: string;
  headerRightImageDataUrl: string;
  headerTextTemplate: string;
  headerTextAlign: "left" | "center" | "right";
  headerFontSizePt: number;
  headerFontWeight: number | "normal" | "bold";
  headerFontStyle: "normal" | "italic";
  headerLineHeight: number;
  footerContentGapMm: number;
  footerEnabled: boolean;
  footerImageBoxWidthMm: number;
  footerImageBoxHeightMm: number;
  footerImageAlignX: "left" | "center" | "right";
  footerImageAlignY: "top" | "middle" | "bottom";
  footerLeftImageDataUrl: string;
  footerRightImageDataUrl: string;
  footerTextTemplate: string;
  footerTextAlign: "left" | "center" | "right";
  footerFontSizePt: number;
  footerFontWeight: number | "normal" | "bold";
  footerFontStyle: "normal" | "italic";
  footerLineHeight: number;
  bodyTemplate: string;
  removals: string[];
  onlyName: boolean;
  includeTitle: boolean;
  standardizeTitleHeader: boolean;
  defaultGender?: "auto" | "masc" | "fem";
  forcedFemaleNames?: string[];
  forcedMaleNames?: string[];
  limit?: number;
};

type GenerateStats = {
  totalTitlesFound: number;
  uniqueCardsGenerated: number;
  duplicatesRemoved: number;
};

function normalizeKey(value: string) {
  return value
    .toUpperCase()
    .replaceAll(/[ \t]+/g, " ")
    .replaceAll(/\r?\n+/g, "\n")
    .trim();
}

function normalizePersonNameKey(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[\u00A0\u2007\u202F]/g, " ")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeUpperNoAccents(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isHeaderToken(value: string) {
  const u = normalizeUpperNoAccents(value).replaceAll(/\s+/g, " ").trim();
  if (!u) return true;
  if (/\d/.test(u)) return false;
  if (u.includes("EXMO") || u.includes("EXMA")) return true;
  if (u.includes("ACAD")) return true;
  if (u.includes("PROFESSOR")) return true;
  return false;
}

function extractPersonCandidate(value: string) {
  const lines = value
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const words = line.split(/\s+/g).filter(Boolean);
    if (words.length < 2) continue;
    if (/\d/.test(line)) continue;
    if (isHeaderToken(line)) continue;
    return line;
  }
  return lines.at(-1) ?? "";
}

function guessGenderFromName(name: string) {
  const first = (name.split(/\s+/g).filter(Boolean).at(0) ?? "").normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "").toUpperCase();
  const fems = new Set([
    "ANA",
    "MARIA",
    "FERNANDA",
    "JULIANA",
    "CAMILA",
    "ADRIANA",
    "PAULA",
    "PATRICIA",
    "ALINE",
    "ALICE",
    "BRUNA",
    "LUCIANA",
    "MONICA",
    "TATIANA",
    "ELISA",
    "SILVIA",
    "CARLA",
    "BEATRIZ",
  ]);
  if (fems.has(first)) return "fem" as const;
  if (first.endsWith("A")) return "fem" as const;
  return "masc" as const;
}

function decideGender(personName: string, title: string, options: Pick<GenerateOptions, "defaultGender" | "forcedFemaleNames" | "forcedMaleNames">) {
  const key = normalizePersonNameKey(personName);
  const listToKeys = (arr?: string[]) => new Set((arr ?? []).map((n) => normalizePersonNameKey(n)));
  const femSet = listToKeys(options.forcedFemaleNames);
  const mascSet = listToKeys(options.forcedMaleNames);
  if (femSet.has(key)) return "fem" as const;
  if (mascSet.has(key)) return "masc" as const;

  const upper = normalizeUpperNoAccents(title).replaceAll(/\s+/g, " ");
  if (/\bEXMA\b|\bACADEMICA\b|\bPROFESSORA\b|\bDOUTORA\b/.test(upper)) return "fem" as const;
  if (/\bEXMO\b|\bACADEMICO\b|\bPROFESSOR\b|\bDOUTOR\b/.test(upper)) return "masc" as const;

  if (options.defaultGender && options.defaultGender !== "auto") return options.defaultGender;
  return guessGenderFromName(personName);
}

function standardizeHeaderTitle(title: string, gender: "masc" | "fem") {
  const headerLine = gender === "fem" ? "EXMA. SENHORA ACADÊMICA" : "EXMO. SENHOR ACADÊMICO";
  const professorLine = gender === "fem" ? "PROFESSORA DOUTORA" : "PROFESSOR DOUTOR";

  const lines = title.split(/\r?\n/g);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    const u = normalizeUpperNoAccents(trimmed).replaceAll(/\s+/g, " ").trim();
    const hasHeader =
      u.includes("EXMO") || u.includes("EXMA") || u.includes("SENHOR") || u.includes("SENHORA") || u.includes("ACAD");
    const hasProfessor = u.includes("PROFESSOR") || u.includes("PROFESSORA") || u.includes("DOUTOR") || u.includes("DOUTORA");

    if (hasHeader && hasProfessor) {
      out.push(headerLine);
      out.push(professorLine);
      continue;
    }
    if (hasHeader) {
      out.push(headerLine);
      continue;
    }
    if (hasProfessor) {
      out.push(professorLine);
      continue;
    }

    out.push(line);
  }

  return out.join("\n").replaceAll(/\n{3,}/g, "\n\n");
}

function applyRemovals(value: string, removals: string[]) {
  let out = value;
  for (const removal of removals) {
    const r = removal.trim();
    if (!r) continue;
    out = out.replaceAll(r, "");
  }
  return out
    .replaceAll(/[ \t]+/g, " ")
    .replaceAll(/\r?\n[ \t]+/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function applyPlaceholders(template: string, title: string) {
  const name = lastNonEmptyLine(title);
  return template.replaceAll("{{titulo}}", title).replaceAll("{{nome}}", name);
}

function extractTitlesFromJson(parsed: unknown) {
  const texts = collectTextFields(parsed).map((t) => normalizeText(t.value));
  return texts.map(extractUntilFirstComma).filter(isLikelyTitleWithName);
}

type PdfTextItem = { str?: string; transform?: number[] };

function buildLinesFromPdfTextItems(items: PdfTextItem[]) {
  const rows = new Map<number, Array<{ x: number; str: string }>>();
  for (const item of items) {
    const str = (item?.str ?? "").trim();
    if (!str) continue;
    const transform = item?.transform;
    const x = Array.isArray(transform) && typeof transform[4] === "number" ? transform[4] : 0;
    const y = Array.isArray(transform) && typeof transform[5] === "number" ? transform[5] : 0;
    const yKey = Math.round(y / 2) * 2;
    const row = rows.get(yKey) ?? [];
    row.push({ x, str });
    rows.set(yKey, row);
  }

  const ySorted = [...rows.keys()].sort((a, b) => b - a);
  return ySorted
    .map((y) => {
      const row = rows.get(y) ?? [];
      row.sort((a, b) => a.x - b.x);
      return row
        .map((r) => r.str)
        .join(" ")
        .replaceAll(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean);
}

async function extractLinesFromPdf(inputPath: string, onProgress?: (percent: number, message: string) => void) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(inputPath));
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;

  const pagesLines: string[][] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = buildLinesFromPdfTextItems(textContent.items as PdfTextItem[]);
    pagesLines.push(lines);
    if (onProgress) {
      const percent = 2 + Math.round((pageNumber / Math.max(1, doc.numPages)) * 12);
      onProgress(percent, `Extrair texto do PDF (página ${pageNumber}/${doc.numPages})`);
    }
  }

  if (typeof (doc as any).destroy === "function") {
    await (doc as any).destroy();
  }

  return pagesLines;
}

function extractTitlesFromPdfLines(pagesLines: string[][]) {
  const titles: string[] = [];

  for (const lines of pagesLines) {
    for (let i = 0; i < lines.length; i++) {
      const u = normalizeUpperNoAccents(lines[i]);
      if (!(u.includes("EXMO") || u.includes("EXMA"))) continue;

      const window: string[] = [];
      for (let j = i; j < lines.length && window.length < 6; j++) {
        const line = lines[j].trim();
        if (!line) break;
        if (j > i && /\d/.test(line)) break;
        window.push(line);

        const candidate = extractUntilFirstComma(window.join("\n").trim());
        if (isLikelyTitleWithName(candidate)) {
          titles.push(candidate);
          i = j;
          break;
        }
      }
    }
  }

  return titles;
}

async function extractTitlesFromInput(inputPath: string, onProgress?: (percent: number, message: string) => void) {
  const ext = path.extname(inputPath).toLowerCase();

  if (ext === ".pdf") {
    onProgress?.(1, "Ler PDF e extrair texto");
    const pagesLines = await extractLinesFromPdf(inputPath, onProgress);
    onProgress?.(18, "Extrair títulos");
    return extractTitlesFromPdfLines(pagesLines);
  }

  onProgress?.(1, "Ler arquivo e processar dados");
  const raw = fs.readFileSync(inputPath, "utf8").trim();
  const parsed = JSON.parse(raw);
  onProgress?.(10, "Extrair títulos");
  return extractTitlesFromJson(parsed);
}

function buildCardsFromTitles(
  titles: string[],
  options: Pick<
    GenerateOptions,
    "bodyTemplate" | "onlyName" | "removals" | "headerTextTemplate" | "footerTextTemplate" | "standardizeTitleHeader" | "forcedFemaleNames" | "forcedMaleNames"
  >,
) {
  const cards: Card[] = [];
  const seenPerson = new Set<string>();
  const seenFallback = new Set<string>();
  let duplicatesRemoved = 0;

  for (const rawTitle of titles) {
    const removed = applyRemovals(rawTitle, options.removals);
    const personName = extractPersonCandidate(removed);
    const personKey = normalizePersonNameKey(personName);
    let title = options.onlyName ? personName : removed;
    if (!options.onlyName && options.standardizeTitleHeader) {
      const g = decideGender(personName, title, {
        defaultGender: "auto",
        forcedFemaleNames: options.forcedFemaleNames,
        forcedMaleNames: options.forcedMaleNames,
      });
      title = standardizeHeaderTitle(title, g);
    }
    const fallbackKey = normalizeKey(title);

    const keyToUse = personKey || fallbackKey;
    if (!keyToUse) continue;

    const seenSet = personKey ? seenPerson : seenFallback;
    if (seenSet.has(keyToUse)) {
      duplicatesRemoved++;
      continue;
    }
    seenSet.add(keyToUse);
    cards.push({
      title,
      body: applyPlaceholders(options.bodyTemplate, title),
      headerText: applyPlaceholders(options.headerTextTemplate, title),
      footerText: applyPlaceholders(options.footerTextTemplate, title),
    });
  }

  return { cards, duplicatesRemoved };
}

export async function generatePdf(options: GenerateOptions, onProgress?: (update: ProgressUpdate) => void) {
  const report = (percent: number, message: string) => {
    onProgress?.({ percent, message });
  };

  const toJustifyContent = (value: "left" | "center" | "right") => {
    if (value === "left") return "flex-start";
    if (value === "right") return "flex-end";
    return "center";
  };
  const toAlignItems = (value: "top" | "middle" | "bottom") => {
    if (value === "top") return "flex-start";
    if (value === "bottom") return "flex-end";
    return "center";
  };
  const boxSize = (mm: number) => (Number.isFinite(mm) && mm > 0 ? `${mm}mm` : "auto");
  const imgBoxStyle = (
    widthMm: number,
    heightMm: number,
    alignX: "left" | "center" | "right",
    alignY: "top" | "middle" | "bottom",
  ) =>
    `width:${boxSize(widthMm)};height:${boxSize(heightMm)};justify-content:${toJustifyContent(alignX)};align-items:${toAlignItems(
      alignY,
    )};`;

  const titles = await extractTitlesFromInput(options.inputPath, (percent, message) => report(percent, message));
  report(20, "Montar cartões");
  const built = buildCardsFromTitles(titles, options);

  if (built.cards.length === 0) {
    throw new Error("Não encontrar nenhum título com nome no arquivo de entrada.");
  }

  const sortedCards = [...built.cards].sort((a, b) => {
    const aName = normalizeText(lastNonEmptyLine(a.title)).trim();
    const bName = normalizeText(lastNonEmptyLine(b.title)).trim();
    const c = aName.localeCompare(bName, "pt-BR", { sensitivity: "base" });
    if (c !== 0) return c;
    return normalizeKey(a.title).localeCompare(normalizeKey(b.title), "pt-BR", { sensitivity: "base" });
  });

  const cards = options.limit === undefined ? sortedCards : sortedCards.slice(0, options.limit);
  const stats: GenerateStats = {
    totalTitlesFound: titles.length,
    uniqueCardsGenerated: cards.length,
    duplicatesRemoved: built.duplicatesRemoved,
  };

  report(35, "Montar HTML");
  const headerImgStyle = imgBoxStyle(
    options.headerImageBoxWidthMm,
    options.headerImageBoxHeightMm,
    options.headerImageAlignX,
    options.headerImageAlignY,
  );
  const footerImgStyle = imgBoxStyle(
    options.footerImageBoxWidthMm,
    options.footerImageBoxHeightMm,
    options.footerImageAlignX,
    options.footerImageAlignY,
  );
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${options.widthMm}mm ${options.heightMm}mm; margin: 0; }
    body { margin: 0; font-family: "Times New Roman", serif; }
    .page {
      page-break-after: always;
      box-sizing: border-box;
      width: ${options.widthMm}mm;
      height: ${options.heightMm}mm;
      padding: ${options.marginMm}mm;
      display: flex;
      flex-direction: column;
    }
    .header { flex: 0 0 auto; }
    .content {
      flex: 1 1 auto;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding-top: ${options.headerContentGapMm}mm;
      padding-bottom: ${options.footerContentGapMm}mm;
    }
    .footer { flex: 0 0 auto; margin-top: auto; }
    .title { text-align: ${options.titleTextAlign}; font-size: ${options.titleFontSizePt}pt; font-weight: ${options.titleFontWeight}; font-style: ${options.titleFontStyle}; white-space: pre-wrap; margin: 0 0 ${options.titleBodyGapMm}mm 0; }
    .body { text-align: ${options.bodyTextAlign}; font-size: 11pt; line-height: ${options.bodyLineHeight}; white-space: pre-wrap; }

    .hf { display: flex; align-items: stretch; gap: 4mm; width: 100%; box-sizing: border-box; }
    .hf .img-box { flex: 0 0 auto; display: flex; box-sizing: border-box; }
    .hf .img-box img { display: block; max-width: 100%; max-height: 100%; height: auto; width: auto; object-fit: contain; }
    .hf .text-wrap { flex: 1 1 auto; display: flex; align-items: center; }
    .hf .text { width: 100%; white-space: pre-wrap; }

    .header .text { text-align: ${options.headerTextAlign}; font-size: ${options.headerFontSizePt}pt; font-weight: ${options.headerFontWeight}; font-style: ${options.headerFontStyle}; line-height: ${options.headerLineHeight}; }
    .footer .text { text-align: ${options.footerTextAlign}; font-size: ${options.footerFontSizePt}pt; font-weight: ${options.footerFontWeight}; font-style: ${options.footerFontStyle}; line-height: ${options.footerLineHeight}; }
  </style>
</head>
<body>
${cards
  .map(
    (c) =>
      `<section class="page">${
        options.headerEnabled
          ? `<header class="header hf">${
              options.headerLeftImageDataUrl
                ? `<div class="img-box" style="${headerImgStyle}"><img src="${options.headerLeftImageDataUrl}" /></div>`
                : ""
            }<div class="text-wrap"><div class="text">${escapeHtml(c.headerText)}</div></div>${
              options.headerRightImageDataUrl
                ? `<div class="img-box" style="${headerImgStyle}"><img src="${options.headerRightImageDataUrl}" /></div>`
                : ""
            }</header>`
          : ""
      }<main class="content">${
        options.includeTitle ? `<div class="title">${escapeHtml(c.title)}</div>` : ""
      }<div class="body">${escapeHtml(c.body)}</div></main>${
        options.footerEnabled
          ? `<footer class="footer hf">${
              options.footerLeftImageDataUrl
                ? `<div class="img-box" style="${footerImgStyle}"><img src="${options.footerLeftImageDataUrl}" /></div>`
                : ""
            }<div class="text-wrap"><div class="text">${escapeHtml(c.footerText)}</div></div>${
              options.footerRightImageDataUrl
                ? `<div class="img-box" style="${footerImgStyle}"><img src="${options.footerRightImageDataUrl}" /></div>`
                : ""
            }</footer>`
          : ""
      }</section>`,
  )
  .join("\n")}
</body>
</html>`;

  report(55, "Abrir navegador para gerar PDF");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120_000);
  report(70, "Renderizar conteúdo");
  await page.setContent(html, { waitUntil: "domcontentloaded" });

  report(90, "Exportar PDF");
  await page.pdf({
    path: path.resolve(options.outputPath),
    printBackground: true,
    preferCSSPageSize: true,
  });

  report(98, "Finalizar");
  await browser.close();
  report(100, "Concluído");
  return { outputPath: path.resolve(options.outputPath), stats };
}

async function main() {
  const inputPath = process.argv[2] ?? "academia.txt";
  const outputPath = process.argv[3] ?? "cartoes.pdf";
  const limitArg = process.argv[4];
  const limit = limitArg === undefined ? undefined : Number(limitArg);

  const result = await generatePdf({
    inputPath,
    outputPath,
    widthMm: 156,
    heightMm: 110,
    marginMm: 8,
    titleFontSizePt: 14,
    titleFontWeight: 700,
    titleFontStyle: "normal",
    titleTextAlign: "left",
    bodyTextAlign: "left",
    bodyLineHeight: 1.25,
    titleBodyGapMm: 6,
    headerContentGapMm: 0,
    headerEnabled: false,
    headerImageBoxWidthMm: 0,
    headerImageBoxHeightMm: 0,
    headerImageAlignX: "center",
    headerImageAlignY: "middle",
    headerLeftImageDataUrl: "",
    headerRightImageDataUrl: "",
    headerTextTemplate: "",
    headerTextAlign: "center",
    headerFontSizePt: 10,
    headerFontWeight: "normal",
    headerFontStyle: "normal",
    headerLineHeight: 1.2,
    footerContentGapMm: 0,
    footerEnabled: false,
    footerImageBoxWidthMm: 0,
    footerImageBoxHeightMm: 0,
    footerImageAlignX: "center",
    footerImageAlignY: "middle",
    footerLeftImageDataUrl: "",
    footerRightImageDataUrl: "",
    footerTextTemplate: "",
    footerTextAlign: "center",
    footerFontSizePt: 10,
    footerFontWeight: "normal",
    footerFontStyle: "normal",
    footerLineHeight: 1.2,
    bodyTemplate: defaultBodyText,
    removals: [],
    onlyName: false,
    includeTitle: true,
    standardizeTitleHeader: false,
    defaultGender: "auto",
    forcedFemaleNames: [],
    forcedMaleNames: [],
    limit,
  });

  process.stdout.write(
    `PDF gerado em: ${result.outputPath} (${result.stats.uniqueCardsGenerated} cartões, ${result.stats.duplicatesRemoved} repetidos removidos)\n`,
  );
}

if (process.env.AUTOMACAO_CARTAO_NO_CLI !== "1") {
  main().catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
}
