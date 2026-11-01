import { FileText } from "lucide-react";
import { urlArchivo, type PublicArchivo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

/** JPG/PNG: la imagen. PDF, AI y PSD: un ícono con el nombre del archivo. */
export function MiniaturaArchivo({ archivo, className }: { archivo: PublicArchivo | undefined; className?: string }) {
  const caja = cn("flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted", className);
  if (archivo?.previsualizable) {
    return (
      <div className={caja}>
        {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la API, no por next/image */}
        <img src={urlArchivo(archivo.id)} alt={archivo.nombreOriginal} className="size-full object-contain" />
      </div>
    );
  }
  return (
    <div className={cn(caja, "flex-col gap-1 p-1")} title={archivo?.nombreOriginal}>
      <FileText className="size-5 text-muted-foreground" aria-hidden />
      <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
        {archivo ? archivo.extension.toUpperCase() : "—"}
      </span>
    </div>
  );
}
