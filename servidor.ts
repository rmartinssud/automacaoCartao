import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { GenerateOptions, generatePdf as generatePdfType, ProgressUpdate } from "./gerar-cartoes.js";

type GenerateRequest = {
  inputFile: string;
  outputFile: string;
  widthMm?: number;
  heightMm?: number;
  marginMm?: number;
  titleFontSizePt?: number;
  titleFontStyle?: "normal" | "bold" | "italic" | "bold_italic";
  titleTextAlign?: "left" | "center" | "right";
  bodyTextAlign?: "left" | "center" | "right";
  bodyLineHeight?: number;
  titleBodyGapMm?: number;
  headerContentGapMm?: number;
  headerEnabled?: boolean;
  headerImageBoxWidthMm?: number;
  headerImageBoxHeightMm?: number;
  headerImageAlignX?: "left" | "center" | "right";
  headerImageAlignY?: "top" | "middle" | "bottom";
  headerLeftImageDataUrl?: string;
  headerRightImageDataUrl?: string;
  headerTextTemplate?: string;
  headerTextAlign?: "left" | "center" | "right";
  headerFontSizePt?: number;
  headerFontStyle?: "normal" | "bold" | "italic" | "bold_italic";
  headerLineHeight?: number;
  footerContentGapMm?: number;
  footerEnabled?: boolean;
  footerImageBoxWidthMm?: number;
  footerImageBoxHeightMm?: number;
  footerImageAlignX?: "left" | "center" | "right";
  footerImageAlignY?: "top" | "middle" | "bottom";
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
  mode?: "preview" | "full";
  standardizeTitleHeader?: boolean;
  defaultGender?: "auto" | "masc" | "fem";
  forcedFemaleNames?: string[];
  forcedMaleNames?: string[];
};

function isSimpleFileName(value: string) {
  return /^[a-zA-Z0-9._ -]+$/.test(value) && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}

function listInputFiles(rootDir: string) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((n) => {
      const lower = n.toLowerCase();
      return lower.endsWith(".txt") || lower.endsWith(".pdf");
    })
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

function buildGenerateOptions(rootDir: string, payload: GenerateRequest, modeOverride?: "preview" | "full") {
  if (!payload || typeof payload !== "object") throw new Error("Payload inválido.");
  const inputLower = payload.inputFile?.toLowerCase?.() ?? "";
  const isInputAllowed = inputLower.endsWith(".txt") || inputLower.endsWith(".pdf");
  if (!isSimpleFileName(payload.inputFile) || !isInputAllowed) {
    throw new Error("Arquivo de entrada inválido.");
  }
  if (!isSimpleFileName(payload.outputFile) || !payload.outputFile.toLowerCase().endsWith(".pdf")) {
    throw new Error("Arquivo de saída inválido.");
  }

  const inputPath = path.resolve(rootDir, payload.inputFile);
  if (!fs.existsSync(inputPath)) throw new Error("Arquivo de entrada não existir.");

  const preset = payload.preset ?? "cartao";
  const widthMm = payload.widthMm ?? (preset === "a4" ? 210 : 156);
  const heightMm = payload.heightMm ?? (preset === "a4" ? 297 : 110);
  const marginMm = payload.marginMm ?? (preset === "a4" ? 20 : 8);

  const outputPath = path.resolve(rootDir, payload.outputFile);

  const titleFontSizePtRaw = payload.titleFontSizePt ?? 14;
  const titleFontSizePt =
    Number.isFinite(titleFontSizePtRaw) && titleFontSizePtRaw >= 6 && titleFontSizePtRaw <= 72 ? titleFontSizePtRaw : 14;

  const titleFontStyle = payload.titleFontStyle ?? "bold";
  const titleFontWeight = titleFontStyle === "bold" || titleFontStyle === "bold_italic" ? 700 : "normal";
  const titleFontStyleCss = titleFontStyle === "italic" || titleFontStyle === "bold_italic" ? "italic" : "normal";

  const headerEnabled = Boolean(payload.headerEnabled);
  const footerEnabled = Boolean(payload.footerEnabled);

  const headerTextAlign = payload.headerTextAlign ?? "center";
  const footerTextAlign = payload.footerTextAlign ?? "center";

  const titleTextAlign = payload.titleTextAlign ?? "left";
  const bodyTextAlign = payload.bodyTextAlign ?? "left";

  const bodyLineHeightRaw = payload.bodyLineHeight ?? 1.25;
  const bodyLineHeight =
    Number.isFinite(bodyLineHeightRaw) && bodyLineHeightRaw >= 0.8 && bodyLineHeightRaw <= 6 ? bodyLineHeightRaw : 1.25;

  const titleBodyGapMmRaw = payload.titleBodyGapMm ?? 6;
  const titleBodyGapMm = Number.isFinite(titleBodyGapMmRaw) && titleBodyGapMmRaw >= 0 && titleBodyGapMmRaw <= 100 ? titleBodyGapMmRaw : 6;

  const headerContentGapMmRaw = payload.headerContentGapMm ?? 0;
  const headerContentGapMm =
    Number.isFinite(headerContentGapMmRaw) && headerContentGapMmRaw >= 0 && headerContentGapMmRaw <= 100
      ? headerContentGapMmRaw
      : 0;

  const footerContentGapMmRaw = payload.footerContentGapMm ?? 0;
  const footerContentGapMm =
    Number.isFinite(footerContentGapMmRaw) && footerContentGapMmRaw >= 0 && footerContentGapMmRaw <= 100
      ? footerContentGapMmRaw
      : 0;

  const headerImageBoxWidthMmRaw = payload.headerImageBoxWidthMm ?? 0;
  const headerImageBoxWidthMm =
    Number.isFinite(headerImageBoxWidthMmRaw) && headerImageBoxWidthMmRaw >= 0 && headerImageBoxWidthMmRaw <= 300
      ? headerImageBoxWidthMmRaw
      : 0;

  const headerImageBoxHeightMmRaw = payload.headerImageBoxHeightMm ?? 0;
  const headerImageBoxHeightMm =
    Number.isFinite(headerImageBoxHeightMmRaw) && headerImageBoxHeightMmRaw >= 0 && headerImageBoxHeightMmRaw <= 300
      ? headerImageBoxHeightMmRaw
      : 0;

  const headerImageAlignX = payload.headerImageAlignX ?? "center";
  const headerImageAlignY = payload.headerImageAlignY ?? "middle";

  const footerImageBoxWidthMmRaw = payload.footerImageBoxWidthMm ?? 0;
  const footerImageBoxWidthMm =
    Number.isFinite(footerImageBoxWidthMmRaw) && footerImageBoxWidthMmRaw >= 0 && footerImageBoxWidthMmRaw <= 300
      ? footerImageBoxWidthMmRaw
      : 0;

  const footerImageBoxHeightMmRaw = payload.footerImageBoxHeightMm ?? 0;
  const footerImageBoxHeightMm =
    Number.isFinite(footerImageBoxHeightMmRaw) && footerImageBoxHeightMmRaw >= 0 && footerImageBoxHeightMmRaw <= 300
      ? footerImageBoxHeightMmRaw
      : 0;

  const footerImageAlignX = payload.footerImageAlignX ?? "center";
  const footerImageAlignY = payload.footerImageAlignY ?? "middle";

  const headerFontSizePtRaw = payload.headerFontSizePt ?? 10;
  const headerFontSizePt =
    Number.isFinite(headerFontSizePtRaw) && headerFontSizePtRaw >= 6 && headerFontSizePtRaw <= 72 ? headerFontSizePtRaw : 10;

  const footerFontSizePtRaw = payload.footerFontSizePt ?? 10;
  const footerFontSizePt =
    Number.isFinite(footerFontSizePtRaw) && footerFontSizePtRaw >= 6 && footerFontSizePtRaw <= 72 ? footerFontSizePtRaw : 10;

  const headerLineHeightRaw = payload.headerLineHeight ?? 1.2;
  const headerLineHeight =
    Number.isFinite(headerLineHeightRaw) && headerLineHeightRaw >= 0.8 && headerLineHeightRaw <= 3 ? headerLineHeightRaw : 1.2;

  const footerLineHeightRaw = payload.footerLineHeight ?? 1.2;
  const footerLineHeight =
    Number.isFinite(footerLineHeightRaw) && footerLineHeightRaw >= 0.8 && footerLineHeightRaw <= 3 ? footerLineHeightRaw : 1.2;

  const headerFontStyle = payload.headerFontStyle ?? "normal";
  const headerFontWeight = headerFontStyle === "bold" || headerFontStyle === "bold_italic" ? 700 : "normal";
  const headerFontStyleCss = headerFontStyle === "italic" || headerFontStyle === "bold_italic" ? "italic" : "normal";

  const footerFontStyle = payload.footerFontStyle ?? "normal";
  const footerFontWeight = footerFontStyle === "bold" || footerFontStyle === "bold_italic" ? 700 : "normal";
  const footerFontStyleCss = footerFontStyle === "italic" || footerFontStyle === "bold_italic" ? "italic" : "normal";

  const mode = modeOverride ?? payload.mode ?? "full";
  const limit = mode === "preview" ? 1 : undefined;

  const options: GenerateOptions = {
    inputPath,
    outputPath,
    widthMm,
    heightMm,
    marginMm,
    titleFontSizePt,
    titleFontWeight,
    titleFontStyle: titleFontStyleCss,
    titleTextAlign,
    bodyTextAlign,
    bodyLineHeight,
    titleBodyGapMm,
    headerContentGapMm,
    headerEnabled,
    headerImageBoxWidthMm,
    headerImageBoxHeightMm,
    headerImageAlignX,
    headerImageAlignY,
    headerLeftImageDataUrl: payload.headerLeftImageDataUrl ?? "",
    headerRightImageDataUrl: payload.headerRightImageDataUrl ?? "",
    headerTextTemplate: payload.headerTextTemplate ?? "",
    headerTextAlign,
    headerFontSizePt,
    headerFontWeight,
    headerFontStyle: headerFontStyleCss,
    headerLineHeight,
    footerContentGapMm,
    footerEnabled,
    footerImageBoxWidthMm,
    footerImageBoxHeightMm,
    footerImageAlignX,
    footerImageAlignY,
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
    standardizeTitleHeader: Boolean(payload.standardizeTitleHeader),
    defaultGender: payload.defaultGender ?? "auto",
    forcedFemaleNames: Array.isArray(payload.forcedFemaleNames) ? payload.forcedFemaleNames : [],
    forcedMaleNames: Array.isArray(payload.forcedMaleNames) ? payload.forcedMaleNames : [],
    limit,
  };

  return { options, outputFile: payload.outputFile };
}

async function main() {
  const app = express();
  const rootDir = process.cwd();

  app.use(express.json({ limit: "50mb" }));

  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && err.type === "entity.too.large") {
      res.status(413).json({ error: "Imagens grandes demais. Tentar reduzir ou usar arquivos menores." });
      return;
    }
    next(err);
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.resolve(rootDir, "ui.html"));
  });

  app.get("/api/inputs", (_req, res) => {
    res.json({ files: listInputFiles(rootDir) });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      hasJob: true,
      endpoints: ["/api/health", "/api/inputs", "/api/job", "/api/job/:id", "/download/:file"],
    });
  });

  app.post("/api/generate", async (req, res) => {
    try {
      const payload = req.body as GenerateRequest;
      const generate = await getGeneratePdf();
      const built = buildGenerateOptions(rootDir, payload);
      const result = await generate(built.options);

      res.json({
        outputFile: built.outputFile,
        stats: result.stats,
        downloadUrl: `/download/${encodeURIComponent(built.outputFile)}`,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  type JobStatus = "queued" | "running" | "done" | "error";
  type Job = {
    id: string;
    status: JobStatus;
    percent: number;
    message: string;
    createdAt: number;
    result?: { outputFile: string; stats: unknown; downloadUrl: string };
    error?: string;
  };

  const jobs = new Map<string, Job>();

  const updateJob = (jobId: string, update: Partial<Job>) => {
    const existing = jobs.get(jobId);
    if (!existing) return;
    jobs.set(jobId, { ...existing, ...update });
  };

  app.post("/api/job", async (req, res) => {
    const payload = req.body as GenerateRequest;

    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of jobs.entries()) {
      if (job.createdAt < cutoff) jobs.delete(id);
    }

    const jobId = randomUUID();
    jobs.set(jobId, { id: jobId, status: "queued", percent: 0, message: "Fila", createdAt: Date.now() });
    res.json({ jobId });

    setImmediate(async () => {
      try {
        updateJob(jobId, { status: "running", percent: 1, message: "Iniciar" });

        const generate = await getGeneratePdf();
        const built = buildGenerateOptions(rootDir, payload);
        const result = await generate(
          built.options,
          (p: ProgressUpdate) => updateJob(jobId, { percent: p.percent, message: p.message }),
        );

        updateJob(jobId, {
          status: "done",
          percent: 100,
          message: "Concluído",
          result: {
            outputFile: built.outputFile,
            stats: result.stats,
            downloadUrl: `/download/${encodeURIComponent(built.outputFile)}`,
          },
        });
      } catch (e) {
        updateJob(jobId, {
          status: "error",
          percent: 100,
          message: "Erro",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  });

  app.get("/api/job/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job não existir." });
      return;
    }
    res.json(job);
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
