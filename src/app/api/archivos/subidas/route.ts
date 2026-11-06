import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  extensionPermitida,
  MENSAJE_ARCHIVO_GRANDE,
  MENSAJE_FORMATO_NO_PERMITIDO,
  MIME_POR_EXTENSION,
  solicitudSubidaSchema,
  TAMANO_MAXIMO_ARCHIVO_BYTES,
} from "@/lib/validation/pedidos";
import { requireSessionUser } from "@/server/auth/guards";
import { llaveTemporal, toPublicArchivo } from "@/server/domain/archivo";
import { apiError, parseBody } from "@/server/http/responses";
import { archivoRepository } from "@/server/repositories";
import { firmarSubida } from "@/server/storage/url-firmada";

// Paso 1 de 3 (SPEC 05): crea el archivo `pendiente` y devuelve la URL firmada a
// la que el navegador sube el binario con PUT. Nada del binario pasa por aquí.
export async function POST(request: Request) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const body = await parseBody(request, solicitudSubidaSchema);
  if (body.response) return body.response;
  const { nombre, bytes } = body.data;

  const extension = extensionPermitida(nombre);
  if (!extension) return apiError(415, "FORMATO_NO_PERMITIDO", MENSAJE_FORMATO_NO_PERMITIDO);
  if (bytes > TAMANO_MAXIMO_ARCHIVO_BYTES) return apiError(413, "ARCHIVO_MUY_GRANDE", MENSAJE_ARCHIVO_GRANDE);

  const id = randomUUID();
  const key = llaveTemporal({ id, extension });
  const archivo = await archivoRepository.create({
    id,
    userId: guard.user.id,
    nombreOriginal: nombre,
    extension,
    mime: MIME_POR_EXTENSION[extension],
    bytes,
    key,
    estado: "pendiente",
    metadatos: null,
    miniatura: false,
    subidoEn: null,
  });

  const { ruta, expiraEn } = firmarSubida(key, bytes);
  return NextResponse.json(
    { archivo: toPublicArchivo(archivo), subida: { url: new URL(ruta, request.url).toString(), metodo: "PUT", expiraEn } },
    { status: 201 },
  );
}
