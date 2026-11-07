import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatIdCliente, toPublicUser, type NewUser } from "@/server/domain/user";
import type { WhatsappVerification } from "@/server/domain/verification";
import { createJsonUserRepository } from "./json-user-repository";
import { createJsonVerificationRepository } from "./json-verification-repository";
import { CorreoDuplicadoError, UsuarioNoEncontradoError } from "./types";

const nuevoUsuario = (correo: string): NewUser => ({
  nombre: "Ana",
  apellidoPaterno: "López",
  apellidoMaterno: "García",
  whatsapp: "+525512345678",
  correo,
  passwordHash: "$2a$10$hash",
  providers: ["password"],
  whatsappVerificado: false,
  correoVerificado: false,
  estado: "verificacion_pendiente",
});

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "repos-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const readJson = async (file: string) => JSON.parse(await readFile(path.join(dir, file), "utf8"));

describe("formatIdCliente", () => {
  it("rellena a 6 dígitos", () => {
    expect(formatIdCliente(1)).toBe("CLI-000001");
    expect(formatIdCliente(123)).toBe("CLI-000123");
  });
});

describe("toPublicUser", () => {
  it("quita passwordHash y los usos de promociones; deja los datos fiscales", async () => {
    const repo = createJsonUserRepository(dir);
    const user = await repo.create(nuevoUsuario("ana@ejemplo.com"));
    expect(toPublicUser(user)).not.toHaveProperty("passwordHash");
    expect(toPublicUser(user)).not.toHaveProperty("usosPromociones");
    expect(toPublicUser(user)).toHaveProperty("datosFiscales", null);
  });
});

describe("JsonUserRepository", () => {
  it("dos create producen CLI-000001 y CLI-000002", async () => {
    const repo = createJsonUserRepository(dir);
    const a = await repo.create(nuevoUsuario("a@ejemplo.com"));
    const b = await repo.create(nuevoUsuario("b@ejemplo.com"));
    expect(a.idCliente).toBe("CLI-000001");
    expect(b.idCliente).toBe("CLI-000002");
    expect(await readJson("counters.json")).toEqual({ version: 1, idCliente: 2 });
  });

  it("asigna un UUID y fechas ISO", async () => {
    const repo = createJsonUserRepository(dir);
    const user = await repo.create(nuevoUsuario("a@ejemplo.com"));
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
    expect(user.updatedAt).toBe(user.createdAt);
  });

  it("persiste en users.json con versión 3: ocasional, sin dirección, negocio, datos fiscales ni usos de promociones", async () => {
    const repo = createJsonUserRepository(dir);
    const user = await repo.create(nuevoUsuario("a@ejemplo.com"));
    expect(user).toMatchObject({ tipo: "ocasional", direccion: null, nombreNegocio: null, datosFiscales: null, usosPromociones: [] });
    expect(await readJson("users.json")).toEqual({ version: 3, users: [user] });
  });

  it("migra un users.json de la versión 1 sin perder usuarios", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const anterior = createJsonUserRepository(dir);
    const user = await anterior.create(nuevoUsuario("ana@ejemplo.com"));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { datosFiscales, usosPromociones, tipo, direccion, nombreNegocio, ...v1 } = user;
    await writeFile(path.join(dir, "users.json"), JSON.stringify({ version: 1, users: [v1] }));

    const repo = createJsonUserRepository(dir);
    expect(await repo.findByCorreo("ana@ejemplo.com")).toEqual(user);
    expect(await readJson("users.json")).toEqual({ version: 3, users: [user] });
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/users\.json: versión 1 migrada a la versión 3/));
    aviso.mockRestore();
  });

  it("migra un users.json de la versión 2 conservando datos fiscales y usos de promociones", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const anterior = createJsonUserRepository(dir);
    const creado = await anterior.create(nuevoUsuario("ana@ejemplo.com"));
    const uso = { promocionId: "p1", codigo: "KARSO10", pedidoId: "pedido-1", fecha: "2026-11-06T18:00:00Z" };
    const user = { ...creado, usosPromociones: [uso] };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tipo, direccion, nombreNegocio, ...v2 } = user;
    await writeFile(path.join(dir, "users.json"), JSON.stringify({ version: 2, users: [v2] }));

    const repo = createJsonUserRepository(dir);
    expect(await repo.findById(user.id)).toEqual(user);
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/users\.json: versión 2 migrada a la versión 3/));
    aviso.mockRestore();
  });

  it("usos de promociones: se registran, se cuentan por cliente y en total, y se liberan por pedido", async () => {
    const repo = createJsonUserRepository(dir);
    const ana = await repo.create(nuevoUsuario("ana@ejemplo.com"));
    const beto = await repo.create(nuevoUsuario("beto@ejemplo.com"));
    const uso = (pedidoId: string, promocionId = "p1") => ({ promocionId, codigo: "KARSO10", pedidoId, fecha: "2026-11-06T18:00:00Z" });

    await repo.registrarUsosPromociones(ana.id, [uso("pedido-1"), uso("pedido-1", "p2")]);
    await repo.registrarUsosPromociones(beto.id, [uso("pedido-2")]);
    expect(await repo.contarUsosPromocion("p1", ana.id)).toEqual({ totales: 2, delCliente: 1 });
    expect(await repo.contarUsosPromocion("p2", beto.id)).toEqual({ totales: 1, delCliente: 0 });

    await repo.liberarUsosPromociones(ana.id, "pedido-1");
    expect(await repo.contarUsosPromocion("p1", ana.id)).toEqual({ totales: 1, delCliente: 0 });
    expect((await repo.findById(ana.id))?.usosPromociones).toEqual([]);
    await expect(repo.registrarUsosPromociones("nadie", [uso("x")])).rejects.toBeInstanceOf(UsuarioNoEncontradoError);
  });

  it("un correo duplicado falla aunque cambien las mayúsculas, sin consumir consecutivo", async () => {
    const repo = createJsonUserRepository(dir);
    await repo.create(nuevoUsuario("ana@ejemplo.com"));
    await expect(repo.create(nuevoUsuario("ANA@Ejemplo.com"))).rejects.toBeInstanceOf(
      CorreoDuplicadoError,
    );
    const otro = await repo.create(nuevoUsuario("otra@ejemplo.com"));
    expect(otro.idCliente).toBe("CLI-000002");
  });

  it("creates concurrentes reciben consecutivos únicos", async () => {
    const repo = createJsonUserRepository(dir);
    const users = await Promise.all(
      Array.from({ length: 20 }, (_, i) => repo.create(nuevoUsuario(`u${i}@ejemplo.com`))),
    );
    expect(new Set(users.map((u) => u.idCliente)).size).toBe(20);
  });

  it("findById y findByCorreo (sin importar mayúsculas)", async () => {
    const repo = createJsonUserRepository(dir);
    const user = await repo.create(nuevoUsuario("ana@ejemplo.com"));
    expect(await repo.findById(user.id)).toEqual(user);
    expect(await repo.findByCorreo(" ANA@ejemplo.com ")).toEqual(user);
    expect(await repo.findById("no-existe")).toBeNull();
    expect(await repo.findByCorreo("nadie@ejemplo.com")).toBeNull();
  });

  it("update aplica el patch y actualiza updatedAt", async () => {
    const repo = createJsonUserRepository(dir);
    const user = await repo.create(nuevoUsuario("ana@ejemplo.com"));
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(user.id, { estado: "activo", whatsappVerificado: true });
    expect(updated.estado).toBe("activo");
    expect(updated.whatsappVerificado).toBe(true);
    expect(updated.updatedAt > user.updatedAt).toBe(true);
    expect(await repo.findById(user.id)).toEqual(updated);
  });

  it("update ignora id, idCliente y createdAt", async () => {
    const repo = createJsonUserRepository(dir);
    const user = await repo.create(nuevoUsuario("ana@ejemplo.com"));
    const patch = { id: "otro", idCliente: "CLI-999999", createdAt: "2000-01-01T00:00:00.000Z" };
    const updated = await repo.update(user.id, patch as never);
    expect(updated.id).toBe(user.id);
    expect(updated.idCliente).toBe(user.idCliente);
    expect(updated.createdAt).toBe(user.createdAt);
  });

  it("update rechaza un correo de otro usuario", async () => {
    const repo = createJsonUserRepository(dir);
    await repo.create(nuevoUsuario("a@ejemplo.com"));
    const b = await repo.create(nuevoUsuario("b@ejemplo.com"));
    await expect(repo.update(b.id, { correo: "A@ejemplo.com" })).rejects.toBeInstanceOf(
      CorreoDuplicadoError,
    );
  });

  it("update de un id inexistente lanza UsuarioNoEncontradoError", async () => {
    const repo = createJsonUserRepository(dir);
    await expect(repo.update("no-existe", { nombre: "X" })).rejects.toBeInstanceOf(
      UsuarioNoEncontradoError,
    );
  });
});

describe("JsonVerificationRepository", () => {
  const verificacion = (userId: string, codigo: string): WhatsappVerification => ({
    userId,
    whatsapp: "+528112345678",
    codigo,
    expiresAt: "2026-10-30T12:10:00.000Z",
    intentos: 0,
    ultimoEnvio: "2026-10-30T12:00:00.000Z",
  });

  it("upsert crea y reemplaza por userId", async () => {
    const repo = createJsonVerificationRepository(dir);
    await repo.upsert(verificacion("u1", "111111"));
    await repo.upsert(verificacion("u1", "222222"));
    await repo.upsert(verificacion("u2", "333333"));
    expect((await repo.findByUserId("u1"))?.codigo).toBe("222222");
    expect((await readJson("verifications.json")).items).toHaveLength(2);
  });

  it("un verifications.json de la versión 1 se descarta (códigos temporales)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeFile(path.join(dir, "verifications.json"), JSON.stringify({ version: 1, items: [{ userId: "u1", codigo: "111111" }] }));
    const repo = createJsonVerificationRepository(dir);
    expect(await repo.findByUserId("u1")).toBeNull();
    expect(await readJson("verifications.json")).toEqual({ version: 2, items: [] });
    aviso.mockRestore();
  });

  it("findByUserId devuelve null si no hay", async () => {
    const repo = createJsonVerificationRepository(dir);
    expect(await repo.findByUserId("u1")).toBeNull();
  });

  it("delete elimina solo la del usuario", async () => {
    const repo = createJsonVerificationRepository(dir);
    await repo.upsert(verificacion("u1", "111111"));
    await repo.upsert(verificacion("u2", "222222"));
    await repo.delete("u1");
    expect(await repo.findByUserId("u1")).toBeNull();
    expect(await repo.findByUserId("u2")).not.toBeNull();
  });
});
