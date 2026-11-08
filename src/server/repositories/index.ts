import { createJsonArchivoRepository } from "./json-archivo-repository";
import { createJsonPedidoRepository } from "./json-pedido-repository";
import { createJsonSesionRepository } from "./json-sesion-repository";
import { createJsonUserRepository } from "./json-user-repository";
import { createJsonVerificationRepository } from "./json-verification-repository";
import type {
  ArchivoRepository,
  PedidoRepository,
  SesionRepository,
  UserRepository,
  VerificationRepository,
} from "./types";

// Punto único donde se elige la implementación. Para Mongo, solo cambia esto.
export const userRepository: UserRepository = createJsonUserRepository();
export const verificationRepository: VerificationRepository = createJsonVerificationRepository();
export const archivoRepository: ArchivoRepository = createJsonArchivoRepository();
export const pedidoRepository: PedidoRepository = createJsonPedidoRepository();
export const sesionRepository: SesionRepository = createJsonSesionRepository();

export * from "./types";
