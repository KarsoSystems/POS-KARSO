import { formatearMxn } from "@/lib/pedidos/formato";
import type { Pedido } from "@/lib/pedidos-api";

type Totales = Pick<Pedido, "subtotal" | "descuento" | "tasaIva" | "iva" | "total"> & {
  promociones?: Pedido["promociones"];
};

/**
 * Totales de KARSO 5.4: subtotal, una fila por código de promoción con lo que
 * descontó, IVA si se pidió factura y total. Sin factura `tasaIva` es 0: no se
 * muestra la fila de IVA y se aclara que los precios no lo incluyen.
 */
export function TotalesPedido({
  totales,
  confirmado = false,
}: {
  totales: Totales;
  /** Pedido ya hecho: sin factura ya no se puede pedir, así que la leyenda cambia. */
  confirmado?: boolean;
}) {
  const fila = "flex items-center justify-between gap-4";
  return (
    <div className="space-y-2">
      <dl className="space-y-2 text-sm">
        <div className={fila}>
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatearMxn(totales.subtotal)}</dd>
        </div>
        {totales.promociones?.length
          ? totales.promociones.map((p) => (
              <div key={p.codigo} className={fila}>
                <dt className="text-muted-foreground">
                  {p.codigo} ({p.porcentaje} %)
                </dt>
                <dd className="tabular-nums">−{formatearMxn(p.descuento)}</dd>
              </div>
            ))
          : totales.descuento > 0 && (
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
        <p className="text-xs text-muted-foreground">
          {confirmado ? "Sin factura: no se cobra IVA." : "Precios sin IVA. Si requieres factura, se suma al pagar."}
        </p>
      )}
    </div>
  );
}
