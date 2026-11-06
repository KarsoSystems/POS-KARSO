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
export const SUCURSALES_PATH = path.join(BASE, "sucursales.json");
export const PROMOCIONES_PATH = path.join(BASE, "promociones.json");
export const CONFIGURACION_PATH = path.join(BASE, "configuracion.json");
export const SUCURSALES_ORIGINAL = path.join(MOCK_PANEL, "sucursales.json");
export const PROMOCIONES_ORIGINAL = path.join(MOCK_PANEL, "promociones.json");
export const CONFIGURACION_ORIGINAL = path.join(MOCK_PANEL, "configuracion.json");
/** Secreto del servidor de e2e (no depende del .env.local); los tests lo usan para firmar URLs de subida. */
export const E2E_AUTH_SECRET = "e2e-secret-solo-para-pruebas-0123456789";
export { BASE as E2E_DIR };
