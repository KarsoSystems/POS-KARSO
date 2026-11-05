import { MiniaturaArchivo } from "@/components/molecules/miniatura-archivo";
import type { MedidaLinea } from "@/lib/pedidos/cotizacion";
import { formatearCm, textoMedida } from "@/lib/pedidos/formato";
import type { PublicArchivo } from "@/lib/pedidos-api";

interface ResumenPiezaProps {
  archivo: PublicArchivo | undefined;
  medida: MedidaLinea;
  /** Rebase de la variante en su unidad (0 = sin rebase). */
  rebase?: number;
}

/**
 * Miniatura del archivo y medida de la pieza: "8.7 × 5 cm · rebase 0.3 cm" o
 * "2.00 × 1.50 m · 3.00 m²". Reemplaza a la vista previa de la hoja de la SPEC 02.
 */
export function ResumenPieza({ archivo, medida, rebase = 0 }: ResumenPiezaProps) {
  const conRebase = rebase > 0 ? ` · rebase ${formatearCm(rebase)} ${medida.unidad}` : "";
  return (
    <div className="flex items-center gap-3">
      <MiniaturaArchivo archivo={archivo} />
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">{archivo?.nombreOriginal ?? "Sin archivo"}</p>
        <p className="text-muted-foreground" data-testid="medida-pieza">
          {textoMedida(medida)}
          {conRebase}
        </p>
      </div>
    </div>
  );
}
