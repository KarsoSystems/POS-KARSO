import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rutas de datos, archivos y copias del mock del panel antes de importar los módulos.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/checkout-routes-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  process.env.PRODUCTOS_PATH = `${base}/productos.json`;
  process.env.SUCURSALES_PATH = `${base}/sucursales.json`;
  process.env.PROMOCIONES_PATH = `${base}/promociones.json`;
  process.env.CONFIGURACION_PATH = `${base}/configuracion.json`;
  process.env.AUTH_SECRET = "x".repeat(32);
  return {
    base,
    sucursales: process.env.SUCURSALES_PATH,
    promociones: process.env.PROMOCIONES_PATH,
    configuracion: process.env.CONFIGURACION_PATH,
  };
});

vi.mock("next/headers", () => import("@/test/next-headers-mock"));

import type { ConfiguracionArchivo } from "@/lib/configuracion/schema";
import type { PromocionesArchivo } from "@/lib/promociones/schema";
import type { SucursalesArchivo } from "@/lib/sucursales/schema";
import type { DatosFiscales } from "@/lib/validation/fiscal";
import { CONFIGURACION_PATH, PRODUCTOS_PATH, PROMOCIONES_PATH, SUCURSALES_PATH } from "@/server/mock-panel";
import { userRepository } from "@/server/repositories";
import { subirArchivoPrueba } from "@/test/archivos";
import { jar } from "@/test/next-headers-mock";
import { iniciarSesionActiva } from "@/test/sesion";
import { POST as cancelarRuta } from "./[id]/cancelar/route";
import { GET as detalle } from "./[id]/route";
import { POST as confirmarRuta } from "./borrador/confirmar/route";
import { POST as agregarRuta } from "./borrador/items/route";
import { DELETE as quitarCodigoRuta } from "./borrador/promociones/[codigo]/route";
import { POST as aplicarCodigoRuta } from "./borrador/promociones/route";
import { GET as getBorrador, PATCH as patchRuta } from "./borrador/route";

const CENTRO = "6720a1f0c1a2b3c4d5e60100";
const CUMBRES = "6720a1f0c1a2b3c4d5e60101";
const TARJETA = "6720a1f0c1a2b3c4d5e60201";
const TARJETA_COUCHE = "6720a1f0c1a2b3c4d5e60211";
const LONA = "6720a1f0c1a2b3c4d5e60202";
const LONA_720 = "6720a1f0c1a2b3c4d5e60221";
const SUAJE = 2;
const OJILLOS = 5;

const DATOS: DatosFiscales = {
  rfc: "PELJ800101ABC",
  razonSocial: "JUAN PEREZ LOPEZ",
  regimenFiscal: "612",
  codigoPostal: "64000",
  usoCfdi: "G03",
  correoFactura: "facturas@elaguila.com",
};

const json = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const patch = (body: unknown) => patchRuta(json("http://localhost/api/pedidos/borrador", "PATCH", body));
const aplicar = (codigo: string) => aplicarCodigoRuta(json("http://localhost/api/pedidos/borrador/promociones", "POST", { codigo }));
const quitarCodigo = (codigo: string) =>
  quitarCodigoRuta(new Request("http://localhost"), { params: Promise.resolve({ codigo }) });
const confirmar = () => confirmarRuta();
const cancelar = (id: string) => cancelarRuta(new Request("http://localhost"), { params: Promise.resolve({ id }) });
const pedidoDe = async (res: Response) => (await res.json()).pedido;
const campos = async (res: Response) => (await res.json()).error.fields;

/** Tarjeta couché × 2 millares con suaje ($310.00). */
async function agregarTarjeta() {
  const frente = (await subirArchivoPrueba("tarjeta.pdf", "%PDF")).id;
  const res = await agregarRuta(
    json("http://localhost/api/pedidos/borrador/items", "POST", {
      archivos: { frente, reverso: null },
      productoId: TARJETA,
      varianteId: TARJETA_COUCHE,
      especificaciones: [SUAJE],
      cantidad: 2,
    }),
  );
  expect(res.status).toBe(201);
}

/** Lona 720 dpi 2.00 × 1.50 m × 2 con ojillos ($414.00). */
async function agregarLona() {
  const frente = (await subirArchivoPrueba("lona.pdf", "%PDF")).id;
  const res = await agregarRuta(
    json("http://localhost/api/pedidos/borrador/items", "POST", {
      archivos: { frente, reverso: null },
      productoId: LONA,
      varianteId: LONA_720,
      medida: { ancho: 2, alto: 1.5 },
      especificaciones: [OJILLOS],
      cantidad: 2,
    }),
  );
  expect(res.status).toBe(201);
}

async function editar<T>(ruta: string, cambiar: (archivo: T) => void) {
  const archivo = JSON.parse(await readFile(ruta, "utf8")) as T;
  cambiar(archivo);
  await writeFile(ruta, JSON.stringify(archivo));
}
const editarPromociones = (cambiar: (a: PromocionesArchivo) => void) => editar(env.promociones, cambiar);
const promo = (a: PromocionesArchivo, codigo: string) => a.promociones.find((p) => p.codigo === codigo)!;
const buenFinVigente = () =>
  editarPromociones((a) => {
    promo(a, "BUENFIN10").vigencia = { inicio: "2026-11-01T06:00:00Z", fin: "2030-12-31T05:59:59Z" };
  });

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  await mkdir(env.base, { recursive: true });
  await copyFile(PRODUCTOS_PATH, `${env.base}/productos.json`);
  await copyFile(SUCURSALES_PATH, env.sucursales);
  await copyFile(PROMOCIONES_PATH, env.promociones);
  await copyFile(CONFIGURACION_PATH, env.configuracion);
  jar.clear();
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

describe("PATCH /api/pedidos/borrador: sucursal de entrega", () => {
  it("sin sesión → 401", async () => {
    expect((await patch({ sucursalEntregaId: CENTRO })).status).toBe(401);
  });

  it("una sucursal activa se guarda con la copia de sus datos; null la quita", async () => {
    await iniciarSesionActiva();
    const pedido = await pedidoDe(await patch({ sucursalEntregaId: CUMBRES }));
    expect(pedido.sucursalEntregaId).toBe(CUMBRES);
    expect(pedido.sucursalEntrega).toEqual({
      nombre: "KARSO Cumbres",
      direccion: expect.objectContaining({ calle: "Av. Paseo de los Leones 1200", codigoPostal: "64610" }),
      telefono: "8180002222",
      horario: "Lunes a viernes 9:00–19:00, sábado 9:00–14:00",
    });
    expect((await pedidoDe(await getBorrador())).sucursalEntregaId).toBe(CUMBRES);
    expect(await pedidoDe(await patch({ sucursalEntregaId: null }))).toMatchObject({
      sucursalEntregaId: null,
      sucursalEntrega: null,
    });
  });

  it("una sucursal inexistente o inactiva → 422", async () => {
    await iniciarSesionActiva();
    await editar<SucursalesArchivo>(env.sucursales, (a) => {
      a.sucursales[2].activa = false;
    });
    for (const id of ["no-existe", "6720a1f0c1a2b3c4d5e60102"]) {
      const res = await patch({ sucursalEntregaId: id });
      expect(res.status).toBe(422);
      expect(await campos(res)).toEqual({ sucursalEntregaId: "Elige una sucursal disponible" });
    }
  });

  it("si la sucursal elegida se desactiva, el borrador la quita y avisa; el siguiente cambio vacía el aviso", async () => {
    await iniciarSesionActiva();
    await patch({ sucursalEntregaId: CENTRO });
    await editar<SucursalesArchivo>(env.sucursales, (a) => {
      a.sucursales[0].activa = false;
    });
    const pedido = await pedidoDe(await getBorrador());
    expect(pedido).toMatchObject({ sucursalEntregaId: null, avisos: ["La sucursal KARSO Centro ya no está disponible; elige otra"] });
    expect((await pedidoDe(await patch({ sucursalEntregaId: CUMBRES }))).avisos).toEqual([]);
  });
});

describe("PATCH /api/pedidos/borrador: factura", () => {
  it("con factura, IVA de 16 %; sin ella, 0 y se conservan los datos del borrador", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    expect(await pedidoDe(await patch({ requiereFactura: true, datosFiscales: DATOS }))).toMatchObject({
      requiereFactura: true,
      datosFiscales: DATOS,
      subtotal: 310,
      baseIva: 310,
      tasaIva: 0.16,
      iva: 49.6,
      total: 359.6,
    });
    expect(await pedidoDe(await patch({ requiereFactura: false }))).toMatchObject({
      tasaIva: 0,
      iva: 0,
      total: 310,
      datosFiscales: DATOS,
    });
  });

  it("al pedir factura sin datos en el borrador, se precargan los del perfil", async () => {
    const user = await iniciarSesionActiva();
    await userRepository.update(user.id, { datosFiscales: DATOS });
    expect((await pedidoDe(await patch({ requiereFactura: true }))).datosFiscales).toEqual(DATOS);
  });

  it("datos fiscales inválidos → 422 por campo, normalizados los válidos", async () => {
    await iniciarSesionActiva();
    const res = await patch({
      requiereFactura: true,
      datosFiscales: { ...DATOS, rfc: "EAG950315K21", codigoPostal: "640", correoFactura: "x@" },
    });
    expect(res.status).toBe(422);
    expect(await campos(res)).toEqual({
      "datosFiscales.codigoPostal": "El código postal debe tener 5 dígitos",
      "datosFiscales.correoFactura": "Correo inválido",
      "datosFiscales.regimenFiscal": "El régimen 612 no aplica a personas morales",
    });
    const normalizados = await pedidoDe(await patch({ datosFiscales: { ...DATOS, rfc: "pelj800101abc" } }));
    expect(normalizados.datosFiscales.rfc).toBe("PELJ800101ABC");
  });

  it("'Guardar en mi perfil' actualiza el perfil; sin la casilla, el perfil no cambia", async () => {
    const user = await iniciarSesionActiva();
    await patch({ requiereFactura: true, datosFiscales: DATOS, guardarDatosFiscales: false });
    expect((await userRepository.findById(user.id))?.datosFiscales).toBeNull();
    await patch({ datosFiscales: DATOS, guardarDatosFiscales: true });
    expect((await userRepository.findById(user.id))?.datosFiscales).toEqual(DATOS);
    await patch({ datosFiscales: { ...DATOS, usoCfdi: "G01" } });
    expect((await userRepository.findById(user.id))?.datosFiscales?.usoCfdi).toBe("G03");
  });
});

describe("POST y DELETE /api/pedidos/borrador/promociones", () => {
  it("KARSO10 en minúsculas sobre $310.00 → −$31.00 y total $279.00; se quita con DELETE", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    const res = await aplicar(" karso10 ");
    expect(res.status).toBe(200);
    expect(await pedidoDe(res)).toMatchObject({
      promociones: [{ codigo: "KARSO10", porcentaje: 10, descuento: 31 }],
      descuento: 31,
      total: 279,
    });
    expect(await pedidoDe(await quitarCodigo("karso10"))).toMatchObject({ promociones: [], descuento: 0, total: 310 });
    expect((await quitarCodigo("KARSO10")).status).toBe(404);
  });

  it.each([
    ["BUENFIN10", "Este código aún no está vigente"],
    ["VERANO15", "Este código venció"],
    ["SUCURSAL20", "Este código solo es válido en sucursal"],
    ["PAUSA30", "Este código no es válido"],
    ["NOEXISTE", "Este código no es válido"],
  ])("%s → 422 '%s' y no se aplica", async (codigo, mensaje) => {
    await iniciarSesionActiva();
    const res = await aplicar(codigo);
    expect(res.status).toBe(422);
    expect(await campos(res)).toEqual({ codigo: mensaje });
    expect((await pedidoDe(await getBorrador())).promociones).toEqual([]);
  });

  it("repetido, tercer código y tope de 30 %", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    await aplicar("KARSO10");
    expect(await campos(await aplicar("karso10"))).toEqual({ codigo: "Ya aplicaste este código" });
    const pedido = await pedidoDe(await aplicar("MAYOREO25"));
    // 10 % + 25 % = 35 %: MAYOREO25 solo llega al tope (30 % de $310.00 = $93.00).
    expect(pedido.promociones.map((p: { descuento: number }) => p.descuento)).toEqual([31, 62]);
    expect(pedido).toMatchObject({ descuento: 93, total: 217 });
    expect(await campos(await aplicar("BIENVENIDA5"))).toEqual({ codigo: "Solo se aceptan 2 códigos por pedido" });
  });
});

describe("POST /api/pedidos/borrador/confirmar con checkout", () => {
  it("sin sucursal, o con factura sin datos → 422 CHECKOUT_INCOMPLETO por campo, sin gastar folio", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    await patch({ requiereFactura: true });
    const res = await confirmar();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({
      code: "CHECKOUT_INCOMPLETO",
      fields: { sucursalEntregaId: "Elige la sucursal de entrega", datosFiscales: "Captura tus datos fiscales" },
    });
    await patch({ sucursalEntregaId: CENTRO });
    expect(await campos(await confirmar())).toEqual({ datosFiscales: "Captura tus datos fiscales" });
    await patch({ datosFiscales: DATOS });
    expect((await confirmar()).status).toBe(201);
  });

  it("ejemplo de KARSO con BUENFIN10 vigente y factura: $755.86; el pedido queda congelado", async () => {
    await buenFinVigente();
    await iniciarSesionActiva();
    await agregarTarjeta();
    await agregarLona();
    await aplicar("BUENFIN10");
    await patch({ sucursalEntregaId: CENTRO, requiereFactura: true, datosFiscales: DATOS });
    const res = await confirmar();
    expect(res.status).toBe(201);
    const pedido = await pedidoDe(res);
    expect(pedido).toMatchObject({
      sucursalEntregaId: CENTRO,
      sucursalEntrega: { nombre: "KARSO Centro" },
      promociones: [{ codigo: "BUENFIN10", porcentaje: 10, descuento: 72.4 }],
      requiereFactura: true,
      datosFiscales: DATOS,
      subtotal: 724,
      descuento: 72.4,
      baseIva: 651.6,
      tasaIva: 0.16,
      iva: 104.26,
      total: 755.86,
      avisos: [],
    });

    await editar<ConfiguracionArchivo>(env.configuracion, (a) => {
      a.configuracion.iva.tasa = 0.08;
    });
    await editarPromociones((a) => {
      promo(a, "BUENFIN10").porcentaje = 50;
    });
    const guardado = await pedidoDe(await detalle(new Request("http://localhost"), { params: Promise.resolve({ id: pedido.id }) }));
    expect(guardado).toMatchObject({ tasaIva: 0.16, total: 755.86, promociones: [{ descuento: 72.4 }] });
  });

  it("sin factura, el pedido guarda datosFiscales null aunque el borrador los tuviera", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    await patch({ sucursalEntregaId: CENTRO, requiereFactura: true, datosFiscales: DATOS });
    await patch({ requiereFactura: false });
    expect(await pedidoDe(await confirmar())).toMatchObject({ requiereFactura: false, datosFiscales: null, total: 310 });
  });

  it("BIENVENIDA5 se registra al hacer el pedido, ya no se puede usar y cancelar lo libera", async () => {
    const user = await iniciarSesionActiva();
    await agregarTarjeta();
    await aplicar("BIENVENIDA5");
    await patch({ sucursalEntregaId: CENTRO });
    const pedido = await pedidoDe(await confirmar());
    expect((await userRepository.findById(user.id))?.usosPromociones).toEqual([
      expect.objectContaining({ codigo: "BIENVENIDA5", pedidoId: pedido.id, fecha: pedido.confirmadoAt }),
    ]);

    await agregarTarjeta();
    expect(await campos(await aplicar("BIENVENIDA5"))).toEqual({ codigo: "Ya usaste este código" });

    expect((await cancelar(pedido.id)).status).toBe(200);
    expect((await userRepository.findById(user.id))?.usosPromociones).toEqual([]);
    expect((await aplicar("BIENVENIDA5")).status).toBe(200);
  });

  it("un código que vence entre aplicarlo y confirmar → 409 PROMOCION_INVALIDA y el borrador queda sin él", async () => {
    await iniciarSesionActiva();
    await agregarTarjeta();
    await aplicar("KARSO10");
    await patch({ sucursalEntregaId: CENTRO });
    await editarPromociones((a) => {
      promo(a, "KARSO10").vigencia.fin = "2026-11-01T07:00:00Z";
    });

    const res = await confirmar();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "PROMOCION_INVALIDA",
      message: "El código KARSO10 ya no es válido: venció. Revisa el total antes de hacer el pedido",
    });
    const borrador = await pedidoDe(await getBorrador());
    expect(borrador).toMatchObject({ estado: "borrador", promociones: [], total: 310 });
    expect(borrador.avisos).toEqual(["El código KARSO10 ya no es válido: venció"]);
    expect((await confirmar()).status).toBe(201);
  });
});
