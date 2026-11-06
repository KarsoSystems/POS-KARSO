import { requireSessionUser } from "@/server/auth/guards";
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
  // Uno pendiente aún no tiene binario confirmado.
  if (!archivo || archivo.userId !== guard.user.id || archivo.estado !== "subido") return noEncontrado();

  const contenido = await fileStorage.get(archivo.key);
  if (!contenido) return noEncontrado();

  // Solo JPG se ve en línea; TIFF, PDF, AI, EPS y SVG siempre se descargan (un SVG
  // en línea ejecutaría sus scripts en nuestro origen).
  const disposicion = archivo.mime === "image/jpeg" ? "inline" : "attachment";
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
