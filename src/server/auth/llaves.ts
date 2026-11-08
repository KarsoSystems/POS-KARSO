import { exportJWK, importJWK, importPKCS8, importSPKI, type CryptoKey, type JWK } from "jose";

// Llaves de la sesión (SPEC 11; KARSO 2.1 a): RS256. La privada solo firma; las
// públicas verifican y se publican en /.well-known/jwks.json con su `kid`, para
// rotar sin cerrar sesiones de golpe. Las usa también el middleware (runtime
// edge): solo jose y WebCrypto, nada de node:*.

export const ALG = "RS256";

export class LlavesInvalidasError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "LlavesInvalidasError";
  }
}

export interface LlavePublica {
  kid: string;
  llave: CryptoKey;
  jwk: JWK; // solo kty, n, e (lista blanca)
}

interface Llaves {
  kid: string;
  privada: CryptoKey;
  publicas: LlavePublica[];
}

/** Un PEM en una sola línea (con "\n" escritos) o en varias. */
const pem = (valor: string) => valor.replace(/\\n/g, "\n").trim();

/** Lo público de un JWK RSA, sin `d`, `p`, `q`, `dp`, `dq` ni `qi`. */
const soloPublico = ({ kty, n, e }: JWK): JWK => ({ kty, n, e });

let cache: { clave: string; llaves: Promise<Llaves> } | null = null;

async function cargar(): Promise<Llaves> {
  const privadaPem = process.env.AUTH_PRIVATE_KEY;
  const kid = process.env.AUTH_KEY_ID?.trim();
  if (!privadaPem) throw new LlavesInvalidasError("AUTH_PRIVATE_KEY debe estar definida (genera una con pnpm generar-llaves)");
  if (!kid) throw new LlavesInvalidasError("AUTH_KEY_ID debe estar definida (el kid de la llave)");

  let privada: CryptoKey;
  try {
    privada = await importPKCS8(pem(privadaPem), ALG, { extractable: true });
  } catch {
    throw new LlavesInvalidasError("AUTH_PRIVATE_KEY debe ser una llave privada RSA en PEM (PKCS#8)");
  }
  const jwk = soloPublico(await exportJWK(privada));
  const publicas: LlavePublica[] = [{ kid, jwk, llave: (await importJWK(jwk, ALG)) as CryptoKey }];

  // La llave anterior (opcional) sigue verificando sus tokens hasta que venzan.
  const anteriorPem = process.env.AUTH_PUBLIC_KEY_ANTERIOR;
  const kidAnterior = process.env.AUTH_KEY_ID_ANTERIOR?.trim();
  if (anteriorPem) {
    if (!kidAnterior) throw new LlavesInvalidasError("AUTH_KEY_ID_ANTERIOR debe acompañar a AUTH_PUBLIC_KEY_ANTERIOR");
    if (kidAnterior === kid) throw new LlavesInvalidasError("AUTH_KEY_ID_ANTERIOR debe ser distinto de AUTH_KEY_ID");
    let llave: CryptoKey;
    try {
      llave = await importSPKI(pem(anteriorPem), ALG, { extractable: true });
    } catch {
      throw new LlavesInvalidasError("AUTH_PUBLIC_KEY_ANTERIOR debe ser una llave pública RSA en PEM (SPKI)");
    }
    publicas.push({ kid: kidAnterior, llave, jwk: soloPublico(await exportJWK(llave)) });
  }
  return { kid, privada, publicas };
}

/** Las llaves de las variables de entorno, importadas una vez (se recargan si las variables cambian). */
export function llaves(): Promise<Llaves> {
  const clave = [
    process.env.AUTH_PRIVATE_KEY,
    process.env.AUTH_KEY_ID,
    process.env.AUTH_PUBLIC_KEY_ANTERIOR,
    process.env.AUTH_KEY_ID_ANTERIOR,
  ].join("|");
  if (cache?.clave !== clave) {
    const promesa = cargar();
    cache = { clave, llaves: promesa };
    // Un error no se queda en caché: el siguiente intento vuelve a leer las variables.
    promesa.catch(() => {
      if (cache?.llaves === promesa) cache = null;
    });
  }
  return cache.llaves;
}

/** El JWKS público: `{ keys: [{ kty, n, e, kid, alg, use }] }`. */
export async function jwks(): Promise<{ keys: JWK[] }> {
  const { publicas } = await llaves();
  return { keys: publicas.map(({ kid, jwk }) => ({ ...jwk, kid, alg: ALG, use: "sig" })) };
}
