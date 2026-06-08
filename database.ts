import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "modelos.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Initialize table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    config TEXT NOT NULL
  )
`);

export interface Template {
  id: number;
  name: string;
  config: string;
}

export function getAllTemplates(): Pick<Template, "id" | "name">[] {
  const stmt = db.prepare("SELECT id, name FROM templates ORDER BY name ASC");
  return stmt.all() as Pick<Template, "id" | "name">[];
}

export function getTemplateById(id: number): Template | undefined {
  const stmt = db.prepare("SELECT * FROM templates WHERE id = ?");
  return stmt.get(id) as Template | undefined;
}

export function createTemplate(name: string, config: string): Template {
  const stmt = db.prepare("INSERT INTO templates (name, config) VALUES (?, ?)");
  const info = stmt.run(name, config);
  return { id: info.lastInsertRowid as number, name, config };
}

export function updateTemplate(id: number, name: string, config: string): void {
  const stmt = db.prepare("UPDATE templates SET name = ?, config = ? WHERE id = ?");
  stmt.run(name, config, id);
}

export function deleteTemplate(id: number): void {
  const stmt = db.prepare("DELETE FROM templates WHERE id = ?");
  stmt.run(id);
}
