import { createJsonArchivoRepository } from "./json-archivo-repository";
import { createJsonPedidoRepository } from "./json-pedido-repository";
import { createJsonUserRepository } from "./json-user-repository";
import { createJsonVerificationRepository } from "./json-verification-repository";
import type {
  ArchivoRepository,
  PedidoRepository,
  UserRepository,
  VerificationRepository,
} from "./types";

// Punto único donde se elige la implementación. Para Mongo, solo cambia esto.
export const userRepository: UserRepository = createJsonUserRepository();
export const verificationRepository: VerificationRepository = createJsonVerificationRepository();
export const archivoRepository: ArchivoRepository = createJsonArchivoRepository();
export const pedidoRepository: PedidoRepository = createJsonPedidoRepository();

export * from "./types";
