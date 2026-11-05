import { defineConfig, devices } from "@playwright/test";
import {
  BANNERS_ORIGINAL,
  BANNERS_PATH,
  DATA_DIR,
  E2E_DIR,
  PRODUCTOS_ORIGINAL,
  PRODUCTOS_PATH,
  UPLOADS_DIR,
} from "./e2e/rutas";

const PORT = 3100;
// Datos, archivos subidos y mock del panel del e2e en una carpeta temporal; se
// recrea cada vez que arranca el servidor.

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  // next dev compila cada ruta la primera vez que se visita: márgenes holgados.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf "${E2E_DIR}" && mkdir -p "${E2E_DIR}" && cp "${PRODUCTOS_ORIGINAL}" "${PRODUCTOS_PATH}" && cp "${BANNERS_ORIGINAL}" "${BANNERS_PATH}" && pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Secreto solo para e2e; no depende del .env.local del desarrollador.
      AUTH_SECRET: "e2e-secret-solo-para-pruebas-0123456789",
      DATA_DIR,
      UPLOADS_DIR,
      PRODUCTOS_PATH,
      BANNERS_PATH,
    },
  },
});
