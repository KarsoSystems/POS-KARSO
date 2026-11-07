import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZONA_HORARIA_TIENDA } from "@/lib/configuracion/schema";
import { anioEn, formatFolio } from "@/lib/pedidos/pago";
import { createJsonPedidoRepository } from "./json-pedido-repository";
import { EstatusPedidoInvalidoError, PedidoNoEncontradoError, type PedidoRepository } from "./types";

let dir: string;
let repo: PedidoRepository;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pedidos-"));
  repo = createJsonPedidoRepository(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const readOrders = async () => JSON.parse(await readFile(path.join(dir, "orders.json"), "utf8"));

// El folio usa el año de hoy en la zona de la tienda: "KAR-2026-000001".
const ANIO = anioEn(new Date(), ZONA_HORARIA_TIENDA);
const folio = (n: number) => formatFolio(ANIO, n);
const contador = async () => (await readOrders()).contadores[`pedidos-${ANIO}`] ?? 0;

describe("orders.json de versiones anteriores", () => {
  it.each([1, 2, 3, 4])("un archivo de versión %i se descarta y se reinicia vacío en la versión 5", async (version) => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const v1 = { version, ultimoFolio: 3, pedidos: [{ id: "viejo", userId: "u1", estado: "borrador", items: [] }] };
    await writeFile(path.join(dir, "orders.json"), JSON.stringify(v1));

    expect(await repo.findBorrador("u1")).toBeNull();
    expect(await readOrders()).toEqual({ version: 5, contadores: {}, pedidos: [] });
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`orders\\.json: versión ${version} descartada`)));
    aviso.mockRestore();
  });
});

describe("borrador", () => {
  it("crearBorrador crea un pedido vacío en borrador", async () => {
    const pedido = await repo.crearBorrador("u1");
    expect(pedido).toMatchObject({
      folio: null,
      userId: "u1",
      estatus: "borrador",
      historialEstatus: [],
      productos: [],
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
      confirmadoAt: null,
    });
    expect(await repo.findBorrador("u1")).toEqual(pedido);
    expect(await readOrders()).toEqual({ version: 5, contadores: {}, pedidos: [pedido] });
  });

  it("findBorrador devuelve null si el usuario no tiene", async () => {
    await repo.crearBorrador("u1");
    expect(await repo.findBorrador("u2")).toBeNull();
  });

  it("hay un solo borrador por usuario aunque se cree dos veces", async () => {
    const primero = await repo.crearBorrador("u1");
    const segundo = await repo.crearBorrador("u1");
    expect(segundo.id).toBe(primero.id);
    expect((await readOrders()).pedidos).toHaveLength(1);
  });

  it("hay un solo borrador por usuario con creaciones concurrentes", async () => {
    const creados = await Promise.all(Array.from({ length: 10 }, () => repo.crearBorrador("u1")));
    expect(new Set(creados.map((p) => p.id)).size).toBe(1);
    expect((await readOrders()).pedidos).toHaveLength(1);
  });

  it("después de confirmar, crearBorrador crea uno nuevo", async () => {
    const primero = await repo.crearBorrador("u1");
    await repo.confirmar(primero.id);
    expect(await repo.findBorrador("u1")).toBeNull();
    const nuevo = await repo.crearBorrador("u1");
    expect(nuevo.id).not.toBe(primero.id);
  });
});

describe("update", () => {
  it("aplica los cambios y actualiza updatedAt", async () => {
    const pedido = await repo.crearBorrador("u1");
    await new Promise((r) => setTimeout(r, 5));
    const actualizado = await repo.update(pedido.id, (p) => {
      p.estatus = "cancelado";
    });
    expect(actualizado.estatus).toBe("cancelado");
    expect(actualizado.updatedAt > pedido.updatedAt).toBe(true);
    expect((await repo.findById(pedido.id))?.estatus).toBe("cancelado");
  });

  it("no deja cambiar id, userId, folio ni createdAt", async () => {
    const pedido = await repo.crearBorrador("u1");
    const actualizado = await repo.update(pedido.id, (p) => {
      p.id = "otro";
      p.userId = "u2";
      p.folio = "P-999999";
      p.createdAt = "2000-01-01T00:00:00.000Z";
    });
    expect(actualizado).toMatchObject({
      id: pedido.id,
      userId: "u1",
      folio: null,
      createdAt: pedido.createdAt,
    });
  });

  it("si el cambio lanza, no se guarda nada", async () => {
    const pedido = await repo.crearBorrador("u1");
    await expect(
      repo.update(pedido.id, (p) => {
        p.estatus = "cancelado";
        throw new Error("no");
      }),
    ).rejects.toThrow("no");
    expect((await repo.findById(pedido.id))?.estatus).toBe("borrador");
  });

  it("un id inexistente lanza PedidoNoEncontradoError", async () => {
    await expect(repo.update("no-existe", () => {})).rejects.toBeInstanceOf(PedidoNoEncontradoError);
  });
});

describe("confirmar", () => {
  it("asigna KAR-<año>-000001, pasa a pago_pendiente y fija confirmadoAt", async () => {
    const borrador = await repo.crearBorrador("u1");
    const pedido = await repo.confirmar(borrador.id);
    expect(pedido).toMatchObject({ folio: `KAR-${ANIO}-000001`, estatus: "pago_pendiente" });
    expect(pedido.confirmadoAt).toBe(pedido.updatedAt);
    expect(await contador()).toBe(1);
  });

  it("un contador por año: el primero de 2027 (en la Ciudad de México) vuelve a 000001", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-12-31T23:30:00-06:00"));
      expect((await repo.confirmar((await repo.crearBorrador("u1")).id)).folio).toBe("KAR-2026-000001");
      expect((await repo.confirmar((await repo.crearBorrador("u2")).id)).folio).toBe("KAR-2026-000002");
      vi.setSystemTime(new Date("2027-01-01T00:10:00-06:00"));
      expect((await repo.confirmar((await repo.crearBorrador("u3")).id)).folio).toBe("KAR-2027-000001");
      expect((await readOrders()).contadores).toEqual({ "pedidos-2026": 2, "pedidos-2027": 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("el año sale de la zona horaria que se le pase", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2027-01-01T03:00:00Z")); // 31 dic 21:00 en CDMX, 1 ene en UTC
      const cdmx = await repo.confirmar((await repo.crearBorrador("u1")).id, undefined, { zonaHoraria: "America/Mexico_City" });
      const utc = await repo.confirmar((await repo.crearBorrador("u2")).id, undefined, { zonaHoraria: "UTC" });
      expect([cdmx.folio, utc.folio]).toEqual(["KAR-2026-000001", "KAR-2027-000001"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aplica los cambios en el mismo lock (p. ej. congelar totales)", async () => {
    const borrador = await repo.crearBorrador("u1");
    const pedido = await repo.confirmar(borrador.id, (p) => {
      p.subtotal = 2500;
    });
    expect(pedido.subtotal).toBe(2500);
  });

  it("el cambio recibe el folio que se va a asignar", async () => {
    await repo.confirmar((await repo.crearBorrador("u1")).id);
    const folios: string[] = [];
    const pedido = await repo.confirmar((await repo.crearBorrador("u2")).id, (_p, folio) => {
      folios.push(folio);
    });
    expect(folios).toEqual([folio(2)]);
    expect(pedido.folio).toBe(folio(2));
  });

  it("si el cambio lanza, no se confirma ni se gasta folio", async () => {
    const borrador = await repo.crearBorrador("u1");
    await expect(
      repo.confirmar(borrador.id, () => {
        throw new Error("vacío");
      }),
    ).rejects.toThrow("vacío");
    expect(await contador()).toBe(0);
    expect((await repo.findById(borrador.id))?.estatus).toBe("borrador");

    expect((await repo.confirmar(borrador.id)).folio).toBe(folio(1));
  });

  it("solo confirma borradores", async () => {
    const borrador = await repo.crearBorrador("u1");
    await repo.confirmar(borrador.id);
    await expect(repo.confirmar(borrador.id)).rejects.toBeInstanceOf(EstatusPedidoInvalidoError);
    expect(await contador()).toBe(1);
  });

  it("folios consecutivos y sin repetir con confirmaciones concurrentes", async () => {
    const borradores = await Promise.all(
      Array.from({ length: 8 }, (_, i) => repo.crearBorrador(`u${i}`)),
    );
    const confirmados = await Promise.all(borradores.map((b) => repo.confirmar(b.id)));

    const folios = confirmados.map((p) => p.folio).sort();
    expect(folios).toEqual(Array.from({ length: 8 }, (_, i) => folio(i + 1)));
    expect(await contador()).toBe(8);
  });
});

describe("findById y listByUser", () => {
  it("findById devuelve el pedido o null", async () => {
    const pedido = await repo.crearBorrador("u1");
    expect((await repo.findById(pedido.id))?.id).toBe(pedido.id);
    expect(await repo.findById("no-existe")).toBeNull();
  });

  it("lista solo los del usuario, sin el borrador, recientes primero", async () => {
    const primero = await repo.confirmar((await repo.crearBorrador("u1")).id);
    await new Promise((r) => setTimeout(r, 5));
    const segundo = await repo.confirmar((await repo.crearBorrador("u1")).id);
    await repo.crearBorrador("u1"); // borrador actual
    await repo.confirmar((await repo.crearBorrador("u2")).id); // de otro usuario

    const lista = await repo.listByUser("u1");
    expect(lista.map((p) => p.folio)).toEqual([segundo.folio, primero.folio]);
  });
});
