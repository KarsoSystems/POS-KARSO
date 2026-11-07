import { rm } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// DATA_DIR temporal antes de importar los repositorios.
const env = vi.hoisted(() => {
  const base = `${process.env.TMPDIR ?? "/tmp"}/borrador-recalculo-${process.pid}`;
  process.env.DATA_DIR = `${base}/data`;
  process.env.UPLOADS_DIR = `${base}/uploads`;
  return { base };
});

import type { Pedido } from "@/server/domain/pedido";
import { cargarConfiguracion, cargarProductos, cargarPromociones, cargarSucursales } from "@/server/mock-panel";
import { userRepository } from "@/server/repositories";
import type { ContextoTienda } from "@/server/tienda";
import { recalcularBorrador } from "./borrador";

// Recálculo de sucursal, códigos e IVA (SPEC 06) sobre un borrador armado a mano:
// las rutas para elegirlos llegan con el paso 5. Las líneas no importan aquí
// (borrador vacío): el subtotal se fija con una línea mínima.

const HOY = new Date("2026-11-06T18:00:00Z");
const CENTRO = "6720a1f0c1a2b3c4d5e60100";
const CUMBRES = "6720a1f0c1a2b3c4d5e60101";

async function contexto(cambiar: (c: ContextoTienda) => void = () => {}): Promise<ContextoTienda> {
  const c: ContextoTienda = {
    productos: (await cargarProductos()).productos,
    sucursales: (await cargarSucursales()).sucursales,
    promociones: (await cargarPromociones()).promociones,
    configuracion: (await cargarConfiguracion()).configuracion,
  };
  cambiar(c);
  return c;
}

const promocion = (c: ContextoTienda, codigo: string) => c.promociones.find((p) => p.codigo === codigo)!;

/** Borrador sin líneas con un subtotal fijo: `recalcularBorrador` suma los subtotales de las líneas. */
function borrador(userId: string, subtotal: number, cambios: Partial<Pedido> = {}): Pedido {
  return {
    id: "b1",
    folio: null,
    userId,
    estatus: "borrador",
    historialEstatus: [],
    productos: [
      {
        productoId: "fuera-del-catalogo",
        varianteId: "x",
        medida: { tipo: "fija", unidad: "cm", ancho: 1, alto: 1, area: null },
        especificaciones: [],
        cantidad: 1,
        archivos: { frente: null, reverso: null },
        subtotal,
      } as unknown as Pedido["productos"][number],
    ],
    sucursalEntregaId: null,
    sucursalEntrega: null,
    promociones: [],
    requiereFactura: false,
    datosFiscales: null,
    avisos: [],
    subtotal: 0,
    descuento: 0,
    baseIva: 0,
    tasaIva: 0,
    iva: 0,
    total: 0,
    vencimientoPago: null,
    pagos: [],
    pagado: 0,
    saldo: 0,
    cancelacion: null,
    fechaInicioConteo: null,
    fechaEntregaEstimada: null,
    qr: null,
    createdAt: HOY.toISOString(),
    updatedAt: HOY.toISOString(),
    confirmadoAt: null,
    ...cambios,
  };
}

const aplicado = (c: ContextoTienda, codigo: string) => {
  const p = promocion(c, codigo);
  return { promocionId: p._id, codigo: p.codigo, porcentaje: p.porcentaje, descuento: 0 };
};

let userId: string;

beforeEach(async () => {
  await rm(env.base, { recursive: true, force: true });
  userId = (
    await userRepository.create({
      nombre: "Ana",
      apellidoPaterno: "López",
      apellidoMaterno: "García",
      whatsapp: "+525512345678",
      correo: "ana@ejemplo.com",
      passwordHash: null,
      providers: ["google"],
      whatsappVerificado: true,
      correoVerificado: true,
      estado: "activo",
    })
  ).id;
});

afterAll(async () => {
  await rm(env.base, { recursive: true, force: true });
});

// Las líneas armadas a mano no pasan por el catálogo: evaluarLinea las marca con
// problema y conservan su subtotal, que es lo que necesitan estos tests.
describe("recalcularBorrador: sucursal", () => {
  it("una sucursal activa actualiza su copia", async () => {
    const c = await contexto((ctx) => {
      ctx.sucursales[1].horario = "Lunes a sábado 8:00–20:00";
    });
    const pedido = borrador(userId, 100, { sucursalEntregaId: CUMBRES });
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido.sucursalEntrega).toMatchObject({ nombre: "KARSO Cumbres", horario: "Lunes a sábado 8:00–20:00" });
    expect(pedido.avisos).toEqual([]);
  });

  it("una sucursal desactivada se quita con un aviso, una sola vez", async () => {
    const c = await contexto((ctx) => {
      ctx.sucursales[0].activa = false;
    });
    const pedido = borrador(userId, 100, {
      sucursalEntregaId: CENTRO,
      sucursalEntrega: { nombre: "KARSO Centro", direccion: c.sucursales[0].direccion, telefono: "", horario: "" },
    });
    await recalcularBorrador(pedido, c, HOY);
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido).toMatchObject({ sucursalEntregaId: null, sucursalEntrega: null });
    expect(pedido.avisos).toEqual(["La sucursal KARSO Centro ya no está disponible; elige otra"]);
  });
});

describe("recalcularBorrador: códigos e IVA", () => {
  it("descuento con el porcentaje vigente del panel y totales de KARSO 5.4", async () => {
    const c = await contexto((ctx) => {
      promocion(ctx, "KARSO10").porcentaje = 12; // el panel lo cambió después de aplicarlo
    });
    const pedido = borrador(userId, 1000, { promociones: [aplicado(c, "KARSO10")] });
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido.promociones).toEqual([expect.objectContaining({ codigo: "KARSO10", porcentaje: 12, descuento: 120 })]);
    expect(pedido).toMatchObject({ subtotal: 1000, descuento: 120, baseIva: 880, tasaIva: 0, iva: 0, total: 880 });
  });

  it("con factura, IVA de la configuración: el ejemplo de KARSO da $755.86", async () => {
    const c = await contexto((ctx) => {
      promocion(ctx, "BUENFIN10").vigencia = { inicio: "2026-11-01T06:00:00Z", fin: "2030-12-31T05:59:59Z" };
    });
    const pedido = borrador(userId, 724, { requiereFactura: true, promociones: [aplicado(c, "BUENFIN10")] });
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido).toMatchObject({ subtotal: 724, descuento: 72.4, baseIva: 651.6, tasaIva: 0.16, iva: 104.26, total: 755.86 });
  });

  it("suma con tope: KARSO10 + MAYOREO25 sobre $1,000.00 → $300.00", async () => {
    const c = await contexto();
    const pedido = borrador(userId, 1000, { promociones: [aplicado(c, "KARSO10"), aplicado(c, "MAYOREO25")] });
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido.promociones.map((p) => p.descuento)).toEqual([100, 200]);
    expect(pedido.descuento).toBe(300);
  });

  it("un código vencido, inactivo o ya usado se quita con su aviso y el total se recalcula", async () => {
    const c = await contexto((ctx) => {
      promocion(ctx, "KARSO10").vigencia.fin = "2026-11-05T00:00:00Z";
      promocion(ctx, "MAYOREO25").activa = false;
    });
    const bienvenida = aplicado(c, "BIENVENIDA5");
    await userRepository.registrarUsosPromociones(userId, [
      { promocionId: bienvenida.promocionId, codigo: "BIENVENIDA5", pedidoId: "anterior", fecha: HOY.toISOString() },
    ]);
    const pedido = borrador(userId, 1000, {
      promociones: [aplicado(c, "KARSO10"), aplicado(c, "MAYOREO25"), bienvenida],
    });
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido.promociones).toEqual([]);
    expect(pedido).toMatchObject({ descuento: 0, total: 1000 });
    expect(pedido.avisos).toEqual([
      "El código KARSO10 ya no es válido: venció",
      "El código MAYOREO25 ya no es válido: ya no está disponible",
      "El código BIENVENIDA5 ya no es válido: ya lo usaste",
    ]);
  });

  it("si la configuración baja a 1 código, los de sobra se quitan con aviso", async () => {
    const c = await contexto((ctx) => {
      ctx.configuracion.promociones.maxCodigosPorPedido = 1;
    });
    const pedido = borrador(userId, 1000, { promociones: [aplicado(c, "KARSO10"), aplicado(c, "BIENVENIDA5")] });
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido.promociones.map((p) => p.codigo)).toEqual(["KARSO10"]);
    expect(pedido.avisos).toEqual(["El código BIENVENIDA5 ya no se aplica: solo se aceptan 1 códigos por pedido"]);
  });

  it("cascada desde la configuración: KARSO10 + BIENVENIDA5 sobre $1,000.00 → $100.00 + $45.00", async () => {
    const c = await contexto((ctx) => {
      ctx.configuracion.promociones.modoCombinacion = "cascada";
    });
    const pedido = borrador(userId, 1000, { promociones: [aplicado(c, "KARSO10"), aplicado(c, "BIENVENIDA5")] });
    await recalcularBorrador(pedido, c, HOY);
    expect(pedido.promociones.map((p) => p.descuento)).toEqual([100, 45]);
  });
});
