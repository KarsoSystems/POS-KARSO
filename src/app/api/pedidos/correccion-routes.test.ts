import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos, archivos y copias del mock del panel antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/correccion-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.PRODUCTOS_PATH = `${base}/productos.json`;
  process.env.CONFIGURACION_PATH = `${base}/configuracion.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return { base, uploadsDir: process.env.UPLOADS_DIR, configuracion: process.env.CONFIGURACION_PATH };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import { POST as rechazarRuta } from "@/app/api/demo-panel/pedidos/[id]/rechazar/route";
import { POST as validarRuta } from "@/app/api/demo-panel/pedidos/[id]/validar/route";
import { CONFIGURACION_PATH, PRODUCTOS_PATH } from "@/server/mock-panel";
import { archivoRepository, userRepository } from "@/server/repositories";
import { subirArchivoPrueba } from "@/test/archivos";
import { jar } from "@/test/next-headers-mock";
import { iniciarSesionActiva, renovarSiHaySesion } from "@/test/sesion";
import { POST as enviarRuta } from "./[id]/correccion/route";
import { PUT as corregirRuta } from "./[id]/lineas/[lineaId]/archivos/route";
import { POST as pagoRuta } from "./[id]/pago-simulado/route";
import { GET as detalleRuta } from "./[id]/route";
import { POST as confirmarRuta } from "./borrador/confirmar/route";
import { POST as agregarRuta } from "./borrador/items/route";
import { POST as aplicarCodigoRuta } from "./borrador/promociones/route";
import { PATCH as patchRuta } from "./borrador/route";
import { GET as listarRuta } from "./route";

const CENTRO = "6720a1f0c1a2b3c4d5e60100";

const json = (method: string, body: unknown) =>
  new Request("http://localhost", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const corregir = (id: string, lineaId: string, caras: Record<string, string>) =>
  corregirRuta(json("PUT", caras), { params: Promise.resolve({ id, lineaId }) });
const enviar = (id: string) => enviarRuta(new Request("http://localhost", { method: "POST" }), ctx(id));
const rechazar = (id: string, lineas: unknown) => rechazarRuta(json("POST", { lineas }), ctx(id));
const validar = (id: string) => validarRuta(new Request("http://localhost", { method: "POST" }), ctx(id));
const detalle = async (id: string) => (await (await detalleRuta(new Request("http://localhost"), ctx(id))).json()).pedido;
const lista = async () => (await (await listarRuta()).json()).pedidos;
const pedidoDe = async (res: Response) => (await res.json()).pedido;
/** Archivos en uploads/ (para revisar que el reemplazado y el temporal se borraron). */
const enUploads = async (carpeta: string) => readdir(path.join(env.uploadsDir!, carpeta)).catch(() => [] as string[]);

/** Mueve el reloj (solo Date) a `fecha` y, si hay sesión, renueva el acceso como lo haría apiFetch. */
const reloj = async (fecha: number | string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(fecha));
  await renovarSiHaySesion();
};

/**
 * Tarjeta couché con frente y reverso de archivo, y lona 720 dpi con solo frente;
 * pagado (`enviado`) y rechazado en las dos líneas el lunes 2 nov a las 3:40 pm.
 */
async function pedidoRechazado({ codigo, lineas = "ambas" }: { codigo?: string; lineas?: "ambas" | "tarjeta" } = {}) {
  const frente = (await subirArchivoPrueba("tarjeta.pdf", "%PDF tarjeta")).id;
  const reverso = (await subirArchivoPrueba("reverso.pdf", "%PDF reverso")).id;
  expect(
    (
      await agregarRuta(
        json("POST", {
          archivos: { frente, reverso: { tipo: "archivo", archivoId: reverso } },
          productoId: "6720a1f0c1a2b3c4d5e60201",
          varianteId: "6720a1f0c1a2b3c4d5e60211",
          especificaciones: [2],
          cantidad: 2,
        }),
      )
    ).status,
  ).toBe(201);
  const frenteLona = (await subirArchivoPrueba("lona.pdf", "%PDF lona")).id;
  await agregarRuta(
    json("POST", {
      archivos: { frente: frenteLona, reverso: null },
      productoId: "6720a1f0c1a2b3c4d5e60202",
      varianteId: "6720a1f0c1a2b3c4d5e60221",
      medida: { ancho: 2, alto: 1.5 },
      especificaciones: [5],
      cantidad: 2,
    }),
  );
  if (codigo) await aplicarCodigoRuta(json("POST", { codigo }));
  await patchRuta(json("PATCH", { sucursalEntregaId: CENTRO }));
  const confirmado = await pedidoDe(await confirmarRuta());
  await pagoRuta(json("POST", { resultado: "aprobado" }), ctx(confirmado.id));

  await reloj("2026-11-02T15:40:00-06:00");
  const [tarjeta, lona] = confirmado.productos.map((l: { lineaId: string }) => l.lineaId);
  const marcadas = [{ lineaId: tarjeta, motivo: "resolucion_insuficiente", comentario: "Se requieren 300 dpi" }];
  if (lineas === "ambas") marcadas.push({ lineaId: lona, motivo: "color_rgb", comentario: "Conviértelo a CMYK" });
  const res = await rechazar(confirmado.id, marcadas);
  expect(res.status).toBe(200);
  return { pedido: await pedidoDe(res), tarjeta, lona };
}

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  await mkdir(env.base, { recursive: true });
  await copyFile(PRODUCTOS_PATH, `${env.base}/productos.json`);
  await copyFile(CONFIGURACION_PATH, env.configuracion);
  jar.clear();
  process.env.DEMO_PANEL = "1";
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.DEMO_PANEL;
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("PUT /api/pedidos/:id/lineas/:lineaId/archivos", () => {
  it("reemplaza el frente de la línea rechazada: el anterior y el temporal se borran; lo demás no cambia", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta } = await pedidoRechazado();
    const anterior = pedido.productos[0].archivos.frente.archivoId;
    const folio = pedido.folio;
    expect(await enUploads(`pedidos/${folio}`)).toContain(`${tarjeta}_frente.pdf`);

    const nuevo = await subirArchivoPrueba("tarjeta-300dpi.pdf", "%PDF corregido");
    await reloj("2026-11-03T10:00:00-06:00");
    const res = await corregir(pedido.id, tarjeta, { frente: nuevo.id });
    expect(res.status).toBe(200);
    const corregido = await pedidoDe(res);

    const frente = corregido.productos[0].archivos.frente;
    // Con las reglas de la SPEC 05 del catálogo: la tarjeta pide JPG, JPEG o TIFF, así que solo advierte.
    expect(frente).toMatchObject({
      nombreOriginal: "tarjeta-300dpi.pdf",
      formato: "pdf",
      validado: false,
      advertencias: [{ codigo: "formato", mensaje: "Formato PDF no permitido para este producto; se aceptan JPG, JPEG y TIFF" }],
    });
    expect(frente.archivoId).not.toBe(anterior);
    expect(corregido.rechazos[0].corregidoEn).toBe("2026-11-03T16:00:00.000Z");
    expect(corregido.rechazos[1].corregidoEn).toBeNull();
    expect(corregido.estatus).toBe("rechazado");

    // El anterior ya no existe (registro); el temporal tampoco (registro ni binario).
    expect(await archivoRepository.findById(anterior)).toBeNull();
    expect(await archivoRepository.findById(nuevo.id)).toBeNull();
    expect(await enUploads("temporal")).not.toContain(`${nuevo.id}.pdf`);
    const copia = await archivoRepository.findById(frente.archivoId);
    expect(copia?.key).toBe(`pedidos/${folio}/${tarjeta}_frente.pdf`);
    expect(await enUploads(`pedidos/${folio}`)).toContain(`${tarjeta}_frente.pdf`);

    // Producto, variante, cantidad, reverso y totales, igual que antes.
    const { archivos: a1, ...resto1 } = pedido.productos[0];
    const { archivos: a2, ...resto2 } = corregido.productos[0];
    expect(resto2).toEqual(resto1);
    expect(a2.reverso).toEqual(a1.reverso);
    expect(corregido.total).toBe(pedido.total);
  });

  it("con otra extensión, el binario anterior también se borra; el reverso de archivo se puede corregir", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta } = await pedidoRechazado();
    const reverso = await subirArchivoPrueba("reverso.ai", "%!PS-Adobe vector");
    const corregido = await pedidoDe(await corregir(pedido.id, tarjeta, { reverso: reverso.id }));
    expect(corregido.productos[0].archivos.reverso).toMatchObject({ tipo: "archivo", formato: "ai", nombreOriginal: "reverso.ai" });
    const archivos = await enUploads(`pedidos/${pedido.folio}`);
    expect(archivos).toContain(`${tarjeta}_reverso.ai`);
    expect(archivos).not.toContain(`${tarjeta}_reverso.pdf`);
  });

  it("subir otra vez antes de enviar reemplaza al archivo corregido", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta } = await pedidoRechazado();
    const primero = await pedidoDe(await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("v1.pdf", "%PDF 1")).id }));
    const segundo = await pedidoDe(await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("v2.pdf", "%PDF 2")).id }));
    expect(segundo.productos[0].archivos.frente.nombreOriginal).toBe("v2.pdf");
    expect(await archivoRepository.findById(primero.productos[0].archivos.frente.archivoId)).toBeNull();
  });

  it("línea no rechazada → 422 LINEA_NO_RECHAZADA; reverso en línea sin reverso de archivo, archivo ajeno o sin caras → 422", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta, lona } = await pedidoRechazado({ lineas: "tarjeta" });
    const nuevo = (await subirArchivoPrueba("nuevo.pdf", "%PDF")).id;

    const noRechazada = await corregir(pedido.id, lona, { frente: nuevo });
    expect(noRechazada.status).toBe(422);
    expect((await noRechazada.json()).error.code).toBe("LINEA_NO_RECHAZADA");
    expect((await corregir(pedido.id, tarjeta, {})).status).toBe(422);
    const inexistente = await corregir(pedido.id, tarjeta, { frente: "no-existe" });
    expect((await inexistente.json()).error.fields).toEqual({ frente: "El archivo no existe" });

    const conLona = await pedidoRechazado();
    const sinReverso = await corregir(conLona.pedido.id, conLona.lona, { reverso: nuevo });
    expect(sinReverso.status).toBe(422);
    expect((await sinReverso.json()).error.fields).toEqual({ reverso: "Esta línea no lleva reverso de archivo" });
  });

  it("un pedido que no está rechazado → 409; de otro usuario → 404", async () => {
    await iniciarSesionActiva("ana@ejemplo.com");
    const { pedido, tarjeta } = await pedidoRechazado({ lineas: "tarjeta" });
    await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("a.pdf", "%PDF")).id });
    await enviar(pedido.id);
    const enviado = await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("b.pdf", "%PDF")).id });
    expect(enviado.status).toBe(409);
    expect((await enviado.json()).error.code).toBe("ESTATUS_INVALIDO");

    await iniciarSesionActiva("beto@ejemplo.com");
    expect((await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("c.pdf", "%PDF")).id })).status).toBe(404);
    expect((await enviar(pedido.id)).status).toBe(404);
  });
});

describe("POST /api/pedidos/:id/correccion", () => {
  it("falta una línea → 422 CORRECCION_INCOMPLETA; con las dos → enviado, correccionEnviadaEn y historial del cliente", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta, lona } = await pedidoRechazado();
    await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("t.pdf", "%PDF")).id });
    const incompleta = await enviar(pedido.id);
    expect(incompleta.status).toBe(422);
    expect((await incompleta.json()).error.code).toBe("CORRECCION_INCOMPLETA");

    await corregir(pedido.id, lona, { frente: (await subirArchivoPrueba("l.pdf", "%PDF")).id });
    await reloj("2026-11-04T10:00:00-06:00");
    const res = await enviar(pedido.id);
    expect(res.status).toBe(200);
    const enviado = await pedidoDe(res);
    expect(enviado).toMatchObject({ estatus: "enviado", correccionEnviadaEn: "2026-11-04T16:00:00.000Z" });
    expect(enviado.historialEstatus.at(-1)).toEqual({
      estatus: "enviado",
      fecha: "2026-11-04T16:00:00.000Z",
      por: "cliente",
      comentario: "Archivos corregidos por el cliente",
    });
    expect((await enviar(pedido.id)).status).toBe(409);

    // Mostrador vuelve a validar el jueves 5: la tarjeta (5 días) cuenta desde el miércoles 4 → martes 10.
    await reloj("2026-11-05T11:00:00-06:00");
    expect(await pedidoDe(await validar(pedido.id))).toMatchObject({ estatus: "recibido", fechaEntregaEstimada: "2026-11-10" });
  });

  it("un pedido rechazado otra vez solo pide las líneas de la nueva ronda", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta, lona } = await pedidoRechazado();
    for (const lineaId of [tarjeta, lona]) await corregir(pedido.id, lineaId, { frente: (await subirArchivoPrueba("x.pdf", "%PDF")).id });
    await enviar(pedido.id);
    await reloj("2026-11-05T10:00:00-06:00");
    await rechazar(pedido.id, [{ lineaId: lona, motivo: "medida_incorrecta", comentario: "Es de 2 x 1 m" }]);

    expect((await enviar(pedido.id)).status).toBe(422);
    await corregir(pedido.id, lona, { frente: (await subirArchivoPrueba("y.pdf", "%PDF")).id });
    const enviado = await pedidoDe(await enviar(pedido.id));
    expect(enviado.estatus).toBe("enviado");
    expect(enviado.rechazos).toHaveLength(3);
    expect(enviado.correccionEnviadaEn).toBe("2026-11-05T16:00:00.000Z");
  });
});

describe("vencimiento de la corrección (al leer)", () => {
  it("a las 23:59 del sábado 7 todavía se puede corregir", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta } = await pedidoRechazado();
    await reloj("2026-11-07T23:59:00-06:00");
    expect((await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("t.pdf", "%PDF")).id })).status).toBe(200);
  });

  it("después del plazo: la lista y el detalle lo muestran cancelado por sistema, BIENVENIDA5 se libera y corregir → 409 CORRECCION_VENCIDA", async () => {
    const user = await iniciarSesionActiva();
    const { pedido, tarjeta } = await pedidoRechazado({ codigo: "BIENVENIDA5" });
    expect((await userRepository.findById(user.id))?.usosPromociones).toHaveLength(1);
    const limite = pedido.rechazos[0].fechaLimiteCorreccion;
    expect(limite).toBe("2026-11-08T05:59:59.999Z");

    await reloj("2026-11-08T00:00:00-06:00");
    const [enLista] = await lista();
    const motivo = "No corrigió el archivo en el plazo";
    expect(enLista).toMatchObject({ estatus: "cancelado", cancelacion: { fecha: limite, por: "sistema", motivo, reembolso: null } });
    expect(enLista.historialEstatus.at(-1)).toEqual({ estatus: "cancelado", fecha: limite, por: "sistema", comentario: motivo });
    expect((await detalle(pedido.id)).estatus).toBe("cancelado");
    expect((await userRepository.findById(user.id))?.usosPromociones).toEqual([]);
    expect((await detalle(pedido.id)).historialEstatus.filter((c: { estatus: string }) => c.estatus === "cancelado")).toHaveLength(1);

    const tarde = await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("t.pdf", "%PDF")).id });
    expect(tarde.status).toBe(409);
    expect((await tarde.json()).error.code).toBe("CORRECCION_VENCIDA");
    expect((await (await enviar(pedido.id)).json()).error.code).toBe("CORRECCION_VENCIDA");
  });

  it("corregir sin que nadie lo haya leído también lo cancela y responde 409 CORRECCION_VENCIDA", async () => {
    await iniciarSesionActiva();
    const { pedido, tarjeta } = await pedidoRechazado();
    await reloj("2026-11-09T09:00:00-06:00");
    const res = await corregir(pedido.id, tarjeta, { frente: (await subirArchivoPrueba("t.pdf", "%PDF")).id });
    expect(res.status).toBe(409);
    expect((await detalle(pedido.id)).cancelacion.motivo).toBe("No corrigió el archivo en el plazo");
  });
});
