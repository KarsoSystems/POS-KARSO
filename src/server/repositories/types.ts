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
