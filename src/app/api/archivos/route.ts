import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  esPrevisualizable,
  extensionPermitida,
  MENSAJE_ARCHIVO_GRANDE,
  MENSAJE_FORMATO_NO_PERMITIDO,
  MIME_POR_EXTENSION,
  TAMANO_MAXIMO_ARCHIVO_BYTES,
} from "@/lib/validation/pedidos";
import { requireSessionUser } from "@/server/auth/guards";
import { archivoKey, toPublicArchivo } from "@/server/domain/archivo";
import { leerArchivoMultipart } from "@/server/http/multipart";
import { apiError } from "@/server/http/responses";
import { archivoRepository } from "@/server/repositories";
import { fileStorage } from "@/server/storage";

// Margen para boundaries y encabezados del multipart: un archivo de 50 MB exactos
// llega en un cuerpo un poco mayor. El límite real se cuenta sobre el contenido.
const MARGEN_MULTIPART_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  // Se rechaza antes de leer un solo byte del cuerpo.
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > TAMANO_MAXIMO_ARCHIVO_BYTES + MARGEN_MULTIPART_BYTES) {
    return apiError(413, "ARCHIVO_MUY_GRANDE", MENSAJE_ARCHIVO_GRANDE);
  }

  const id = randomUUID();
  const resultado = await leerArchivoMultipart(request, {
    campo: "archivo",
    maxBytes: TAMANO_MAXIMO_ARCHIVO_BYTES,
    aceptar: (nombre) => extensionPermitida(nombre) !== null,
    guardar: async (nombre, contenido) => {
      const extension = extensionPermitida(nombre)!;
      await fileStorage.put(archivoKey({ id, extension }), contenido);
      return extension;
    },
  });

  if (!resultado.ok) {
    switch (resultado.motivo) {
      case "muy_grande":
        return apiError(413, "ARCHIVO_MUY_GRANDE", MENSAJE_ARCHIVO_GRANDE);
      case "no_permitido":
        return apiError(415, "FORMATO_NO_PERMITIDO", MENSAJE_FORMATO_NO_PERMITIDO);
      case "sin_archivo":
        return apiError(422, "VALIDACION", "Elige un archivo", { archivo: "Elige un archivo" });
      case "multipart_invalido":
        return apiError(400, "MULTIPART_INVALIDO", "No se pudo leer el archivo enviado");
    }
  }

  const extension = resultado.valor;
  try {
    const archivo = await archivoRepository.create({
      id,
      userId: guard.user.id,
      nombreOriginal: resultado.nombre,
      extension,
      mime: MIME_POR_EXTENSION[extension],
      bytes: resultado.bytes,
      previsualizable: esPrevisualizable(extension),
    });
    return NextResponse.json({ archivo: toPublicArchivo(archivo) }, { status: 201 });
  } catch (error) {
    // Sin registro el binario queda huérfano: se borra.
    await fileStorage.delete(archivoKey({ id, extension }));
    throw error;
  }
}
