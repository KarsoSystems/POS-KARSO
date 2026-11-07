import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZONA_HORARIA_TIENDA, type ConfiguracionArchivo, type Entregas } from "@/lib/configuracion/schema";
import {
  diaDeRecepcion,
  esDiaHabil,
  estatusDelPedido,
  fechaEntregaLinea,
  fechaEntregaPedido,
  sumarDiasHabiles,
} from "./entrega";

// Días hábiles y festivos del mock del panel (los de KARSO 6.9) y ejemplos de 5.9.
const { configuracion }: ConfiguracionArchivo = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "mock-panel", "configuracion.json"), "utf8"),
);
const entregas: Entregas = configuracion.entregas;
const ZONA = ZONA_HORARIA_TIENDA;
/** Hora local de la Ciudad de México (UTC−6 todo el año). */
const cdmx = (diaHora: string) => `${diaHora}:00-06:00`;

describe("esDiaHabil", () => {
  it("lunes a sábado, sin domingo ni festivos", () => {
    expect(esDiaHabil("2026-11-02", entregas)).toBe(true); // lunes
    expect(esDiaHabil("2026-11-07", entregas)).toBe(true); // sábado
    expect(esDiaHabil("2026-11-08", entregas)).toBe(false); // domingo
    expect(esDiaHabil("2026-11-16", entregas)).toBe(false); // festivo
  });
});

describe("diaDeRecepcion", () => {
  it("antes del corte es ese día; en el corte o después, el siguiente hábil", () => {
    expect(diaDeRecepcion(cdmx("2026-11-02T15:59"), entregas, ZONA)).toBe("2026-11-02");
    expect(diaDeRecepcion(cdmx("2026-11-02T16:00"), entregas, ZONA)).toBe("2026-11-03");
  });

  it("el sábado corta a las 12:00 y salta el domingo", () => {
    expect(diaDeRecepcion(cdmx("2026-11-07T11:59"), entregas, ZONA)).toBe("2026-11-07");
    expect(diaDeRecepcion(cdmx("2026-11-07T13:00"), entregas, ZONA)).toBe("2026-11-09");
  });

  it("domingo y festivo pasan al siguiente hábil", () => {
    expect(diaDeRecepcion(cdmx("2026-11-08T10:00"), entregas, ZONA)).toBe("2026-11-09");
    expect(diaDeRecepcion(cdmx("2026-11-16T10:00"), entregas, ZONA)).toBe("2026-11-17");
  });

  it("usa la hora de la tienda, no la UTC: el 3 nov a las 01:00 UTC todavía es el 2 nov a las 19:00 en CDMX", () => {
    expect(diaDeRecepcion("2026-11-03T01:00:00Z", entregas, ZONA)).toBe("2026-11-03");
    expect(diaDeRecepcion("2026-11-02T21:00:00Z", entregas, ZONA)).toBe("2026-11-02"); // 15:00 en CDMX
  });

  it("en el cambio de año: el 31 dic por la noche y el 1 ene (festivo) pasan al 2 ene", () => {
    expect(diaDeRecepcion(cdmx("2026-12-31T20:00"), entregas, ZONA)).toBe("2027-01-02");
  });
});

describe("sumarDiasHabiles", () => {
  it("0 es el mismo día; salta domingos y festivos", () => {
    expect(sumarDiasHabiles("2026-11-02", 0, entregas)).toBe("2026-11-02");
    expect(sumarDiasHabiles("2026-11-14", 1, entregas)).toBe("2026-11-17"); // sábado → (dom, lun festivo) → martes
  });
});

describe("fechaEntregaLinea: tabla de KARSO 5.9 (5 días hábiles)", () => {
  it.each([
    ["Lunes 2 nov, 10:00 am", "2026-11-02T10:00", "2026-11-07"],
    ["Lunes 2 nov, 5:00 pm", "2026-11-02T17:00", "2026-11-09"],
    ["Sábado 7 nov, 1:00 pm", "2026-11-07T13:00", "2026-11-14"],
    ["Martes 10 nov, 10:00 am (lunes 16 festivo)", "2026-11-10T10:00", "2026-11-17"],
  ])("%s → %s", (_, recibido, esperado) => {
    expect(fechaEntregaLinea(cdmx(recibido), 5, entregas, ZONA)).toBe(esperado);
  });

  it("diasEntrega 0: el mismo día antes del corte, el siguiente hábil después", () => {
    expect(fechaEntregaLinea(cdmx("2026-11-02T10:00"), 0, entregas, ZONA)).toBe("2026-11-02");
    expect(fechaEntregaLinea(cdmx("2026-11-02T17:00"), 0, entregas, ZONA)).toBe("2026-11-03");
  });
});

describe("fechaEntregaPedido: ejemplo de KARSO 6.5", () => {
  it("recibido lunes 2 nov a las 3:40 pm: tarjeta (5 días) sábado 7, lona (2 días) miércoles 4, pedido sábado 7", () => {
    const recibido = cdmx("2026-11-02T15:40");
    const tarjeta = fechaEntregaLinea(recibido, 5, entregas, ZONA);
    const lona = fechaEntregaLinea(recibido, 2, entregas, ZONA);
    expect([tarjeta, lona]).toEqual(["2026-11-07", "2026-11-04"]);
    expect(fechaEntregaPedido([{ fechaEntregaEstimada: tarjeta }, { fechaEntregaEstimada: lona }])).toBe("2026-11-07");
  });

  it("sin fechas, null", () => {
    expect(fechaEntregaPedido([{ fechaEntregaEstimada: null }])).toBeNull();
    expect(fechaEntregaPedido([])).toBeNull();
  });
});

describe("estatusDelPedido (KARSO 5.8)", () => {
  const lineas = (...estatus: ("recibido" | "en_proceso" | "listo" | null)[]) => estatus.map((e) => ({ estatus: e }));

  it("todas listas → listo; alguna en proceso o lista → en_proceso; si no, recibido", () => {
    expect(estatusDelPedido("recibido", lineas("listo", "listo"))).toBe("listo");
    expect(estatusDelPedido("recibido", lineas("recibido", "en_proceso"))).toBe("en_proceso");
    expect(estatusDelPedido("en_proceso", lineas("listo", "recibido"))).toBe("en_proceso");
    expect(estatusDelPedido("en_proceso", lineas("recibido", "recibido"))).toBe("recibido");
  });

  it("fuera de producción el estatus del pedido no cambia", () => {
    for (const estatus of ["pago_pendiente", "enviado", "entregado", "cancelado", "rechazado"]) {
      expect(estatusDelPedido(estatus, lineas("listo"))).toBe(estatus);
    }
  });
});
