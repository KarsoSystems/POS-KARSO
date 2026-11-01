import { tmpdir } from "node:os";
import path from "node:path";

// Carpetas temporales del servidor de e2e. Las comparten playwright.config.ts
// (las pasa al servidor) y los tests (leen orders.json, uploads/ y editan el catálogo).
const BASE = path.join(tmpdir(), "cliente-webside-e2e");

export const DATA_DIR = path.join(BASE, "data");
export const UPLOADS_DIR = path.join(BASE, "uploads");
/** Copia de config/catalogo.json que los tests pueden editar sin tocar el de git. */
export const CATALOGO_PATH = path.join(BASE, "catalogo.json");
export const CATALOGO_ORIGINAL = path.join(process.cwd(), "config", "catalogo.json");
export { BASE as E2E_DIR };
