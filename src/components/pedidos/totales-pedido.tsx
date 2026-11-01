import { formatearMxn } from "@/lib/pedidos/formato";
import type { Pedido } from "@/lib/pedidos-api";

/** Subtotal, IVA desglosado y total del pedido. */
export function TotalesPedido({ totales }: { totales: Pedido["totales"] }) {
  const fila = "flex items-center justify-between gap-4";
  return (
    <dl className="space-y-2 text-sm">
      <div className={fila}>
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="tabular-nums">{formatearMxn(totales.subtotalCentavos)}</dd>
      </div>
      <div className={fila}>
        <dt className="text-muted-foreground">IVA ({Math.round(totales.tasaIva * 100)} %)</dt>
        <dd className="tabular-nums">{formatearMxn(totales.ivaCentavos)}</dd>
      </div>
      <div className={`${fila} border-t pt-2 text-base font-semibold`}>
        <dt>Total</dt>
        <dd className="tabular-nums">{formatearMxn(totales.totalCentavos)}</dd>
      </div>
    </dl>
  );
}
