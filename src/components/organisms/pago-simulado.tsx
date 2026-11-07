"use client";

import { ArrowLeft, CheckCircle2, Clock, CreditCard, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/atoms/form-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import { ApiError } from "@/lib/api-client";
import { formatearFechaHora, formatearMxn } from "@/lib/pedidos/formato";
import { venceElPago } from "@/lib/pedidos/pago";
import type { ResultadoPago } from "@/lib/pedidos-api";
import { usePagarSimulado, usePedido } from "@/hooks/use-pedidos";

const BOTONES: { resultado: ResultadoPago; etiqueta: string; Icono: typeof CheckCircle2; variant: "default" | "outline" }[] = [
  { resultado: "aprobado", etiqueta: "Aprobar", Icono: CheckCircle2, variant: "default" },
  { resultado: "rechazado", etiqueta: "Rechazar", Icono: XCircle, variant: "outline" },
  { resultado: "pendiente", etiqueta: "Dejarlo pendiente", Icono: Clock, variant: "outline" },
];

/**
 * Página de pago que emula Mercado Pago Checkout Pro (SPEC 07): el cliente "sale"
 * de la tienda a pagar y regresa al detalle con el resultado. En producción esta
 * pantalla es la de Mercado Pago y el resultado llega por su webhook.
 */
export function PagoSimulado({ id }: { id: string }) {
  const router = useRouter();
  const detalle = usePedido(id);
  const pagar = usePagarSimulado(id);
  const [elegido, setElegido] = useState<ResultadoPago>();
  const [error, setError] = useState<string>();

  const pedido = detalle.data?.pedido;
  const volver = `/panel/pedidos/${id}`;
  // El servidor ya canceló los vencidos al responder el detalle; por si el plazo
  // vence con la página abierta, también se revisa aquí.
  const esperaPago = pedido?.estatus === "pago_pendiente" && !venceElPago(pedido);

  async function responder(resultado: ResultadoPago) {
    setElegido(resultado);
    setError(undefined);
    try {
      await pagar.mutateAsync(resultado);
      router.push(`${volver}?pago=${resultado}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PAGO_VENCIDO") return router.push(`${volver}?pago=vencido`);
      setError(e instanceof ApiError ? e.message : "No se pudo registrar el pago");
      setElegido(undefined);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Link href={volver} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Volver al pedido
      </Link>

      <FormError message={error ?? (detalle.error instanceof ApiError ? detalle.error.message : undefined)} />

      {!pedido && !detalle.error && <Skeleton className="h-72 w-full" aria-label="Cargando" />}

      {pedido && (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-5" aria-hidden />
              Pagar con Mercado Pago
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Simulación: no se hace ningún cobro. Elige qué respondería Mercado Pago.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Pedido</dt>
                <dd className="font-mono">{pedido.folio}</dd>
              </div>
              <div className="flex justify-between gap-4 text-base font-semibold">
                <dt>Total a pagar</dt>
                <dd className="text-acento-texto tabular-nums" data-testid="total-a-pagar">
                  {formatearMxn(pedido.total)}
                </dd>
              </div>
              {pedido.vencimientoPago && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Paga antes del</dt>
                  <dd className="text-right">{formatearFechaHora(pedido.vencimientoPago)}</dd>
                </div>
              )}
            </dl>

            {esperaPago ? (
              <div className="grid gap-2" role="group" aria-label="Resultado del pago">
                {BOTONES.map(({ resultado, etiqueta, Icono, variant }) => (
                  <Button key={resultado} variant={variant} onClick={() => responder(resultado)} disabled={pagar.isPending}>
                    {elegido === resultado ? <Loader2 className="animate-spin" aria-hidden /> : <Icono aria-hidden />}
                    {etiqueta}
                  </Button>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertTitle>Este pedido ya no espera su pago</AlertTitle>
                <AlertDescription>
                  {pedido.estatus === "cancelado" && pedido.cancelacion
                    ? `Se canceló: ${pedido.cancelacion.motivo}.`
                    : "Revisa su estatus en el detalle."}
                  <Link href={volver} className="mt-1 underline underline-offset-2">
                    Ir al pedido
                  </Link>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
