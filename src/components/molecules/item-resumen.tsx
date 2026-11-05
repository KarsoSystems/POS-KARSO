import { AlertTriangle } from "lucide-react";
import { MiniaturaArchivo } from "@/components/molecules/miniatura-archivo";
import { etiquetasItem, formatearMxn, formatearNumero } from "@/lib/pedidos/formato";
import type { Catalogo, PublicArchivo, Subpedido } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

interface ItemResumenProps {
  item: Subpedido;
  archivo: PublicArchivo | undefined;
  catalogo: Catalogo;
  /** Botones (editar, quitar) en la esquina. */
  acciones?: React.ReactNode;
  /** Contenido extra debajo (p. ej. la vista previa en el detalle). */
  children?: React.ReactNode;
  className?: string;
}

/** Un ítem del pedido: archivo, producto, medidas, papel, hoja, cantidad, hojas y subtotal. */
export function ItemResumen({ item, archivo, catalogo, acciones, children, className }: ItemResumenProps) {
  const etiquetas = etiquetasItem(catalogo, item);
  const { hojas, subtotalCentavos } = item.presupuesto;

  return (
    <li className={cn("space-y-3 rounded-lg border bg-card p-4", className)} aria-label={`${etiquetas.producto}: ${archivo?.nombreOriginal ?? ""}`}>
      <div className="flex gap-3">
        <MiniaturaArchivo archivo={archivo} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{etiquetas.producto}</p>
              <p className="truncate text-sm text-muted-foreground" title={archivo?.nombreOriginal}>
                {archivo?.nombreOriginal ?? "Archivo no disponible"}
              </p>
            </div>
            {acciones && <div className="flex shrink-0 gap-1">{acciones}</div>}
          </div>
          <p className="text-sm">
            {etiquetas.tamano} · {etiquetas.papel} · Hoja {etiquetas.hoja}
          </p>
          {item.descripcion && <p className="text-sm break-words text-muted-foreground">{item.descripcion}</p>}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Cantidad</dt>
          <dd className="tabular-nums">{formatearNumero(item.cantidad)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hojas</dt>
          <dd className="tabular-nums">{formatearNumero(hojas)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-medium tabular-nums">{formatearMxn(subtotalCentavos)}</dd>
        </div>
      </dl>

      {item.problema && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {item.problema}. Edita el ítem para corregirlo.
        </p>
      )}

      {children}
    </li>
  );
}
