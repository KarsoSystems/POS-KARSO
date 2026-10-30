import { describe, expect, it } from "vitest";
import type { EstadoCuenta } from "@/server/domain/user";
import { redireccionPara, rutaParaEstado } from "./auth-routes";

type Caso = [ruta: string, estado: EstadoCuenta | null, esperado: string | null];

describe("rutaParaEstado", () => {
  it("cada estado tiene su pantalla", () => {
    expect(rutaParaEstado("perfil_incompleto")).toBe("/registro/completar");
    expect(rutaParaEstado("verificacion_pendiente")).toBe("/registro/verificar");
    expect(rutaParaEstado("activo")).toBe("/panel");
  });
});

describe("redireccionPara", () => {
  it.each<Caso>([
    // `/`
    ["/", null, "/login"],
    ["/", "activo", "/panel"],
    ["/", "perfil_incompleto", "/registro/completar"],
    ["/", "verificacion_pendiente", "/registro/verificar"],
    // `/login` y `/registro`
    ["/login", null, null],
    ["/registro", null, null],
    ["/login", "activo", "/panel"],
    ["/registro", "activo", "/panel"],
    ["/login", "verificacion_pendiente", "/registro/verificar"],
    ["/registro", "perfil_incompleto", "/registro/completar"],
    // `/registro/completar`
    ["/registro/completar", null, "/login"],
    ["/registro/completar", "perfil_incompleto", null],
    ["/registro/completar", "verificacion_pendiente", "/registro/verificar"],
    ["/registro/completar", "activo", "/panel"],
    // `/registro/verificar`
    ["/registro/verificar", null, "/login"],
    ["/registro/verificar", "verificacion_pendiente", null],
    ["/registro/verificar", "perfil_incompleto", "/registro/completar"],
    ["/registro/verificar", "activo", "/panel"],
    // `/panel/**`
    ["/panel", null, "/login"],
    ["/panel", "activo", null],
    ["/panel/pedidos", "activo", null],
    ["/panel/pedidos", null, "/login"],
    ["/panel", "perfil_incompleto", "/registro/completar"],
    ["/panel", "verificacion_pendiente", "/registro/verificar"],
  ])("%s con %s → %s", (ruta, estado, esperado) => {
    expect(redireccionPara(ruta, estado)).toBe(esperado);
  });

  it("no confunde prefijos (/panelx no es /panel)", () => {
    expect(redireccionPara("/panelx", null)).toBeNull();
  });
});
