import { createJsonUserRepository } from "./json-user-repository";
import { createJsonVerificationRepository } from "./json-verification-repository";
import type { UserRepository, VerificationRepository } from "./types";

// Punto único donde se elige la implementación. Para Mongo, solo cambia esto.
export const userRepository: UserRepository = createJsonUserRepository();
export const verificationRepository: VerificationRepository = createJsonVerificationRepository();

export * from "./types";
