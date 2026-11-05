import type { Volumen } from "@/lib/catalogo/schema";
import type { CotizacionLinea as Cotizacion } from "@/lib/pedidos/cotizacion";
import { formatearMxn, formatearNumero, textoCantidad } from "@/lib/pedidos/formato";
import { cn } from "@/lib/utils";

interface CotizacionLineaProps {
  cotizacion: Pick<
    Cotizacion,
    "especificaciones" | "importeBaseUnitario" | "importeEspecificacionesUnitario" | "importeUnitario" | "subtotal"
  >;
  cantidad: number;
  volumen: Volumen;
  piezasPorPaquete: number | null;
  className?: string;
}

/** Unidades de un acabado cuando no es 1: "14 ojillos", "7.00 m", "3.00 m²". */
function detalleUnidades(e: Cotizacion["especificaciones"][number]): string | null {
  if (e.tipoCobro === "por_pieza") return `${formatearNumero(e.unidades)} × ${formatearMxn(e.precio)}`;
  if (e.tipoCobro === "por_metro_lineal") return `${e.unidades.toFixed(2)} m × ${formatearMxn(e.precio)}`;
  if (e.tipoCobro === "por_m2") return `${e.unidades.toFixed(2)} m² × ${formatearMxn(e.precio)}`;
  return null;
}

/**
 * Desglose de KARSO 5.4: base unitaria + acabados = importe unitario, × cantidad =
 * subtotal. Los importes unitarios son por unidad de volumen (millar, pieza, paquete).
 */
export function CotizacionLinea({ cotizacion, cantidad, volumen, piezasPorPaquete, className }: CotizacionLineaProps) {
  const fila = "flex items-baseline justify-between gap-4";
  return (
    <dl className={cn("space-y-1.5 text-sm", className)} aria-label="Cotización de la línea">
      <div className={fila}>
        <dt className="text-muted-foreground">Base unitaria</dt>
        <dd className="tabular-nums">{formatearMxn(cotizacion.importeBaseUnitario)}</dd>
      </div>
      {cotizacion.especificaciones.map((e) => {
        const detalle = detalleUnidades(e);
        return (
          <div key={e.id} className={fila}>
            <dt className="text-muted-foreground">
              + {e.nombre}
              {detalle && <span className="ml-1 text-xs">({detalle})</span>}
            </dt>
            <dd className="tabular-nums">{formatearMxn(e.importeUnitario)}</dd>
          </div>
        );
      })}
      <div className={cn(fila, "border-t pt-1.5")}>
        <dt className="text-muted-foreground">Importe unitario</dt>
        <dd className="tabular-nums">{formatearMxn(cotizacion.importeUnitario)}</dd>
      </div>
      <div className={fila}>
        <dt className="text-muted-foreground">× {textoCantidad(volumen, cantidad, piezasPorPaquete)}</dt>
        <dd className="text-base font-semibold text-acento-texto tabular-nums" data-testid="subtotal-linea">
          {formatearMxn(cotizacion.subtotal)}
        </dd>
      </div>
    </dl>
  );
}
