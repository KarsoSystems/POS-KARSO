import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";
import { firmarAcceso, type Acceso } from "@/server/auth/tokens";

// El middleware (edge) enruta con el token de acceso RS256 (SPEC 11).

const acceso: Acceso = { sub: "user-1", sid: "sesion-1", idCliente: "CLI-000001", estado: "activo" };
const pedir = (ruta: string, cookies: Record<string, string> = {}) =>
  middleware(
    new NextRequest(`http://localhost${ruta}`, {
      headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    }),
  );

afterEach(() => vi.useRealTimers());

describe("middleware", () => {
  it("con acceso vigente deja ver el panel según el estado del token", async () => {
    const res = await pedir("/panel/pedidos", { acceso: await firmarAcceso(acceso) });
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const pendiente = await firmarAcceso({ ...acceso, estado: "verificacion_pendiente" });
    expect((await pedir("/panel", { acceso: pendiente })).headers.get("location")).toBe("http://localhost/registro/verificar");
  });

  it("acceso vencido con firma válida → a renovar, con la página en siguiente", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-07T18:00:00Z") });
    const token = await firmarAcceso(acceso);
    vi.setSystemTime(new Date("2026-11-07T18:16:00Z"));
    const res = await pedir("/panel/pedidos/abc?x=1", { acceso: token });
    expect(res.headers.get("location")).toBe(
      `http://localhost/api/auth/renovar?siguiente=${encodeURIComponent("/panel/pedidos/abc?x=1")}`,
    );
  });

  it("sin acceso, o inválido, cuenta como sin sesión (no manda a renovar)", async () => {
    expect((await pedir("/panel/pedidos")).headers.get("location")).toBe(
      `http://localhost/login?siguiente=${encodeURIComponent("/panel/pedidos")}`,
    );
    expect((await pedir("/panel", { acceso: "basura" })).headers.get("location")).toBe("http://localhost/login");
  });

  it("la cookie session de antes de la SPEC 11 no vale y se borra", async () => {
    const res = await pedir("/panel", { session: "eyJhbGciOiJIUzI1NiJ9.x.y" });
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(res.headers.get("set-cookie")).toMatch(/^session=; Path=\/; Expires=Thu, 01 Jan 1970/);
  });
});
