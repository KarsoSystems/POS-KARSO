import type { Archivo } from "@/server/domain/archivo";
import type { Pedido } from "@/server/domain/pedido";
import type { ImmutableUserField, NewUser, User } from "@/server/domain/user";
import type { WhatsappVerification } from "@/server/domain/verification";

// Contratos de persistencia. El demo usa JSON; después se agrega una
// implementación Mongo sin tocar los route handlers.

export type UserPatch = Partial<Omit<User, ImmutableUserField>>;

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByCorreo(correo: string): Promise<User | null>;
  /** Asigna id, idCliente y fechas. Lanza CorreoDuplicadoError si el correo existe. */
  create(input: NewUser): Promise<User>;
  /** Lanza UsuarioNoEncontradoError o CorreoDuplicadoError. */
  update(id: string, patch: UserPatch): Promise<User>;
}

export interface VerificationRepository {
  upsert(v: WhatsappVerification): Promise<void>;
  findByUserId(userId: string): Promise<WhatsappVerification | null>;
  delete(userId: string): Promise<void>;
}

export interface ArchivoRepository {
  /** Guarda los datos del archivo ya escrito en el almacenamiento; asigna createdAt. */
  create(input: Omit<Archivo, "createdAt">): Promise<Archivo>;
  findById(id: string): Promise<Archivo | null>;
  delete(id: string): Promise<void>;
}

/**
 * Cambios a un pedido. Se aplican dentro del lock del almacén: si `cambiar`
 * lanza, no se guarda nada. id, userId, folio y createdAt no se pueden cambiar.
 */
export type CambiarPedido = (pedido: Pedido) => void | Promise<void>;

export interface PedidoRepository {
  /** El borrador del usuario o null. Hay a lo más uno por usuario. */
  findBorrador(userId: string): Promise<Pedido | null>;
  /** Crea el borrador vacío del usuario; si ya existe, devuelve ese. */
  crearBorrador(userId: string, tasaIva: number): Promise<Pedido>;
  findById(id: string): Promise<Pedido | null>;
  /** Pedidos del usuario sin el borrador, recientes primero. */
  listByUser(userId: string): Promise<Pedido[]>;
  /** Lanza PedidoNoEncontradoError o lo que lance `cambiar`. */
  update(id: string, cambiar: CambiarPedido): Promise<Pedido>;
  /**
   * Aplica `cambiar` (p. ej. recalcular y validar) y confirma el borrador: asigna
   * el folio siguiente, pasa a `pedido` y fija confirmadoAt, todo en el mismo lock.
   * Lanza PedidoNoEncontradoError, EstadoPedidoInvalidoError o lo que lance `cambiar`.
   */
  confirmar(id: string, cambiar?: CambiarPedido): Promise<Pedido>;
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
