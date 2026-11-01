import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOGO_PATH, CatalogoInvalidoError, cargarCatalogo, validarCatalogo } from "./catalogo";

let ejemplo: Record<string, unknown>;
let dir: string;

beforeAll(async () => {
  ejemplo = JSON.parse(await readFile(CATALOGO_PATH, "utf8"));
  dir = await mkdtemp(path.join(tmpdir(), "catalogo-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("catálogo de ejemplo", () => {
  it("config/catalogo.json pasa la validación", async () => {
    const catalogo = await cargarCatalogo();
    expect(catalogo.ejemplo).toBe(true);
    expect(catalogo.hojas.map((h) => h.id)).toEqual(["tabloide", "mesa"]);
    expect(catalogo.papeles.find((p) => p.id === "couche-150")?.precioHojaCentavos).toEqual({
      tabloide: 500,
      mesa: 650,
    });
  });
});

describe("catálogo inválido", () => {
  it("un producto con un papel inexistente falla e indica el campo", () => {
    const invalido = structuredClone(ejemplo) as { productos: { papelesIds: string[] }[] };
    invalido.productos[0].papelesIds.push("papel-fantasma");

    expect(() => validarCatalogo(invalido)).toThrow(CatalogoInvalidoError);
    expect(() => validarCatalogo(invalido)).toThrow(
      /productos\.0\.papelesIds\.2: El papel "papel-fantasma" no existe/,
    );
  });

  it("un papel sin precio para una hoja falla", () => {
    const invalido = structuredClone(ejemplo) as {
      papeles: { precioHojaCentavos: Record<string, number> }[];
    };
    delete invalido.papeles[0].precioHojaCentavos.mesa;

    expect(() => validarCatalogo(invalido)).toThrow(/papeles\.0\.precioHojaCentavos\.mesa/);
  });

  it("cargarCatalogo lanza con la ruta del campo si el archivo es inválido", async () => {
    const archivo = path.join(dir, "catalogo.json");
    await writeFile(archivo, JSON.stringify({ ...ejemplo, tasaIva: "16%" }));
    await expect(cargarCatalogo(archivo)).rejects.toThrow(/tasaIva/);
  });

  it("cargarCatalogo lanza si el archivo no es JSON", async () => {
    const archivo = path.join(dir, "roto.json");
    await writeFile(archivo, "{ no es json");
    await expect(cargarCatalogo(archivo)).rejects.toThrow(CatalogoInvalidoError);
  });
});
