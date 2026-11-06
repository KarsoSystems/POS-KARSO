import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PromocionesArchivo } from "@/lib/promociones/schema";
import { calcularTotales } from "./cotizacion";
import { avisoCodigoInvalido, calcularDescuentos, evaluarCodigo, normalizarCodigo } from "./promociones";

// Códigos del mock del panel (config/mock-panel/promociones.json) y reglas de KARSO 5.5.
const { promociones }: PromocionesArchivo = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "mock-panel", "promociones.json"), "utf8"),
);
const promo = (codigo: string) => promociones.find((p) => p.codigo === codigo)!;

const HOY = new Date("2026-11-06T18:00:00Z");
const sinUsos = { ahora: HOY, usosTotales: 0, usosDelCliente: 0 };
const SUMA = { maxCodigosPorPedido: 2, modoCombinacion: "suma", descuentoMaximoPorcentaje: 30 } as const;
const CASCADA = { ...SUMA, modoCombinacion: "cascada" } as const;

describe("normalizarCodigo", () => {
  it("quita espacios y pasa a mayúsculas", () => {
    expect(normalizarCodigo("  karso10 ")).toBe("KARSO10");
  });
});

describe("evaluarCodigo", () => {
  it("un código vigente, en línea y sin límites vale", () => {
    expect(evaluarCodigo(promo("KARSO10"), sinUsos)).toEqual({ ok: true });
  });

  it.each([
    ["inexistente", undefined, "no_existe", "Este código no es válido"],
    ["inactivo (PAUSA30)", "PAUSA30", "no_existe", "Este código no es válido"],
    ["aún no vigente (BUENFIN10)", "BUENFIN10", "no_vigente", "Este código aún no está vigente"],
    ["vencido (VERANO15)", "VERANO15", "vencida", "Este código venció"],
    ["solo de mostrador (SUCURSAL20)", "SUCURSAL20", "otro_canal", "Este código solo es válido en sucursal"],
  ])("%s", (_, codigo, motivo, mensaje) => {
    expect(evaluarCodigo(codigo ? promo(codigo) : undefined, sinUsos)).toEqual({ ok: false, motivo, mensaje });
  });

  it("BUENFIN10 vale del 13 al 17 de noviembre (hora de Monterrey) y después vence", () => {
    expect(evaluarCodigo(promo("BUENFIN10"), { ...sinUsos, ahora: new Date("2026-11-13T06:00:00Z") })).toEqual({ ok: true });
    expect(evaluarCodigo(promo("BUENFIN10"), { ...sinUsos, ahora: new Date("2026-11-17T05:59:59Z") })).toEqual({ ok: true });
    expect(evaluarCodigo(promo("BUENFIN10"), { ...sinUsos, ahora: new Date("2026-11-17T06:00:00Z") })).toMatchObject({
      motivo: "vencida",
    });
  });

  it("usosPorCliente: 1 deja de valer con un uso del cliente", () => {
    expect(evaluarCodigo(promo("BIENVENIDA5"), { ...sinUsos, usosTotales: 50 })).toEqual({ ok: true });
    expect(evaluarCodigo(promo("BIENVENIDA5"), { ...sinUsos, usosTotales: 50, usosDelCliente: 1 })).toEqual({
      ok: false,
      motivo: "ya_usada",
      mensaje: "Ya usaste este código",
    });
  });

  it("usosMaximos: se agota al llegar al límite entre todos los clientes", () => {
    const buenFin = { ...promo("BUENFIN10"), vigencia: { inicio: "2026-11-01T06:00:00Z", fin: "2030-12-31T05:59:59Z" } };
    expect(evaluarCodigo(buenFin, { ...sinUsos, usosTotales: 99 })).toEqual({ ok: true });
    expect(evaluarCodigo(buenFin, { ...sinUsos, usosTotales: 100 })).toMatchObject({
      motivo: "agotada",
      mensaje: "Este código se agotó",
    });
  });

  it("aviso del borrador cuando un código deja de valer", () => {
    expect(avisoCodigoInvalido("VERANO15", "vencida")).toBe("El código VERANO15 ya no es válido: venció");
    expect(avisoCodigoInvalido("PAUSA30", "no_existe")).toBe("El código PAUSA30 ya no es válido: ya no está disponible");
  });
});

describe("calcularDescuentos", () => {
  it("un código: porcentaje del subtotal", () => {
    expect(calcularDescuentos(310, [10], SUMA)).toEqual([31]);
  });

  it("suma: cada código sobre el subtotal", () => {
    expect(calcularDescuentos(1000, [10, 5], SUMA)).toEqual([100, 50]);
  });

  it("cascada: cada código sobre lo que queda", () => {
    expect(calcularDescuentos(1000, [10, 5], CASCADA)).toEqual([100, 45]);
  });

  it("tope de 30 %: KARSO10 + MAYOREO25 sobre $1,000.00 → $100.00 + $200.00", () => {
    expect(calcularDescuentos(1000, [10, 25], SUMA)).toEqual([100, 200]);
    // En el otro orden, el primero entra completo y el segundo solo hasta el tope.
    expect(calcularDescuentos(1000, [25, 10], SUMA)).toEqual([250, 50]);
    // En cascada también: 100 + 25 % de 900 = 225, pero el tope deja 200.
    expect(calcularDescuentos(1000, [10, 25], CASCADA)).toEqual([100, 200]);
  });

  it("un código que solo, ya pasa del tope, se limita al tope", () => {
    expect(calcularDescuentos(1000, [40], SUMA)).toEqual([300]);
    expect(calcularDescuentos(1000, [30, 10], SUMA)).toEqual([300, 0]);
  });

  it("redondea en centavos cada importe una vez", () => {
    expect(calcularDescuentos(123.45, [10, 5], SUMA)).toEqual([12.35, 6.17]); // 12.345 → 12.35, 6.1725 → 6.17
    expect(calcularDescuentos(0, [10], SUMA)).toEqual([0]);
    expect(calcularDescuentos(500, [], SUMA)).toEqual([]);
  });

  it("ejemplo de KARSO 6.5: $724.00 con BUENFIN10 → $72.40; con factura IVA $104.26 y total $755.86", () => {
    const [descuento] = calcularDescuentos(724, [10], SUMA);
    expect(descuento).toBe(72.4);
    const lineas = [{ subtotal: 310 }, { subtotal: 414 }];
    expect(calcularTotales(lineas, 0.16, descuento)).toEqual({
      subtotal: 724,
      descuento: 72.4,
      baseIva: 651.6,
      tasaIva: 0.16,
      iva: 104.26,
      total: 755.86,
    });
    expect(calcularTotales(lineas, 0, descuento).total).toBe(651.6);
  });
});
