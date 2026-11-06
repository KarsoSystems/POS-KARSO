import { apiError } from "@/server/http/responses";
import { fileStorage } from "@/server/storage";
import { verificarSubida } from "@/server/storage/url-firmada";

// Paso 2 de 3 (SPEC 05): "R2 local". Recibe el binario con PUT en la URL firmada,
// sin sesión (la firma autoriza), y lo guarda en streaming contando bytes. En
// producción esta ruta no existe: el navegador sube directo a R2.

class ExcesoDeBytesError extends Error {}

/** Deja pasar el contenido y falla en cuanto pasa de `maximo` bytes. */
function contarBytes(maximo: number): TransformStream<Uint8Array, Uint8Array> {
  let total = 0;
  return new TransformStream({
    transform(trozo, controller) {
      total += trozo.byteLength;
      if (total > maximo) controller.error(new ExcesoDeBytesError());
      else controller.enqueue(trozo);
    },
  });
}

const masDeLoDeclarado = () => apiError(413, "ARCHIVO_MUY_GRANDE", "El archivo pesa más de lo declarado");

export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  const firmada = verificarSubida(key, new URL(request.url).searchParams);
  if (!firmada) return apiError(403, "FIRMA_INVALIDA", "La URL de subida no es válida o ya venció");

  // Se rechaza antes de leer un solo byte del cuerpo.
  if (Number(request.headers.get("content-length")) > firmada.bytes) return masDeLoDeclarado();

  const cuerpo = request.body ?? new Blob([]).stream();
  try {
    await fileStorage.put(key, cuerpo.pipeThrough(contarBytes(firmada.bytes)));
  } catch (error) {
    if (error instanceof ExcesoDeBytesError) return masDeLoDeclarado();
    throw error;
  }
  return new Response(null, { status: 200 });
}
