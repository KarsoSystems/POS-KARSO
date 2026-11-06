// Almacenamiento de binarios (archivos de los clientes). El demo usa disco local;
// después se agrega una implementación S3 sin tocar los endpoints.

export interface FileStorage {
  /** Guarda el contenido completo bajo `key`. Si falla, no deja nada guardado. */
  put(key: string, data: ReadableStream<Uint8Array>): Promise<void>;
  /** Devuelve el contenido o `null` si no existe. */
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Copia el contenido de `origen` a `destino` (como CopyObject de R2). Lanza si `origen` no existe. */
  copy(origen: string, destino: string): Promise<void>;
  /** Borra el contenido; no falla si no existe. */
  delete(key: string): Promise<void>;
}

/**
 * Llaves seguras, como las de R2: carpetas separadas por "/" ("temporal/<id>.jpg",
 * "pedidos/P-000001/<linea>_frente.jpg"); cada tramo solo con letras, números,
 * guion, guion bajo y punto, sin "..", sin "/" al inicio ni tramos vacíos.
 */
export function assertKeyValida(key: string): void {
  if (!/^[\w-]+(\.[\w-]+)*(\/[\w-]+(\.[\w-]+)*)*$/.test(key)) {
    throw new Error(`Llave de archivo inválida: "${key}"`);
  }
}
