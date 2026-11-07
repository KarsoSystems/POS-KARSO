import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { EstadoBadge } from "@/components/atoms/estado-badge";
import { limiteCorreccion } from "@/lib/pedidos/correccion";
import { formatearDiaDe, formatearFecha, formatearMxn } from "@/lib/pedidos/formato";
import type { Pedido } from "@/lib/pedidos-api";

export function FilaPedido({ pedido }: { pedido: Pedido }) {
  const items = pedido.productos.length;
  // Rechazado (SPEC 09): el plazo para corregir, junto al estatus.
  const limite = pedido.estatus === "rechazado" ? limiteCorreccion(pedido) : null;
  return (
    <li>
      <Link
        href={`/panel/pedidos/${pedido.id}`}
        className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono font-medium">{pedido.folio}</span>
            <EstadoBadge estatus={pedido.estatus} />
            {limite && <span className="text-sm text-destructive">Corrige antes del {formatearDiaDe(limite)}</span>}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatearFecha(pedido.confirmadoAt ?? pedido.createdAt)} · {items} {items === 1 ? "ítem" : "ítems"}
          </p>
        </div>
        <span className="font-medium text-acento-texto tabular-nums">{formatearMxn(pedido.total)}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
