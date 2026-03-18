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

  const lastLine = lastNonEmptyLine(normalized);
  if (!lastLine) return false;
  if (/[0-9]/.test(lastLine)) return false;
  if (lastLine.split(/\s+/g).filter(Boolean).length < 2) return false;

  return true;
}

type GenerateOptions = {
  inputPath: string;
  outputPath: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  titleFontSizePt: number;
  titleFontWeight: number | "normal" | "bold";
  titleFontStyle: "normal" | "italic";
  headerEnabled: boolean;
  headerLeftImageDataUrl: string;
  headerRightImageDataUrl: string;
  headerTextTemplate: string;
  headerTextAlign: "left" | "center" | "right";
  headerFontSizePt: number;
  headerFontWeight: number | "normal" | "bold";
  headerFontStyle: "normal" | "italic";
  headerLineHeight: number;
  footerEnabled: boolean;
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

function buildCardsFromTitles(
  titles: string[],
  options: Pick<
    GenerateOptions,
    "bodyTemplate" | "onlyName" | "removals" | "headerTextTemplate" | "footerTextTemplate"
  >,
) {
  const cards: Card[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  for (const rawTitle of titles) {
    const removed = applyRemovals(rawTitle, options.removals);
    const title = options.onlyName ? lastNonEmptyLine(removed) : removed;
    const key = normalizeKey(title);
    if (!key) continue;
    if (seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);
    cards.push({
      title,
      body: applyPlaceholders(options.bodyTemplate, title),
      headerText: applyPlaceholders(options.headerTextTemplate, title),
      footerText: applyPlaceholders(options.footerTextTemplate, title),
    });
  }

  return { cards, duplicatesRemoved };
}

export async function generatePdf(options: GenerateOptions) {
  const raw = fs.readFileSync(options.inputPath, "utf8").trim();
  const parsed = JSON.parse(raw);
  const titles = extractTitlesFromJson(parsed);
  const built = buildCardsFromTitles(titles, options);

  if (built.cards.length === 0) {
    throw new Error("Não encontrar nenhum valor de 'text' com título e nome no JSON.");
  }

  const cards = options.limit === undefined ? built.cards : built.cards.slice(0, options.limit);
  const stats: GenerateStats = {
    totalTitlesFound: titles.length,
    uniqueCardsGenerated: cards.length,
    duplicatesRemoved: built.duplicatesRemoved,
  };

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
    .header, .footer { flex: 0 0 auto; }
    .content { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: flex-start; }
    .title { font-size: ${options.titleFontSizePt}pt; font-weight: ${options.titleFontWeight}; font-style: ${options.titleFontStyle}; white-space: pre-wrap; margin: 0 0 6mm 0; }
    .body { font-size: 11pt; line-height: 1.25; white-space: pre-wrap; }

    .hf { display: flex; align-items: center; gap: 4mm; }
    .hf .img { display: block; max-height: ${options.heightMm}mm; max-width: 100%; height: auto; width: auto; }
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
              options.headerLeftImageDataUrl ? `<img class="img" src="${options.headerLeftImageDataUrl}" />` : ""
            }<div class="text-wrap"><div class="text">${escapeHtml(c.headerText)}</div></div>${
              options.headerRightImageDataUrl ? `<img class="img" src="${options.headerRightImageDataUrl}" />` : ""
            }</header>`
          : ""
      }<main class="content">${
        options.includeTitle ? `<div class="title">${escapeHtml(c.title)}</div>` : ""
      }<div class="body">${escapeHtml(c.body)}</div></main>${
        options.footerEnabled
          ? `<footer class="footer hf">${
              options.footerLeftImageDataUrl ? `<img class="img" src="${options.footerLeftImageDataUrl}" />` : ""
            }<div class="text-wrap"><div class="text">${escapeHtml(c.footerText)}</div></div>${
              options.footerRightImageDataUrl ? `<img class="img" src="${options.footerRightImageDataUrl}" />` : ""
            }</footer>`
          : ""
      }</section>`,
  )
  .join("\n")}
</body>
</html>`;

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });

  await page.pdf({
    path: path.resolve(options.outputPath),
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();
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
    headerEnabled: false,
    headerLeftImageDataUrl: "",
    headerRightImageDataUrl: "",
    headerTextTemplate: "",
    headerTextAlign: "center",
    headerFontSizePt: 10,
    headerFontWeight: "normal",
    headerFontStyle: "normal",
    headerLineHeight: 1.2,
    footerEnabled: false,
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
