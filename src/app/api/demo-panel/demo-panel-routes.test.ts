import { copyFile, mkdir, rm } from "node:fs/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos y archivos temporales antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/demo-panel-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.PRODUCTOS_PATH = `${base}/productos.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { base };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as pagoRuta } from "@/app/api/pedidos/[id]/pago-simulado/route";
import { POST as confirmarRuta } from "@/app/api/pedidos/borrador/confirmar/route";
import { POST as agregarRuta } from "@/app/api/pedidos/borrador/items/route";
import { PATCH as patchRuta } from "@/app/api/pedidos/borrador/route";
import { GET as porFolioRuta } from "@/app/api/pedidos/folio/[folio]/route";
import { PRODUCTOS_PATH } from "@/server/mock-panel";
import { subirArchivoPrueba } from "@/test/archivos";
import { jar } from "@/test/next-headers-mock";
import { iniciarSesionActiva } from "@/test/sesion";
import { POST as entregarRuta } from "./pedidos/[id]/entregar/route";
import { POST as lineaRuta } from "./pedidos/[id]/lineas/[lineaId]/route";
import { POST as rechazarRuta } from "./pedidos/[id]/rechazar/route";
import { POST as validarRuta } from "./pedidos/[id]/validar/route";
import { GET as listarRuta } from "./pedidos/route";

const json = (method: string, body: unknown) =>
  new Request("http://localhost", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const validar = (id: string) => validarRuta(new Request("http://localhost", { method: "POST" }), ctx(id));
const entregar = (id: string) => entregarRuta(new Request("http://localhost", { method: "POST" }), ctx(id));
const moverLinea = (id: string, lineaId: string, estatus: string) =>
  lineaRuta(json("POST", { estatus }), { params: Promise.resolve({ id, lineaId }) });
const rechazar = (id: string, lineas: unknown) => rechazarRuta(json("POST", { lineas }), ctx(id));
const porFolio = (folio: string) => porFolioRuta(new Request("http://localhost"), { params: Promise.resolve({ folio }) });
const pedidoDe = async (res: Response) => (await res.json()).pedido;

async function agregar(linea: Record<string, unknown>) {
  const frente = (await subirArchivoPrueba("a.pdf", "%PDF")).id;
  expect((await agregarRuta(json("POST", { archivos: { frente, reverso: null }, ...linea }))).status).toBe(201);
}

/** Tarjeta couché (5 días) + lona 720 dpi (2 días) del ejemplo de KARSO, pagado: queda en `enviado`. */
async function pedidoEnviado({ pagar = true } = {}) {
  await agregar({ productoId: "6720a1f0c1a2b3c4d5e60201", varianteId: "6720a1f0c1a2b3c4d5e60211", especificaciones: [2], cantidad: 2 });
  await agregar({
    productoId: "6720a1f0c1a2b3c4d5e60202",
    varianteId: "6720a1f0c1a2b3c4d5e60221",
    medida: { ancho: 2, alto: 1.5 },
    especificaciones: [5],
    cantidad: 2,
  });
  await patchRuta(json("PATCH", { sucursalEntregaId: "6720a1f0c1a2b3c4d5e60100" }));
  const pedido = await pedidoDe(await confirmarRuta());
  if (!pagar) return pedido;
  return pedidoDe(await pagoRuta(json("POST", { resultado: "aprobado" }), ctx(pedido.id)));
}

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  await mkdir(env.base, { recursive: true });
  await copyFile(PRODUCTOS_PATH, `${env.base}/productos.json`);
  jar.clear();
  process.env.DEMO_PANEL = "1";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.DEMO_PANEL;
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("sin DEMO_PANEL=1", () => {
  it("todas las rutas del simulador responden 404", async () => {
    await iniciarSesionActiva();
    const pedido = await pedidoEnviado();
    delete process.env.DEMO_PANEL;
    expect((await listarRuta()).status).toBe(404);
    expect((await validar(pedido.id)).status).toBe(404);
    expect((await moverLinea(pedido.id, pedido.productos[0].lineaId, "listo")).status).toBe(404);
    expect((await entregar(pedido.id)).status).toBe(404);
  });
});

describe("GET /api/demo-panel/pedidos", () => {
  it("todos los pedidos de todos los clientes, sin borradores, con el nombre del cliente", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const deAna = await pedidoEnviado();
    await iniciarSesionActiva("beto@ejemplo.com");
    const deBeto = await pedidoEnviado({ pagar: false });
    jar.clear(); // el simulador no usa la sesión del cliente

    const { pedidos } = await (await listarRuta()).json();
    expect(pedidos.map((p: { id: string }) => p.id)).toEqual([deBeto.id, deAna.id]);
    expect(pedidos[1]).toMatchObject({ cliente: "Ana López", estatus: "enviado", saldo: 0 });
    expect(pedidos[0]).toMatchObject({ estatus: "pago_pendiente" });
  });

  it("incluye el catálogo de motivos de rechazo para el formulario", async () => {
    const { motivosRechazo } = await (await listarRuta()).json();
    expect(motivosRechazo.map((m: { clave: string }) => m.clave)).toEqual([
      "color_rgb",
      "resolucion_insuficiente",
      "medida_incorrecta",
      "fuera_area_segura",
      "otro",
    ]);
  });
});

describe("Rechazar (SPEC 09)", () => {
  it("rechazar el lunes 2 nov a las 3:40 pm: rechazado, un rechazo por línea, plazo al sábado 7 a las 23:59 y aviso al cliente", async () => {
    await iniciarSesionActiva();
    const consola = vi.spyOn(console, "info").mockImplementation(() => {});
    const pedido = await pedidoEnviado();
    const [tarjeta, lona] = pedido.productos.map((l: { lineaId: string }) => l.lineaId);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T15:40:00-06:00"));

    const res = await rechazar(pedido.id, [
      { lineaId: tarjeta, motivo: "resolucion_insuficiente", comentario: "El frente está a 150 dpi, se requieren 300" },
      { lineaId: lona, motivo: "color_rgb", comentario: "Conviértelo a CMYK" },
    ]);
    expect(res.status).toBe(200);
    const rechazado = await pedidoDe(res);
    const comun = { fecha: "2026-11-02T21:40:00.000Z", por: "panel-demo", fechaLimiteCorreccion: "2026-11-08T05:59:59.999Z", corregidoEn: null };
    expect(rechazado).toMatchObject({ estatus: "rechazado", correccionEnviadaEn: null });
    expect(rechazado.rechazos).toEqual([
      { ...comun, lineaId: tarjeta, motivo: "resolucion_insuficiente", comentario: "El frente está a 150 dpi, se requieren 300" },
      { ...comun, lineaId: lona, motivo: "color_rgb", comentario: "Conviértelo a CMYK" },
    ]);
    expect(rechazado.historialEstatus.at(-1)).toEqual({
      estatus: "rechazado",
      fecha: "2026-11-02T21:40:00.000Z",
      por: "panel-demo",
      comentario:
        "Tarjeta · Couché 8.7 x 5 cm: Resolución insuficiente — El frente está a 150 dpi, se requieren 300; " +
        "Lona 13 oz. · Lona 720 dpi: El archivo está en RGB — Conviértelo a CMYK",
    });
    expect(consola).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /^\[DEMO CORREO\] Tu pedido KAR-\d{4}-\d{6} fue rechazado: Tarjeta .*: Resolución insuficiente — El frente está a 150 dpi, se requieren 300; Lona .*: El archivo está en RGB — Conviértelo a CMYK\. Corrige antes del sábado 7 nov\.$/,
      ),
    );

    const otraVez = await rechazar(pedido.id, [{ lineaId: tarjeta, motivo: "otro", comentario: "x" }]);
    expect(otraVez.status).toBe(409);
    expect((await otraVez.json()).error.code).toBe("ESTATUS_INVALIDO");
  });

  it("solo desde enviado: un pedido recibido o sin pagar → 409", async () => {
    await iniciarSesionActiva();
    const linea = (p: { productos: { lineaId: string }[] }) => [{ lineaId: p.productos[0].lineaId, motivo: "otro", comentario: "x" }];
    const pendiente = await pedidoEnviado({ pagar: false });
    expect((await rechazar(pendiente.id, linea(pendiente))).status).toBe(409);
    const recibido = await pedidoEnviado();
    await validar(recibido.id);
    expect((await rechazar(recibido.id, linea(recibido))).status).toBe(409);
  });

  it("motivo fuera del catálogo, comentario vacío, sin líneas o línea repetida → 422; línea inexistente → 404", async () => {
    await iniciarSesionActiva();
    const pedido = await pedidoEnviado();
    const lineaId = pedido.productos[0].lineaId;

    const motivo = await rechazar(pedido.id, [{ lineaId, motivo: "borroso", comentario: "x" }]);
    expect(motivo.status).toBe(422);
    expect((await motivo.json()).error.fields).toEqual({ "lineas.0.motivo": 'El motivo "borroso" no está en el catálogo' });
    const comentario = await rechazar(pedido.id, [{ lineaId, motivo: "otro", comentario: "  " }]);
    expect((await comentario.json()).error.fields).toEqual({ "lineas.0.comentario": "Escribe un comentario para el cliente" });
    expect((await rechazar(pedido.id, [])).status).toBe(422);
    const repetida = { lineaId, motivo: "otro", comentario: "x" };
    expect((await rechazar(pedido.id, [repetida, repetida])).status).toBe(422);
    expect((await rechazar(pedido.id, [{ lineaId: "no-existe", motivo: "otro", comentario: "x" }])).status).toBe(404);
    expect((await rechazar("no-existe", [repetida])).status).toBe(404);

    const { pedidoRepository } = await import("@/server/repositories");
    expect(await pedidoRepository.findById(pedido.id)).toMatchObject({ estatus: "enviado", rechazos: [] });
  });

  it("validar un pedido corregido cuenta desde el envío de la corrección (KARSO 5.9)", async () => {
    await iniciarSesionActiva();
    const pedido = await pedidoEnviado();
    const { pedidoRepository } = await import("@/server/repositories");
    // Corrección enviada el miércoles 4 nov a las 10:00 (lo hará la ruta del cliente, paso 4).
    await pedidoRepository.update(pedido.id, (p) => {
      p.correccionEnviadaEn = "2026-11-04T16:00:00.000Z";
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T11:00:00-06:00"));

    const validado = await pedidoDe(await validar(pedido.id));
    expect(validado).toMatchObject({ fechaInicioConteo: "2026-11-04T16:00:00.000Z", fechaEntregaEstimada: "2026-11-10" });
    expect(validado.productos[0].fechaEntregaEstimada).toBe("2026-11-10"); // tarjeta, 5 días desde el 4
  });
});

describe("Validar, mover líneas y entregar", () => {
  it("validar el lunes 2 nov a las 3:40 pm: tarjeta sábado 7, lona miércoles 4, pedido sábado 7 (ejemplo de KARSO)", async () => {
    await iniciarSesionActiva();
    const pedido = await pedidoEnviado();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T15:40:00-06:00"));

    const res = await validar(pedido.id);
    expect(res.status).toBe(200);
    const validado = await pedidoDe(res);
    expect(validado).toMatchObject({
      estatus: "recibido",
      fechaInicioConteo: "2026-11-02T21:40:00.000Z",
      fechaEntregaEstimada: "2026-11-07",
    });
    expect(validado.productos.map((l: { estatus: string; fechaEntregaEstimada: string }) => [l.estatus, l.fechaEntregaEstimada])).toEqual([
      ["recibido", "2026-11-07"],
      ["recibido", "2026-11-04"],
    ]);
    expect(validado.historialEstatus.at(-1)).toMatchObject({
      estatus: "recibido",
      por: "panel-demo",
      comentario: "Archivos y datos validados",
    });

    const otraVez = await validar(pedido.id);
    expect(otraVez.status).toBe(409);
    expect((await otraVez.json()).error.code).toBe("ESTATUS_INVALIDO");
  });

  it("solo se valida un pedido enviado (no uno sin pagar)", async () => {
    await iniciarSesionActiva();
    const pendiente = await pedidoEnviado({ pagar: false });
    expect((await validar(pendiente.id)).status).toBe(409);
    expect((await validar("no-existe")).status).toBe(404);
  });

  it("una línea en proceso → pedido en_proceso; todas listas → listo y aviso al cliente; luego entregar", async () => {
    await iniciarSesionActiva();
    const consola = vi.spyOn(console, "info").mockImplementation(() => {});
    const pedido = await pedidoEnviado();
    expect(consola).toHaveBeenCalledWith(expect.stringMatching(/^\[DEMO CORREO\] Tu pedido KAR-\d{4}-\d{6} está confirmado/));
    await validar(pedido.id);
    const [tarjeta, lona] = pedido.productos.map((l: { lineaId: string }) => l.lineaId);

    expect((await pedidoDe(await moverLinea(pedido.id, lona, "en_proceso"))).estatus).toBe("en_proceso");
    expect((await pedidoDe(await moverLinea(pedido.id, lona, "listo"))).estatus).toBe("en_proceso");
    const retrocede = await moverLinea(pedido.id, lona, "en_proceso");
    expect(retrocede.status).toBe(409);
    expect((await entregar(pedido.id)).status).toBe(409); // aún no está listo

    const listo = await pedidoDe(await moverLinea(pedido.id, tarjeta, "listo"));
    expect(listo.estatus).toBe("listo");
    expect(listo.historialEstatus.map((c: { estatus: string }) => c.estatus)).toEqual([
      "pago_pendiente",
      "enviado",
      "recibido",
      "en_proceso",
      "listo",
    ]);
    expect(consola).toHaveBeenCalledWith(
      expect.stringMatching(/^\[DEMO CORREO\] Tu pedido KAR-\d{4}-\d{6} está listo para recoger en KARSO Centro$/),
    );

    const entregado = await pedidoDe(await entregar(pedido.id));
    expect(entregado).toMatchObject({ estatus: "entregado", saldo: 0 });
    expect(entregado.historialEstatus.at(-1)).toMatchObject({ estatus: "entregado", por: "panel-demo" });
    expect((await moverLinea(pedido.id, tarjeta, "listo")).status).toBe(409);
  });

  it("no se entrega con saldo pendiente; línea inexistente → 404; estatus inválido → 422", async () => {
    await iniciarSesionActiva();
    const pedido = await pedidoEnviado();
    await validar(pedido.id);
    expect((await moverLinea(pedido.id, "no-existe", "listo")).status).toBe(404);
    expect((await moverLinea(pedido.id, pedido.productos[0].lineaId, "recibido")).status).toBe(422);

    for (const l of pedido.productos) await moverLinea(pedido.id, l.lineaId, "listo");
    // Un saldo pendiente (en el panel real, un anticipo de mostrador) bloquea la entrega.
    const { pedidoRepository } = await import("@/server/repositories");
    await pedidoRepository.update(pedido.id, (p) => {
      p.saldo = 100;
    });
    const res = await entregar(pedido.id);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "SALDO_PENDIENTE", message: "No se puede entregar: hay un saldo pendiente de $100.00" });
  });
});

describe("GET /api/pedidos/folio/:folio", () => {
  it("el dueño ve su pedido por folio; otro usuario o un folio inexistente → 404", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const pedido = await pedidoEnviado({ pagar: false });
    expect(pedido.qr).toBe(pedido.folio);
    const res = await porFolio(pedido.folio);
    expect(res.status).toBe(200);
    expect((await pedidoDe(res)).id).toBe(pedido.id);
    expect((await porFolio("KAR-2026-999999")).status).toBe(404);

    await iniciarSesionActiva("beto@ejemplo.com");
    const ajeno = await porFolio(pedido.folio);
    expect(ajeno.status).toBe(404);
    expect((await ajeno.json()).error.message).toBe("Pedido no encontrado");
  });

  it("sin sesión → 401", async () => {
    expect((await porFolio("KAR-2026-000001")).status).toBe(401);
  });
});
