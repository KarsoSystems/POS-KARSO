import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Datos del e2e en una carpeta temporal; se borra cada vez que arranca el servidor.
const DATA_DIR = path.join(tmpdir(), "cliente-webside-e2e");

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
    command: `rm -rf "${DATA_DIR}" && pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Secreto solo para e2e; no depende del .env.local del desarrollador.
      AUTH_SECRET: "e2e-secret-solo-para-pruebas-0123456789",
      DATA_DIR,
    },
  },
});
