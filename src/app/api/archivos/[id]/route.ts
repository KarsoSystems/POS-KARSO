import { requireSessionUser } from "@/server/auth/guards";
import { archivoKey } from "@/server/domain/archivo";
import { apiError } from "@/server/http/responses";
import { archivoRepository } from "@/server/repositories";
import { fileStorage } from "@/server/storage";

const noEncontrado = () => apiError(404, "NO_ENCONTRADO", "El archivo no existe");

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { id } = await params;
  const archivo = await archivoRepository.findById(id);
  // Un archivo de otro usuario responde igual que uno inexistente.
  if (!archivo || archivo.userId !== guard.user.id) return noEncontrado();

  const contenido = await fileStorage.get(archivoKey(archivo));
  if (!contenido) return noEncontrado();

  // JPG/PNG se ven en línea (<img>); PDF, AI y PSD siempre se descargan.
  const disposicion = archivo.previsualizable ? "inline" : "attachment";
  return new Response(contenido, {
    headers: {
      "content-type": archivo.mime, // fijo por extensión, nunca el del navegador
      "content-length": String(archivo.bytes),
      "content-disposition": `${disposicion}; filename*=UTF-8''${encodeURIComponent(archivo.nombreOriginal)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
}
