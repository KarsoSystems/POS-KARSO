import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZONA_HORARIA_TIENDA, type ConfiguracionArchivo, type Entregas } from "@/lib/configuracion/schema";
import {
  correccionCompleta,
  fechaLimiteCorreccion,
  limiteCorreccion,
  rechazosVigentes,
  venceLaCorreccion,
  type RechazoCorreccion,
} from "./correccion";

// Días y festivos del mock del panel (KARSO 6.9); plazo de 5 días (SPEC 09).
const { configuracion }: ConfiguracionArchivo = JSON.parse(
  readFileSync(path.join(process.cwd(), "config", "mock-panel", "configuracion.json"), "utf8"),
);
const entregas: Entregas = configuracion.entregas;
const ZONA = ZONA_HORARIA_TIENDA;
const DIAS = configuracion.pedidos.diasParaCorregir;
/** Hora local de la Ciudad de México (UTC−6 todo el año). */
const cdmx = (diaHora: string) => `${diaHora}:00-06:00`;
/** Fin del día en la Ciudad de México, en ISO (23:59:59.999 local = 05:59:59.999 Z del día siguiente). */
const finDe = (dia: string) => new Date(Date.parse(`${dia}T23:59:59.999-06:00`)).toISOString();

describe("fechaLimiteCorreccion: 5 días sin domingos, festivos incluidos, hasta las 23:59", () => {
  it.each([
    ["lunes 2 nov, 3:40 pm → sábado 7 nov", "2026-11-02T15:40", "2026-11-07"],
    ["sábado 7 nov → viernes 13 nov (salta el domingo 8)", "2026-11-07T11:00", "2026-11-13"],
    ["viernes 13 nov → jueves 19 nov (el lunes 16, festivo, cuenta)", "2026-11-13T10:00", "2026-11-19"],
    ["domingo 8 nov → viernes 13 nov", "2026-11-08T10:00", "2026-11-13"],
    ["jueves 31 dic → miércoles 6 ene (el 1 ene cuenta)", "2026-12-31T20:00", "2027-01-06"],
  ])("%s", (_, rechazo, dia) => {
    expect(fechaLimiteCorreccion(cdmx(rechazo), DIAS, entregas, ZONA)).toBe(finDe(dia));
  });

  it("usa el día de la tienda, no el UTC: el 3 nov a las 01:00 UTC todavía es el lunes 2 en CDMX", () => {
    expect(fechaLimiteCorreccion("2026-11-03T01:00:00Z", DIAS, entregas, ZONA)).toBe(finDe("2026-11-07"));
  });

  it("el plazo sale de la configuración", () => {
    expect(fechaLimiteCorreccion(cdmx("2026-11-02T10:00"), 1, entregas, ZONA)).toBe(finDe("2026-11-03"));
  });
});

const rechazo = (fecha: string, lineaId: string, corregidoEn: string | null = null): RechazoCorreccion => ({
  fecha,
  lineaId,
  fechaLimiteCorreccion: fechaLimiteCorreccion(fecha, DIAS, entregas, ZONA),
  corregidoEn,
});

describe("rechazos de la ronda vigente", () => {
  const primera = "2026-11-02T21:40:00.000Z";
  const segunda = "2026-11-05T16:00:00.000Z";

  it("solo cuentan los de la última fecha de rechazo", () => {
    const pedido = { rechazos: [rechazo(primera, "a", segunda), rechazo(segunda, "b"), rechazo(segunda, "c")] };
    expect(rechazosVigentes(pedido).map((r) => r.lineaId)).toEqual(["b", "c"]);
    expect(limiteCorreccion(pedido)).toBe(finDe("2026-11-11"));
    expect(rechazosVigentes({ rechazos: [] })).toEqual([]);
    expect(limiteCorreccion({ rechazos: [] })).toBeNull();
  });

  it("completa cuando cada línea vigente tiene su archivo nuevo", () => {
    expect(correccionCompleta({ rechazos: [rechazo(segunda, "b", segunda), rechazo(segunda, "c")] })).toBe(false);
    expect(correccionCompleta({ rechazos: [rechazo(primera, "a"), rechazo(segunda, "b", segunda)] })).toBe(true);
    expect(correccionCompleta({ rechazos: [] })).toBe(false);
  });
});

describe("venceLaCorreccion", () => {
  const pedido = (estatus: string) => ({ estatus, rechazos: [rechazo(cdmx("2026-11-02T15:40"), "a")] });

  it("vence después de las 23:59:59.999 del último día, solo si sigue rechazado", () => {
    expect(venceLaCorreccion(pedido("rechazado"), new Date(cdmx("2026-11-07T23:59")))).toBe(false);
    expect(venceLaCorreccion(pedido("rechazado"), new Date(cdmx("2026-11-08T00:00")))).toBe(true);
    expect(venceLaCorreccion(pedido("enviado"), new Date(cdmx("2026-11-09T00:00")))).toBe(false);
    expect(venceLaCorreccion({ estatus: "rechazado", rechazos: [] }, new Date())).toBe(false);
  });
});
