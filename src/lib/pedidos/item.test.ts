import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogoSchema, type Catalogo } from "@/lib/catalogo/schema";
import { evaluarItem, mensajeNoCabe } from "./item";

const catalogo: Catalogo = catalogoSchema.parse(
  JSON.parse(readFileSync(path.join(process.cwd(), "config", "catalogo.json"), "utf8")),
);

const volante = {
  productoId: "volante",
  tamano: { tipo: "predefinido" as const, tamanoId: "media-carta" },
  papelId: "couche-150",
  hojaId: "tabloide",
  cantidad: 1000,
};

describe("evaluarItem", () => {
  it("un ítem válido da medidas resueltas y presupuesto", () => {
    const r = evaluarItem(catalogo, volante);
    expect(r).toMatchObject({ ok: true, anchoCm: 14, altoCm: 21.6 });
    expect(r.ok && r.presupuesto).toMatchObject({ hojas: 500, subtotalCentavos: 250_000 });
  });

  it("usa las medidas de un tamaño personalizado", () => {
    const r = evaluarItem(catalogo, { ...volante, tamano: { tipo: "personalizado", anchoCm: 9, altoCm: 5 } });
    expect(r).toMatchObject({ ok: true, anchoCm: 9, altoCm: 5 });
  });

  it("producto, tamaño, papel u hoja inexistentes", () => {
    expect(evaluarItem(catalogo, { ...volante, productoId: "lona" })).toMatchObject({
      ok: false,
      campo: "productoId",
    });
    expect(
      evaluarItem(catalogo, { ...volante, tamano: { tipo: "predefinido", tamanoId: "oficio" } }),
    ).toMatchObject({ ok: false, campo: "tamano" });
    expect(evaluarItem(catalogo, { ...volante, papelId: "kraft" })).toMatchObject({
      ok: false,
      campo: "papelId",
      mensaje: "El papel ya no existe en el catálogo",
    });
    expect(evaluarItem(catalogo, { ...volante, hojaId: "doble-carta" })).toMatchObject({
      ok: false,
      campo: "hojaId",
    });
  });

  it("un papel que el producto no permite", () => {
    expect(evaluarItem(catalogo, { ...volante, papelId: "couche-300" })).toEqual({
      ok: false,
      campo: "papelId",
      mensaje: "El papel Couché 300 g no está disponible para Volante",
      noCabe: false,
    });
  });

  it("cartel tabloide en hoja tabloide no cabe y sugiere Mesa", () => {
    const r = evaluarItem(catalogo, {
      productoId: "cartel",
      tamano: { tipo: "predefinido", tamanoId: "tabloide" },
      papelId: "couche-300",
      hojaId: "tabloide",
      cantidad: 10,
    });
    expect(r).toEqual({
      ok: false,
      campo: "hojaId",
      mensaje: "No cabe en Tabloide; sí cabe en Mesa",
      noCabe: true,
    });
  });
});

describe("mensajeNoCabe", () => {
  it("si no cabe en ninguna hoja lo dice", () => {
    expect(mensajeNoCabe(catalogo, { anchoCm: 100, altoCm: 100 }, "mesa")).toBe(
      "No cabe en Mesa ni en ninguna otra hoja",
    );
  });
});
