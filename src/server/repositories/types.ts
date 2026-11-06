import type { Archivo } from "@/server/domain/archivo";
import type { Pedido } from "@/server/domain/pedido";
import type { ImmutableUserField, NewUser, User, UsoPromocion } from "@/server/domain/user";
import type { WhatsappVerification } from "@/server/domain/verification";

// Contratos de persistencia. El demo usa JSON; después se agrega una
// implementación Mongo sin tocar los route handlers.

// Los usos de promociones se cambian solo con sus métodos, no con `update`.
export type UserPatch = Partial<Omit<User, ImmutableUserField | "usosPromociones">>;

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByCorreo(correo: string): Promise<User | null>;
  /** Asigna id, idCliente y fechas. Lanza CorreoDuplicadoError si el correo existe. */
  create(input: NewUser): Promise<User>;
  /** Lanza UsuarioNoEncontradoError o CorreoDuplicadoError. */
  update(id: string, patch: UserPatch): Promise<User>;
  /**
   * Usos de una promoción en pedidos no cancelados: de todos los clientes y de este.
   * Provisional (SPEC 06): el backend lo llevará en su propia colección.
   */
  contarUsosPromocion(promocionId: string, userId: string): Promise<{ totales: number; delCliente: number }>;
  /** Al hacer el pedido. Lanza UsuarioNoEncontradoError. */
  registrarUsosPromociones(userId: string, usos: UsoPromocion[]): Promise<void>;
  /** Al cancelar el pedido: sus códigos se pueden volver a usar. Lanza UsuarioNoEncontradoError. */
  liberarUsosPromociones(userId: string, pedidoId: string): Promise<void>;
}

export interface VerificationRepository {
  upsert(v: WhatsappVerification): Promise<void>;
  findByUserId(userId: string): Promise<WhatsappVerification | null>;
  delete(userId: string): Promise<void>;
}

export type ArchivoPatch = Partial<Pick<Archivo, "bytes" | "estado" | "metadatos" | "miniatura" | "subidoEn">>;

export interface ArchivoRepository {
  /** Guarda los datos del archivo; asigna createdAt. */
  create(input: Omit<Archivo, "createdAt">): Promise<Archivo>;
  findById(id: string): Promise<Archivo | null>;
  /** Lanza ArchivoNoEncontradoError. */
  update(id: string, patch: ArchivoPatch): Promise<Archivo>;
  delete(id: string): Promise<void>;
}

/**
 * Cambios a un pedido. Se aplican dentro del lock del almacén: si `cambiar`
 * lanza, no se guarda nada. id, userId, folio y createdAt no se pueden cambiar.
 */
export type CambiarPedido = (pedido: Pedido) => void | Promise<void>;

/** Como CambiarPedido, pero recibe el folio que se asignará si la confirmación sale bien. */
export type CambiarConfirmacion = (pedido: Pedido, folio: string) => void | Promise<void>;

export interface PedidoRepository {
  /** El borrador del usuario o null. Hay a lo más uno por usuario. */
  findBorrador(userId: string): Promise<Pedido | null>;
  /** Crea el borrador vacío del usuario; si ya existe, devuelve ese. */
  crearBorrador(userId: string): Promise<Pedido>;
  findById(id: string): Promise<Pedido | null>;
  /** Pedidos del usuario sin el borrador, recientes primero. */
  listByUser(userId: string): Promise<Pedido[]>;
  /** Lanza PedidoNoEncontradoError o lo que lance `cambiar`. */
  update(id: string, cambiar: CambiarPedido): Promise<Pedido>;
  /**
   * Aplica `cambiar` (p. ej. recalcular, validar y copiar los archivos a la carpeta
   * del folio) y confirma el borrador: asigna el folio siguiente, pasa a `pedido` y
   * fija confirmadoAt, todo en el mismo lock. Si `cambiar` lanza, el folio no se gasta.
   * Lanza PedidoNoEncontradoError, EstadoPedidoInvalidoError o lo que lance `cambiar`.
   */
  confirmar(id: string, cambiar?: CambiarConfirmacion): Promise<Pedido>;
}

export class PedidoNoEncontradoError extends Error {
  constructor(id: string) {
    super(`Pedido ${id} no encontrado`);
    this.name = "PedidoNoEncontradoError";
  }
}

export class EstadoPedidoInvalidoError extends Error {
  constructor(id: string, estado: string) {
    super(`El pedido ${id} está en estado ${estado}`);
    this.name = "EstadoPedidoInvalidoError";
  }
}

export class ArchivoNoEncontradoError extends Error {
  constructor(id: string) {
    super(`Archivo ${id} no encontrado`);
    this.name = "ArchivoNoEncontradoError";
  }
}

export class CorreoDuplicadoError extends Error {
  constructor(correo: string) {
    super(`El correo ${correo} ya está registrado`);
    this.name = "CorreoDuplicadoError";
  }
}

export class UsuarioNoEncontradoError extends Error {
  constructor(id: string) {
    super(`Usuario ${id} no encontrado`);
    this.name = "UsuarioNoEncontradoError";
  }
}
