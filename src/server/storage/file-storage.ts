// Almacenamiento de binarios (archivos de los clientes). El demo usa disco local;
// después se agrega una implementación S3 sin tocar los endpoints.

export interface FileStorage {
  /** Guarda el contenido completo bajo `key`. Si falla, no deja nada guardado. */
  put(key: string, data: ReadableStream<Uint8Array>): Promise<void>;
  /** Devuelve el contenido o `null` si no existe. */
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Borra el contenido; no falla si no existe. */
  delete(key: string): Promise<void>;
}

/** Llaves seguras: solo letras, números, guion, guion bajo y punto, sin "..". */
export function assertKeyValida(key: string): void {
  if (!/^[\w-]+(\.[\w-]+)*$/.test(key)) {
    throw new Error(`Llave de archivo inválida: "${key}"`);
  }
}
