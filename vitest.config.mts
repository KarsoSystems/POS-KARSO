import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig usa "jsx": "preserve" (lo compila Next); los tests .tsx necesitan el runtime automático.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Llave RS256 de la sesión (SPEC 11), generada en cada corrida.
    setupFiles: ["src/test/llaves.ts"],
  },
});
