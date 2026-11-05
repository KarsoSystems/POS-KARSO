import { formatearMxn } from "@/lib/pedidos/formato";
import type { Pedido } from "@/lib/pedidos-api";

type Totales = Pick<Pedido, "subtotal" | "descuento" | "tasaIva" | "iva" | "total">;

/**
 * Totales de KARSO 5.4. Sin factura (SPEC 06) `tasaIva` es 0: no se muestra la fila
 * de IVA y se aclara que los precios no lo incluyen.
 */
export function TotalesPedido({ totales }: { totales: Totales }) {
  const fila = "flex items-center justify-between gap-4";
  return (
    <div className="space-y-2">
      <dl className="space-y-2 text-sm">
        <div className={fila}>
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatearMxn(totales.subtotal)}</dd>
        </div>
        {totales.descuento > 0 && (
          <div className={fila}>
            <dt className="text-muted-foreground">Descuento</dt>
            <dd className="tabular-nums">−{formatearMxn(totales.descuento)}</dd>
          </div>
        )}
        {totales.tasaIva > 0 && (
          <div className={fila}>
            <dt className="text-muted-foreground">IVA ({Math.round(totales.tasaIva * 100)} %)</dt>
            <dd className="tabular-nums">{formatearMxn(totales.iva)}</dd>
          </div>
        )}
        <div className={`${fila} border-t pt-2 text-base font-semibold`}>
          <dt>Total</dt>
          <dd className="text-acento-texto tabular-nums" data-testid="total-pedido">
            {formatearMxn(totales.total)}
          </dd>
        </div>
      </dl>
      {totales.tasaIva === 0 && (
        <p className="text-xs text-muted-foreground">Precios sin IVA. Si requieres factura, se suma al pagar.</p>
      )}
    </div>
  );
}
