import { tmpdir } from "node:os";
import path from "node:path";

// Carpetas temporales del servidor de e2e. Las comparten playwright.config.ts
// (las pasa al servidor) y los tests (leen orders.json, uploads/ y editan el mock del panel).
const BASE = path.join(tmpdir(), "cliente-webside-e2e");
const MOCK_PANEL = path.join(process.cwd(), "config", "mock-panel");

export const DATA_DIR = path.join(BASE, "data");
export const UPLOADS_DIR = path.join(BASE, "uploads");
/** Copias del mock del panel que los tests pueden editar sin tocar las de git. */
export const PRODUCTOS_PATH = path.join(BASE, "productos.json");
export const BANNERS_PATH = path.join(BASE, "banners.json");
export const PRODUCTOS_ORIGINAL = path.join(MOCK_PANEL, "productos.json");
export const BANNERS_ORIGINAL = path.join(MOCK_PANEL, "banners.json");
export { BASE as E2E_DIR };
