import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth/guards";
import { llaveMiniatura, toPublicArchivo } from "@/server/domain/archivo";
import { procesarArchivo } from "@/server/archivos/procesar";
import { apiError } from "@/server/http/responses";
import { archivoRepository } from "@/server/repositories";
import { fileStorage } from "@/server/storage";

// Paso 3 de 3 (SPEC 05): el servidor lee el binario que llegó al almacenamiento,
// extrae sus metadatos, genera la miniatura y deja el archivo `subido`.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { id } = await params;
  const archivo = await archivoRepository.findById(id);
  // Un archivo de otro usuario responde igual que uno inexistente.
  if (!archivo || archivo.userId !== guard.user.id) return apiError(404, "NO_ENCONTRADO", "El archivo no existe");
  if (archivo.estado === "subido") return NextResponse.json({ archivo: toPublicArchivo(archivo) });

  const stream = await fileStorage.get(archivo.key);
  if (!stream) return apiError(409, "ARCHIVO_NO_SUBIDO", "El archivo no llegó; vuelve a subirlo");
  // ≤ 40 MB: el PUT firmado no deja pasar más de lo declarado.
  const contenido = Buffer.from(await new Response(stream).arrayBuffer());

  const { metadatos, miniatura } = await procesarArchivo(archivo.extension, contenido);
  if (miniatura) await fileStorage.put(llaveMiniatura(archivo.key), new Blob([new Uint8Array(miniatura)]).stream());

  const subido = await archivoRepository.update(archivo.id, {
    bytes: contenido.byteLength,
    estado: "subido",
    metadatos,
    miniatura: miniatura !== null,
    subidoEn: new Date().toISOString(),
  });
  return NextResponse.json({ archivo: toPublicArchivo(subido) });
}
