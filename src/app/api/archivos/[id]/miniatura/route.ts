import { requireSessionUser } from "@/server/auth/guards";
import { llaveMiniatura } from "@/server/domain/archivo";
import { apiError } from "@/server/http/responses";
import { archivoRepository } from "@/server/repositories";
import { fileStorage } from "@/server/storage";

const noEncontrada = () => apiError(404, "NO_ENCONTRADO", "La miniatura no existe");

/** Miniatura JPG en sRGB del archivo, solo al dueño (SPEC 05). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionUser("activo");
  if (guard.response) return guard.response;

  const { id } = await params;
  const archivo = await archivoRepository.findById(id);
  if (!archivo || archivo.userId !== guard.user.id || !archivo.miniatura) return noEncontrada();

  const contenido = await fileStorage.get(llaveMiniatura(archivo.key));
  if (!contenido) return noEncontrada();

  return new Response(contenido, {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
}
