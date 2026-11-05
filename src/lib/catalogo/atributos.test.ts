import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProductosArchivo } from "@/lib/catalogo/schema";
import {
  eleccionesDeVariante,
  elegirAtributo,
  etiquetaAtributo,
  resolverSelectores,
  type EstadoSelectores,
} from "./atributos";

const { productos }: ProductosArchivo = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "mock-panel", "productos.json"), "utf8"),
);
const variantesDe = (nombre: string) => productos.find((p) => p.nombre === nombre)!.variantes;
const volantes = variantesDe("Volante");
const tarjetas = variantesDe("Tarjeta");

const COUCHE = "Couché 128 g 4x4";
const BOND = "Bond 90 g 4x0";

const selector = (estado: EstadoSelectores, llave: string) => estado.selectores.find((s) => s.llave === llave)!;
const disponibles = (estado: EstadoSelectores, llave: string) =>
  selector(estado, llave).opciones.filter((o) => o.disponible).map((o) => o.valor);
const opcion = (estado: EstadoSelectores, llave: string, valor: string) =>
  selector(estado, llave).opciones.find((o) => o.valor === valor)!;

describe("resolverSelectores con volantes", () => {
  it("arma un selector por atributo en el orden de la primera variante, con etiquetas", () => {
    const estado = resolverSelectores(volantes, {});
    expect(estado.selectores.map((s) => [s.llave, s.etiqueta])).toEqual([
      ["papel", "Papel"],
      ["tamano", "Tamaño"],
      ["ajuste", "Ajuste"],
    ]);
    expect(estado.variante).toBeNull();
  });

  it("Tríptico deja 'Ajustado' deshabilitado con su motivo y preselecciona 'Real'", () => {
    const estado = resolverSelectores(volantes, { papel: COUCHE, tamano: "Tríptico" });
    expect(opcion(estado, "ajuste", "Ajustado")).toEqual({
      valor: "Ajustado",
      disponible: false,
      motivo: "No disponible para Tríptico",
    });
    expect(selector(estado, "ajuste").elegido).toBe("Real");
    expect(estado.variante?.nombre).toBe("Tríptico · Real · Couché 128 g");
  });

  it("con Bond solo combinan Carta, Oficio, 4 cartas y 8 cartas", () => {
    const estado = resolverSelectores(volantes, { papel: BOND });
    expect(disponibles(estado, "tamano")).toEqual(["Carta", "Oficio", "4 cartas", "8 cartas"]);
    expect(opcion(estado, "tamano", "Tríptico")).toMatchObject({ disponible: false, motivo: `No disponible para ${BOND}` });
    // Las opciones deshabilitadas se siguen mostrando: están todos los tamaños.
    expect(selector(estado, "tamano").opciones).toHaveLength(10);
  });

  it("todas las opciones están disponibles mientras no hay elecciones", () => {
    const estado = resolverSelectores(volantes, {});
    expect(selector(estado, "tamano").opciones.every((o) => o.disponible)).toBe(true);
  });

  it("resuelve la variante cuando todos los selectores tienen valor", () => {
    const estado = resolverSelectores(volantes, { papel: COUCHE, tamano: "Carta", ajuste: "Ajustado" });
    expect(estado.variante?.sku).toBe("70000201");
  });

  it("descarta una elección que no combina con las anteriores", () => {
    const estado = resolverSelectores(volantes, { papel: BOND, tamano: "Tríptico" });
    expect(estado.elecciones).toEqual({ papel: BOND, ajuste: "Real" }); // bond solo existe en Real
    expect(selector(estado, "tamano").elegido).toBeNull();
  });
});

describe("elegirAtributo", () => {
  it("cambiar el papel a Bond borra el tamaño que deja de combinar y el ajuste Ajustado", () => {
    const antes = { papel: COUCHE, tamano: "1/4 carta", ajuste: "Ajustado" };
    expect(elegirAtributo(volantes, antes, "papel", BOND)).toEqual({ papel: BOND, ajuste: "Real" });
  });

  it("cambiar a un tamaño que sí combina conserva las elecciones", () => {
    const antes = { papel: COUCHE, tamano: "Carta", ajuste: "Ajustado" };
    expect(elegirAtributo(volantes, antes, "tamano", "Oficio")).toEqual({ papel: COUCHE, tamano: "Oficio", ajuste: "Ajustado" });
  });
});

describe("resolverSelectores con tarjetas", () => {
  it("el acabado base se preselecciona porque cada presentación tiene uno solo", () => {
    const estado = resolverSelectores(tarjetas, { presentacion: "Laminada" });
    expect(selector(estado, "acabadoBase").elegido).toBe("Laminado mate 4x4");
    expect(estado.variante?.sku).toBe("70000180");
  });

  it("la credencial PVC no tiene acabado base: el selector no aparece y la variante se resuelve", () => {
    const estado = resolverSelectores(tarjetas, { presentacion: "Credencial PVC" });
    expect(estado.selectores.map((s) => s.llave)).toEqual(["presentacion"]);
    expect(estado.variante?.sku).toBe("70000184");
  });
});

describe("opción única y precarga", () => {
  it("un atributo con una sola opción se preselecciona (lona: entrega Normal)", () => {
    const lonaEnLinea = variantesDe("Lona 13 oz.").filter((v) => v.canales.includes("en_linea"));
    const estado = resolverSelectores(lonaEnLinea, {});
    expect(selector(estado, "entrega").elegido).toBe("Normal");
  });

  it("eleccionesDeVariante precarga una variante existente", () => {
    const variante = volantes.find((v) => v.sku === "70000203")!;
    expect(resolverSelectores(volantes, eleccionesDeVariante(variante)).variante?.sku).toBe("70000203");
  });

  it("una llave desconocida se muestra capitalizada", () => {
    expect(etiquetaAtributo("acabadoBase")).toBe("Acabado base");
    expect(etiquetaAtributo("color")).toBe("Color");
  });
});
