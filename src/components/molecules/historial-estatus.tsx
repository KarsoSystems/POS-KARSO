import { EstadoBadge } from "@/components/atoms/estado-badge";
import { formatearFechaHora } from "@/lib/pedidos/formato";
import type { CambioEstatus } from "@/lib/pedidos-api";

/** La traza del pedido (KARSO `historialEstatus`): cada cambio de estatus con su fecha y comentario. */
export function HistorialEstatus({ historial }: { historial: CambioEstatus[] }) {
  if (historial.length === 0) return null;
  return (
    <ol className="space-y-0" aria-label="Historial del pedido">
      {historial.map((cambio, i) => (
        <li key={`${cambio.estatus}-${cambio.fecha}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
          {/* La línea que une los puntos, salvo en el último. */}
          {i < historial.length - 1 && <span className="absolute top-3 left-[5px] h-full w-px bg-border" aria-hidden />}
          <span
            className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-primary bg-card data-[ultimo=true]:bg-primary"
            data-ultimo={i === historial.length - 1}
            aria-hidden
          />
          <div className="min-w-0 space-y-0.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoBadge estatus={cambio.estatus} />
              <time className="text-muted-foreground" dateTime={cambio.fecha}>
                {formatearFechaHora(cambio.fecha)}
              </time>
            </div>
            {cambio.comentario && <p className="break-words text-muted-foreground">{cambio.comentario}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
