import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Producto, ProductosArchivo } from "@/lib/catalogo/schema";
import { lineaSchema } from "@/lib/validation/pedidos";
import { especificacionesDe, evaluarLinea, type EvaluacionLinea } from "./linea";

const leerProductos = (): Producto[] =>
  (
    JSON.parse(
      readFileSync(path.join(process.cwd(), "config", "mock-panel", "productos.json"), "utf8"),
    ) as ProductosArchivo
  ).productos;
const productos = leerProductos();

const prod = (lista: Producto[], nombre: string) => lista.find((p) => p.nombre === nombre)!;
const varianteId = (lista: Producto[], nombre: string, sku: string) =>
  prod(lista, nombre).variantes.find((v) => v.sku === sku)!.varianteId;
const especId = (nombre: string, espec: string) => prod(productos, nombre).especificaciones.find((e) => e.nombre === espec)!.id;

const tarjeta = (cambios: Partial<Parameters<typeof evaluarLinea>[1]> = {}) => ({
  productoId: prod(productos, "Tarjeta")._id,
  varianteId: varianteId(productos, "Tarjeta", "70000177"),
  medida: null,
  especificaciones: [especId("Tarjeta", "Suaje")],
  cantidad: 2,
  ...cambios,
});

const lona = (cambios: Partial<Parameters<typeof evaluarLinea>[1]> = {}) => ({
  productoId: prod(productos, "Lona 13 oz.")._id,
  varianteId: varianteId(productos, "Lona 13 oz.", "70000178"),
  medida: { ancho: 2, alto: 1.5 },
  especificaciones: [especId("Lona 13 oz.", "Ojillos")],
  cantidad: 2,
  ...cambios,
});

const error = (resultado: EvaluacionLinea<object>) => (resultado.ok ? null : [resultado.campo, resultado.mensaje]);

describe("evaluarLinea: línea válida", () => {
  it("copia los datos de la variante y la cotización (tarjeta couché con suaje, $310.00)", () => {
    const resultado = evaluarLinea(productos, tarjeta());
    expect(resultado).toMatchObject({
      ok: true,
      linea: {
        sku: "70000177",
        nombre: "Tarjeta",
        variante: "Couché 8.7 x 5 cm",
        atributos: { presentacion: "Couché", acabadoBase: "Barniz UV" },
        categoria: "Tarjetas",
        grupoArmado: "Tarjetas Couché",
        volumen: "millar",
        precioPor: "volumen",
        precioBase: 115,
        requiereArmado: true,
        diasEntrega: 5,
        cantidad: 2,
        importeUnitario: 155,
        subtotal: 310,
      },
    });
  });

  it("lona 2.00 × 1.50 con ojillos → $414.00", () => {
    const resultado = evaluarLinea(productos, lona());
    expect(resultado.ok && resultado.linea.subtotal).toBe(414);
  });

  it("imán metro lineal: solo valida el largo", () => {
    const resultado = evaluarLinea(productos, {
      productoId: prod(productos, "Imán")._id,
      varianteId: varianteId(productos, "Imán", "70000303"),
      medida: { ancho: 0.56, alto: 3 },
      especificaciones: [],
      cantidad: 1,
    });
    expect(resultado.ok && resultado.linea.importeBaseUnitario).toBe(1500);
  });
});

describe("evaluarLinea: errores", () => {
  it("producto o variante inexistentes", () => {
    expect(error(evaluarLinea(productos, tarjeta({ productoId: "nada" })))).toEqual([
      "productoId",
      "El producto ya no existe en el catálogo",
    ]);
    expect(error(evaluarLinea(productos, tarjeta({ varianteId: "nada" })))).toEqual([
      "varianteId",
      "La variante ya no existe en el catálogo",
    ]);
  });

  it("producto inactivo o variante inactiva", () => {
    const lista = leerProductos();
    prod(lista, "Tarjeta").activo = false;
    expect(error(evaluarLinea(lista, tarjeta()))).toEqual(["productoId", "Tarjeta ya no está disponible"]);

    const otra = leerProductos();
    prod(otra, "Tarjeta").variantes[0].activa = false;
    expect(error(evaluarLinea(otra, tarjeta()))).toEqual(["varianteId", "Couché 8.7 x 5 cm ya no está disponible"]);
  });

  it("la lona urgente solo se vende en mostrador", () => {
    const urgente = lona({ varianteId: varianteId(productos, "Lona 13 oz.", "70000179") });
    expect(error(evaluarLinea(productos, urgente))).toEqual([
      "varianteId",
      "Lona urgente 720 dpi solo se vende en mostrador",
    ]);
  });

  it("una variante por cotización no se puede pedir en línea", () => {
    const lista = leerProductos();
    prod(lista, "Tarjeta").variantes[0].precioPor = "cotizacion";
    expect(error(evaluarLinea(lista, tarjeta()))).toEqual(["varianteId", "Este producto se cotiza en mostrador"]);
  });

  it("medida fuera de rango indica el rango", () => {
    expect(error(evaluarLinea(productos, lona({ medida: { ancho: 6, alto: 1.5 } })))).toEqual([
      "medida.ancho",
      "El ancho debe estar entre 0.50 y 5.00 m",
    ]);
    expect(error(evaluarLinea(productos, lona({ medida: { ancho: 2, alto: 0.3 } })))).toEqual([
      "medida.alto",
      "El alto debe estar entre 0.50 y 10.00 m",
    ]);
  });

  it("en metro lineal el error es del largo", () => {
    const iman = {
      productoId: prod(productos, "Imán")._id,
      varianteId: varianteId(productos, "Imán", "70000303"),
      medida: { ancho: 0.56, alto: 25 },
      especificaciones: [],
      cantidad: 1,
    };
    expect(error(evaluarLinea(productos, iman))).toEqual(["medida.alto", "El largo debe estar entre 1.00 y 20.00 m"]);
  });

  it("medida con más de 2 decimales o sin medida en una variante variable", () => {
    expect(error(evaluarLinea(productos, lona({ medida: { ancho: 1.234, alto: 1 } })))).toEqual([
      "medida.ancho",
      "El ancho admite a lo más 2 decimales",
    ]);
    expect(error(evaluarLinea(productos, lona({ medida: null })))).toEqual(["medida.ancho", "Captura la medida"]);
  });

  it("una especificación que no aplica, inactiva o inexistente", () => {
    const pvc = tarjeta({ varianteId: varianteId(productos, "Tarjeta", "70000184") });
    expect(error(evaluarLinea(productos, pvc))).toEqual([
      "especificaciones",
      "El acabado Suaje no aplica a Credencial PVC 8.5 x 5.4 cm",
    ]);

    const lista = leerProductos();
    prod(lista, "Tarjeta").especificaciones[1].activa = false;
    expect(error(evaluarLinea(lista, tarjeta()))).toEqual(["especificaciones", "El acabado Suaje ya no está disponible"]);

    expect(error(evaluarLinea(productos, tarjeta({ especificaciones: [99] })))).toEqual([
      "especificaciones",
      "Un acabado elegido ya no existe",
    ]);
  });

  it("cantidad menor a la mínima de la variante", () => {
    const lista = leerProductos();
    prod(lista, "Tarjeta").variantes[0].cantidadMinima = 5;
    expect(error(evaluarLinea(lista, tarjeta()))).toEqual(["cantidad", "La cantidad mínima es 5"]);
  });
});

describe("especificacionesDe", () => {
  it("la credencial PVC no ofrece despunte, suaje ni foliado; la lona ofrece sus tres", () => {
    const tarjetas = prod(productos, "Tarjeta");
    expect(especificacionesDe(tarjetas, varianteId(productos, "Tarjeta", "70000184"))).toEqual([]);
    expect(especificacionesDe(tarjetas, varianteId(productos, "Tarjeta", "70000177")).map((e) => e.nombre)).toEqual([
      "Despunte",
      "Suaje",
      "Foliado",
    ]);
    const lonas = prod(productos, "Lona 13 oz.");
    expect(especificacionesDe(lonas, lonas.variantes[0].varianteId).map((e) => e.precioTexto)).toEqual([
      "+$3.00 por ojillo (cada 50 cm)",
      "+$10.00 por metro lineal",
      "+$30.00 por pieza",
    ]);
  });
});

describe("lineaSchema", () => {
  const valida = { archivos: { frente: "a1" }, productoId: "p1", varianteId: "v1", cantidad: 1000 };

  it("aplica valores por defecto: sin medida, sin acabados y descripción vacía", () => {
    expect(lineaSchema.parse(valida)).toEqual({
      ...valida,
      archivos: { frente: "a1", reverso: null },
      descripcion: "",
      medida: null,
      especificaciones: [],
    });
  });

  it("acepta 100,000 y rechaza 100,001 (máximo técnico, no de negocio)", () => {
    expect(lineaSchema.safeParse({ ...valida, cantidad: 100_000 }).success).toBe(true);
    expect(lineaSchema.safeParse({ ...valida, cantidad: 100_001 }).error?.issues[0].message).toBe(
      "La cantidad máxima es 100,000",
    );
  });

  it("rechaza acabados repetidos y medidas no positivas", () => {
    expect(lineaSchema.safeParse({ ...valida, especificaciones: [2, 2] }).error?.issues[0].message).toBe(
      "Un acabado está repetido",
    );
    expect(lineaSchema.safeParse({ ...valida, medida: { ancho: 0, alto: 1 } }).error?.issues[0].message).toBe(
      "El ancho debe ser mayor que 0",
    );
  });
});
