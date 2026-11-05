import { AlertTriangle } from "lucide-react";
import { CotizacionLinea } from "@/components/molecules/cotizacion-linea";
import { MiniaturaArchivo } from "@/components/molecules/miniatura-archivo";
import { etiquetaAtributo } from "@/lib/catalogo/atributos";
import { textoMedida } from "@/lib/pedidos/formato";
import type { LineaPedido, PublicArchivo } from "@/lib/pedidos-api";
import { cn } from "@/lib/utils";

interface ItemResumenProps {
  linea: LineaPedido;
  archivo: PublicArchivo | undefined;
  /** Botones (editar, quitar) en la esquina. */
  acciones?: React.ReactNode;
  /** Contenido extra debajo. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Una línea del pedido: archivo, producto y variante con atributos y SKU, medida,
 * y el desglose de KARSO 5.4 (base + acabados = importe unitario × cantidad = subtotal).
 */
export function ItemResumen({ linea, archivo, acciones, children, className }: ItemResumenProps) {
  return (
    <li
      className={cn("space-y-3 rounded-lg border bg-card p-4", className)}
      aria-label={`${linea.nombre}: ${archivo?.nombreOriginal ?? ""}`}
    >
      <div className="flex gap-3">
        <MiniaturaArchivo archivo={archivo} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {linea.nombre} · {linea.variante}
              </p>
              <p className="truncate text-sm text-muted-foreground" title={archivo?.nombreOriginal}>
                {archivo?.nombreOriginal ?? "Archivo no disponible"}
              </p>
            </div>
            {acciones && <div className="flex shrink-0 gap-1">{acciones}</div>}
          </div>
          <p className="text-sm text-muted-foreground">
            {Object.entries(linea.atributos)
              .map(([llave, valor]) => `${etiquetaAtributo(llave)}: ${valor}`)
              .join(" · ")}
          </p>
          <p className="text-sm">
            {textoMedida(linea.medida)} · <span className="text-muted-foreground">SKU {linea.sku}</span>
          </p>
          {linea.descripcion && <p className="text-sm break-words text-muted-foreground">{linea.descripcion}</p>}
        </div>
      </div>

      <CotizacionLinea
        cotizacion={linea}
        cantidad={linea.cantidad}
        volumen={linea.volumen}
        piezasPorPaquete={linea.piezasPorPaquete}
        className="border-t pt-3"
      />

      {linea.problema && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {linea.problema}. Edita el ítem para corregirlo.
        </p>
      )}

      {children}
    </li>
  );
}
