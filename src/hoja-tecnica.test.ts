import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// La hoja técnica del backend (SPEC 12) se mantiene al día con el demo: falla si
// una ruta o un método no está documentado, si falta un ancla o un subtítulo de la
// plantilla de módulo, o si cita un archivo `src/…` que no existe. No revisa la prosa.

const RAIZ = path.resolve(__dirname, "..");
const HOJA = readFileSync(path.join(RAIZ, "docs/backend/hoja-tecnica.md"), "utf8");

const MODULOS = [
  "auth",
  "usuarios",
  "productos",
  "sucursales",
  "banners",
  "configuracion",
  "promociones",
  "pedidos",
  "pagos",
  "archivos",
  "notificaciones",
];

const ANCLAS = ["mapa", "orden", "transversal", "guarda-de-sesion", "job", "emulado", "pendientes", "fuera"];

const PLANTILLA = [
  "### Qué cubre",
  "### Colección y campos",
  "### Endpoints",
  "### Reglas",
  "### Lógica para portar",
  "### Emulado en el demo",
  "### Pendientes",
];

const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Todos los `route.ts` bajo `dir`. */
function rutas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) return rutas(completo);
    return e.name === "route.ts" ? [completo] : [];
  });
}

/** `src/app/api/pedidos/[id]/route.ts` → `/api/pedidos/:id`; `[...key]` → `:key*`. */
function rutaDelDemo(archivo: string): string {
  const carpeta = path.relative(path.join(RAIZ, "src/app"), path.dirname(archivo)).split(path.sep).join("/");
  return `/${carpeta}`.replace(/\[\.\.\.(\w+)\]/g, ":$1*").replace(/\[(\w+)\]/g, ":$1");
}

/** Métodos HTTP que exporta un route handler (`export async function GET`, `export const POST`…). */
function metodosExportados(fuente: string): string[] {
  return METODOS.filter((m) => new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b`).test(fuente));
}

/** El texto de la sección de un módulo: de su ancla al siguiente separador `---`. */
function seccion(modulo: string): string {
  const inicio = HOJA.indexOf(`<a id="modulo-${modulo}"></a>`);
  if (inicio < 0) return "";
  const fin = HOJA.indexOf("\n---\n", inicio);
  return HOJA.slice(inicio, fin < 0 ? undefined : fin);
}

describe("hoja técnica del backend", () => {
  const endpoints = rutas(path.join(RAIZ, "src/app")).flatMap((archivo) =>
    metodosExportados(readFileSync(archivo, "utf8")).map((metodo) => `${metodo} ${rutaDelDemo(archivo)}`),
  );

  it("encuentra las rutas del demo", () => {
    expect(endpoints).toContain("GET /.well-known/jwks.json");
    expect(endpoints).toContain("PUT /api/r2-local/:key*");
    expect(endpoints).toContain("DELETE /api/pedidos/borrador/items/:itemId");
  });

  it.each(endpoints)("documenta `%s`", (endpoint) => {
    // includes + mensaje: con toContain, el fallo imprimiría la hoja entera.
    expect(HOJA.includes(`\`${endpoint}\``), `falta \`${endpoint}\` en la hoja`).toBe(true);
  });

  it.each([...ANCLAS, ...MODULOS.map((m) => `modulo-${m}`)])("tiene el ancla #%s", (ancla) => {
    expect(HOJA.includes(`<a id="${ancla}"></a>`), `falta el ancla #${ancla}`).toBe(true);
  });

  it.each(MODULOS)("la sección de `%s` sigue la plantilla", (modulo) => {
    const texto = seccion(modulo);
    expect(texto.includes(`## Módulo \`${modulo}\``), `falta el título de ${modulo}`).toBe(true);
    const posiciones = PLANTILLA.map((subtitulo) => texto.indexOf(`\n${subtitulo}\n`));
    expect(PLANTILLA.filter((_, i) => posiciones[i] < 0)).toEqual([]);
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
  });

  it("los enlaces internos apuntan a anclas que existen", () => {
    const anclas = new Set([...HOJA.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));
    const rotos = [...HOJA.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]).filter((a) => !anclas.has(a));
    expect(rotos).toEqual([]);
  });

  it("los archivos `src/…` citados existen", () => {
    const citados = [...new Set([...HOJA.matchAll(/`(src\/[^`\s*<]+)`/g)].map((m) => m[1]))];
    expect(citados.length).toBeGreaterThan(0);
    expect(citados.filter((f) => !existsSync(path.join(RAIZ, f)))).toEqual([]);
  });
});
