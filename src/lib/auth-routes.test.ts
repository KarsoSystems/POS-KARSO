import { describe, expect, it } from "vitest";
import type { EstadoCuenta } from "@/server/domain/user";
import { conSiguiente, destinoPara, redireccionPara, rutaParaEstado, siguienteSeguro } from "./auth-routes";

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
    ["/panel/pedidos", null, "/login?siguiente=%2Fpanel%2Fpedidos"],
    ["/panel", "perfil_incompleto", "/registro/completar"],
    ["/panel", "verificacion_pendiente", "/registro/verificar"],
  ])("%s con %s → %s", (ruta, estado, esperado) => {
    expect(redireccionPara(ruta, estado)).toBe(esperado);
  });

  it("no confunde prefijos (/panelx no es /panel)", () => {
    expect(redireccionPara("/panelx", null)).toBeNull();
  });
});

describe("volver después del login (SPEC 08)", () => {
  it("siguienteSeguro solo acepta rutas internas del panel", () => {
    expect(siguienteSeguro("/panel/seguimiento/KAR-2026-000001")).toBe("/panel/seguimiento/KAR-2026-000001");
    expect(siguienteSeguro("/panel/pedidos?pago=aprobado")).toBe("/panel/pedidos?pago=aprobado");
    for (const ruta of ["https://otro.sitio/panel/x", "//otro.sitio", "/\\otro.sitio", "/login", "/panel", "/panelx/a", "/panel/ x", "", null, undefined]) {
      expect(siguienteSeguro(ruta), String(ruta)).toBeNull();
    }
  });

  it("destinoPara: activo va a la ruta pedida; si le falta perfil o verificación, la conserva", () => {
    const qr = "/panel/seguimiento/KAR-2026-000001";
    expect(destinoPara("activo", qr)).toBe(qr);
    expect(destinoPara("activo", null)).toBe("/panel");
    expect(destinoPara("activo", "https://otro.sitio")).toBe("/panel");
    expect(destinoPara("verificacion_pendiente", qr)).toBe(conSiguiente("/registro/verificar", qr));
    expect(destinoPara("perfil_incompleto", qr)).toBe("/registro/completar?siguiente=%2Fpanel%2Fseguimiento%2FKAR-2026-000001");
  });

  it("el middleware manda a /login con la página pedida (con su query) y la conserva al iniciar sesión", () => {
    expect(redireccionPara("/panel/seguimiento/KAR-2026-000001", null)).toBe(
      "/login?siguiente=%2Fpanel%2Fseguimiento%2FKAR-2026-000001",
    );
    expect(redireccionPara("/panel/pedidos/p1", null, { search: "?pago=aprobado" })).toBe(
      `/login?siguiente=${encodeURIComponent("/panel/pedidos/p1?pago=aprobado")}`,
    );
    // Ya con sesión, /login?siguiente=… lleva ahí; si es externa, al panel.
    expect(redireccionPara("/login", "activo", { siguiente: "/panel/pedidos/p1" })).toBe("/panel/pedidos/p1");
    expect(redireccionPara("/login", "activo", { siguiente: "https://otro.sitio" })).toBe("/panel");
    // Sin verificar, la página pedida espera en /registro/verificar.
    expect(redireccionPara("/panel/pedidos/p1", "verificacion_pendiente")).toBe(
      "/registro/verificar?siguiente=%2Fpanel%2Fpedidos%2Fp1",
    );
    // Recién verificada, la cuenta activa que vuelve a /registro/verificar?siguiente=… va a su página.
    expect(redireccionPara("/registro/verificar", "activo", { siguiente: "/panel/pedidos/p1" })).toBe("/panel/pedidos/p1");
  });
});
