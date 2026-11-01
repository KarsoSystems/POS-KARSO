import Busboy from "busboy";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

// Lectura de un archivo multipart en streaming: el contenido nunca se junta en
// memoria, se pasa trozo a trozo a `guardar` (p. ej. FileStorage.put).

export type RechazoMultipart =
  | "multipart_invalido" // sin cuerpo, sin boundary o cuerpo malformado
  | "sin_archivo" // no llegó el campo esperado
  | "no_permitido" // `aceptar` rechazó el nombre del archivo
  | "muy_grande"; // el contenido pasó de `maxBytes`

export type ResultadoMultipart<T> =
  | { ok: true; valor: T; nombre: string; bytes: number }
  | { ok: false; motivo: RechazoMultipart };

export interface OpcionesMultipart<T> {
  campo: string;
  maxBytes: number;
  /** Se llama con el nombre original antes de leer un solo byte del contenido. */
  aceptar(nombre: string): boolean;
  /** Recibe el contenido; si pasa de `maxBytes`, el stream falla y `guardar` debe rechazar. */
  guardar(nombre: string, contenido: ReadableStream<Uint8Array>): Promise<T>;
}

class ArchivoMuyGrandeError extends Error {}

/** Quita rutas ("C:\fakepath\a.jpg") y espacios del nombre que manda el navegador. */
function nombreLimpio(nombre: string): string {
  return nombre.split(/[\\/]/).pop()!.trim().slice(0, 255);
}

export function leerArchivoMultipart<T>(
  request: Request,
  opciones: OpcionesMultipart<T>,
): Promise<ResultadoMultipart<T>> {
  return new Promise((resolve, reject) => {
    let terminado = false;
    let cerrado = false;
    let entrada: Readable | null = null;
    // Al rechazar se deja de leer el cuerpo: no se espera a que llegue completo.
    const terminar = (resultado: ResultadoMultipart<T>) => {
      if (terminado) return;
      terminado = true;
      if (!resultado.ok) entrada?.destroy();
      resolve(resultado);
    };
    const fallar = (error: unknown) => {
      if (terminado) return;
      terminado = true;
      entrada?.destroy();
      reject(error);
    };

    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: Object.fromEntries(request.headers),
        defParamCharset: "utf8", // por defecto latin1: "diseño.pdf" llegaría como "diseÃ±o.pdf"
        limits: { files: 1, fields: 20, fieldSize: 1024 },
      });
    } catch {
      return terminar({ ok: false, motivo: "multipart_invalido" });
    }
    if (!request.body) return terminar({ ok: false, motivo: "multipart_invalido" });

    let guardado: Promise<void> | null = null;

    busboy.on("file", (campo, stream, info) => {
      if (campo !== opciones.campo || guardado) {
        stream.resume();
        return;
      }
      const nombre = nombreLimpio(info.filename ?? "");
      if (!nombre || !opciones.aceptar(nombre)) {
        stream.resume();
        return terminar({ ok: false, motivo: "no_permitido" });
      }

      let bytes = 0;
      const contador = new TransformStream<Uint8Array, Uint8Array>({
        transform(trozo, controller) {
          bytes += trozo.byteLength;
          if (bytes > opciones.maxBytes) controller.error(new ArchivoMuyGrandeError());
          else controller.enqueue(trozo);
        },
      });
      const contenido = (Readable.toWeb(stream) as ReadableStream<Uint8Array>).pipeThrough(contador);

      guardado = opciones.guardar(nombre, contenido).then(
        (valor) => {
          // El archivo suele ser la última parte; se responde al cerrar busboy.
          busboy.once("close", () => terminar({ ok: true, valor, nombre, bytes }));
          if (cerrado) terminar({ ok: true, valor, nombre, bytes });
        },
        (error) => {
          if (bytes > opciones.maxBytes) terminar({ ok: false, motivo: "muy_grande" });
          else if (terminado) return; // busboy ya reportó el cuerpo malformado
          else fallar(error); // p. ej. disco lleno: es un 500, no culpa del cliente
        },
      );
    });

    busboy.on("close", () => {
      cerrado = true;
      if (!guardado) terminar({ ok: false, motivo: "sin_archivo" });
    });
    busboy.on("error", () => terminar({ ok: false, motivo: "multipart_invalido" }));

    entrada = Readable.fromWeb(request.body as NodeReadableStream<Uint8Array>);
    entrada.on("error", () => terminar({ ok: false, motivo: "multipart_invalido" }));
    entrada.pipe(busboy);
  });
}
