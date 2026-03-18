import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { generatePdf as generatePdfType } from "./gerar-cartoes.js";

type GenerateRequest = {
  inputFile: string;
  outputFile: string;
  widthMm?: number;
  heightMm?: number;
  marginMm?: number;
  titleFontSizePt?: number;
  titleFontStyle?: "normal" | "bold" | "italic" | "bold_italic";
  headerEnabled?: boolean;
  headerLeftImageDataUrl?: string;
  headerRightImageDataUrl?: string;
  headerTextTemplate?: string;
  headerTextAlign?: "left" | "center" | "right";
  headerFontSizePt?: number;
  headerFontStyle?: "normal" | "bold" | "italic" | "bold_italic";
  headerLineHeight?: number;
  footerEnabled?: boolean;
  footerLeftImageDataUrl?: string;
  footerRightImageDataUrl?: string;
  footerTextTemplate?: string;
  footerTextAlign?: "left" | "center" | "right";
  footerFontSizePt?: number;
  footerFontStyle?: "normal" | "bold" | "italic" | "bold_italic";
  footerLineHeight?: number;
  preset?: "cartao" | "a4";
  bodyTemplate: string;
  removals: string[];
  onlyName: boolean;
  includeTitle: boolean;
};

function isSimpleFileName(value: string) {
  return /^[a-zA-Z0-9._ -]+$/.test(value) && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}

function listTxtFiles(rootDir: string) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((n) => n.toLowerCase().endsWith(".txt"))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

let generatePdf: typeof generatePdfType | undefined;
async function getGeneratePdf() {
  if (generatePdf) return generatePdf;
  process.env.AUTOMACAO_CARTAO_NO_CLI = "1";
  const mod = await import("./gerar-cartoes.js");
  generatePdf = mod.generatePdf;
  return generatePdf;
}

async function main() {
  const app = express();
  const rootDir = process.cwd();

  app.use(express.json({ limit: "25mb" }));

  app.get("/", (_req, res) => {
    res.sendFile(path.resolve(rootDir, "ui.html"));
  });

  app.get("/api/inputs", (_req, res) => {
    res.json({ files: listTxtFiles(rootDir) });
  });

  app.post("/api/generate", async (req, res) => {
    try {
      const payload = req.body as GenerateRequest;

      if (!payload || typeof payload !== "object") {
        res.status(400).json({ error: "Payload inválido." });
        return;
      }

      if (!isSimpleFileName(payload.inputFile) || !payload.inputFile.toLowerCase().endsWith(".txt")) {
        res.status(400).json({ error: "Arquivo de entrada inválido." });
        return;
      }

      if (!isSimpleFileName(payload.outputFile) || !payload.outputFile.toLowerCase().endsWith(".pdf")) {
        res.status(400).json({ error: "Arquivo de saída inválido." });
        return;
      }

      const inputPath = path.resolve(rootDir, payload.inputFile);
      if (!fs.existsSync(inputPath)) {
        res.status(400).json({ error: "Arquivo de entrada não existir." });
        return;
      }

      const preset = payload.preset ?? "cartao";
      const widthMm = payload.widthMm ?? (preset === "a4" ? 210 : 156);
      const heightMm = payload.heightMm ?? (preset === "a4" ? 297 : 110);
      const marginMm = payload.marginMm ?? (preset === "a4" ? 20 : 8);

      const outputPath = path.resolve(rootDir, payload.outputFile);

      const titleFontSizePtRaw = payload.titleFontSizePt ?? 14;
      const titleFontSizePt =
        Number.isFinite(titleFontSizePtRaw) && titleFontSizePtRaw >= 6 && titleFontSizePtRaw <= 72
          ? titleFontSizePtRaw
          : 14;

      const titleFontStyle = payload.titleFontStyle ?? "bold";
      const titleFontWeight = titleFontStyle === "bold" || titleFontStyle === "bold_italic" ? 700 : "normal";
      const titleFontStyleCss = titleFontStyle === "italic" || titleFontStyle === "bold_italic" ? "italic" : "normal";

      const headerEnabled = Boolean(payload.headerEnabled);
      const footerEnabled = Boolean(payload.footerEnabled);

      const headerTextAlign = payload.headerTextAlign ?? "center";
      const footerTextAlign = payload.footerTextAlign ?? "center";

      const headerFontSizePtRaw = payload.headerFontSizePt ?? 10;
      const headerFontSizePt =
        Number.isFinite(headerFontSizePtRaw) && headerFontSizePtRaw >= 6 && headerFontSizePtRaw <= 72
          ? headerFontSizePtRaw
          : 10;

      const footerFontSizePtRaw = payload.footerFontSizePt ?? 10;
      const footerFontSizePt =
        Number.isFinite(footerFontSizePtRaw) && footerFontSizePtRaw >= 6 && footerFontSizePtRaw <= 72
          ? footerFontSizePtRaw
          : 10;

      const headerLineHeightRaw = payload.headerLineHeight ?? 1.2;
      const headerLineHeight =
        Number.isFinite(headerLineHeightRaw) && headerLineHeightRaw >= 0.8 && headerLineHeightRaw <= 3
          ? headerLineHeightRaw
          : 1.2;

      const footerLineHeightRaw = payload.footerLineHeight ?? 1.2;
      const footerLineHeight =
        Number.isFinite(footerLineHeightRaw) && footerLineHeightRaw >= 0.8 && footerLineHeightRaw <= 3
          ? footerLineHeightRaw
          : 1.2;

      const headerFontStyle = payload.headerFontStyle ?? "normal";
      const headerFontWeight = headerFontStyle === "bold" || headerFontStyle === "bold_italic" ? 700 : "normal";
      const headerFontStyleCss = headerFontStyle === "italic" || headerFontStyle === "bold_italic" ? "italic" : "normal";

      const footerFontStyle = payload.footerFontStyle ?? "normal";
      const footerFontWeight = footerFontStyle === "bold" || footerFontStyle === "bold_italic" ? 700 : "normal";
      const footerFontStyleCss = footerFontStyle === "italic" || footerFontStyle === "bold_italic" ? "italic" : "normal";

      const generate = await getGeneratePdf();
      const result = await generate({
        inputPath,
        outputPath,
        widthMm,
        heightMm,
        marginMm,
        titleFontSizePt,
        titleFontWeight,
        titleFontStyle: titleFontStyleCss,
        headerEnabled,
        headerLeftImageDataUrl: payload.headerLeftImageDataUrl ?? "",
        headerRightImageDataUrl: payload.headerRightImageDataUrl ?? "",
        headerTextTemplate: payload.headerTextTemplate ?? "",
        headerTextAlign,
        headerFontSizePt,
        headerFontWeight,
        headerFontStyle: headerFontStyleCss,
        headerLineHeight,
        footerEnabled,
        footerLeftImageDataUrl: payload.footerLeftImageDataUrl ?? "",
        footerRightImageDataUrl: payload.footerRightImageDataUrl ?? "",
        footerTextTemplate: payload.footerTextTemplate ?? "",
        footerTextAlign,
        footerFontSizePt,
        footerFontWeight,
        footerFontStyle: footerFontStyleCss,
        footerLineHeight,
        bodyTemplate: payload.bodyTemplate ?? "",
        removals: Array.isArray(payload.removals) ? payload.removals : [],
        onlyName: Boolean(payload.onlyName),
        includeTitle: Boolean(payload.includeTitle),
      });

      res.json({
        outputFile: payload.outputFile,
        stats: result.stats,
        downloadUrl: `/download/${encodeURIComponent(payload.outputFile)}`,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/download/:file", (req, res) => {
    const file = req.params.file;
    if (!isSimpleFileName(file) || !file.toLowerCase().endsWith(".pdf")) {
      res.status(400).send("Arquivo inválido.");
      return;
    }
    const filePath = path.resolve(rootDir, file);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("Arquivo não existir.");
      return;
    }
    res.download(filePath);
  });

  const basePortRaw = Number(process.env.PORT ?? "3001");
  const basePort = Number.isFinite(basePortRaw) && basePortRaw > 0 ? basePortRaw : 3001;

  const startListen = (port: number, remainingAttempts: number) => {
    const server = app.listen(port, () => {
      process.stdout.write(`Interface iniciar em: http://localhost:${port}/\n`);
    });
    server.on("error", (err: any) => {
      if (err && err.code === "EADDRINUSE" && remainingAttempts > 0) {
        startListen(port + 1, remainingAttempts - 1);
        return;
      }
      throw err;
    });
  };

  startListen(basePort, 10);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
