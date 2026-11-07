"use client";

import { CheckCircle2, Loader2, PackageCheck, RefreshCw, Wrench } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { EstadoBadge } from "@/components/atoms/estado-badge";
import { FormError } from "@/components/atoms/form-error";
import { Skeleton } from "@/components/atoms/skeleton";
import { useAccionPanel, usePedidosPanel } from "@/hooks/use-demo-panel";
import { ApiError } from "@/lib/api-client";
import type { PedidoPanel } from "@/lib/demo-panel-api";
import { formatearDia, formatearFechaHora, formatearMxn } from "@/lib/pedidos/formato";

type Accion = Parameters<ReturnType<typeof useAccionPanel>["mutateAsync"]>[0];

/** Clave estable de una acción, para mostrar su spinner. */
const claveDe = (a: Accion) => (a.tipo === "linea" ? `${a.id}:${a.lineaId}:${a.estatus}` : `${a.id}:${a.tipo}`);

/**
 * Simulador del panel de KARSO (SPEC 08, solo con DEMO_PANEL=1): hace lo que harán
 * mostrador y producción en el panel real (otro proyecto), para ver el seguimiento
 * del pedido en la tienda.
 */
export function SimuladorPanel() {
  const pedidos = usePedidosPanel();
  const accion = useAccionPanel();
  const [enCurso, setEnCurso] = useState<string>();
  const [error, setError] = useState<string>();

  async function hacer(a: Accion) {
    setEnCurso(claveDe(a));
    setError(undefined);
    try {
      await accion.mutateAsync(a);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo hacer la acción");
    } finally {
      setEnCurso(undefined);
    }
  }

  const boton = (a: Accion, etiqueta: string, Icono: typeof Wrench, deshabilitado = false) => (
    <Button size="sm" variant="outline" onClick={() => hacer(a)} disabled={accion.isPending || deshabilitado}>
      {enCurso === claveDe(a) ? <Loader2 className="animate-spin" aria-hidden /> : <Icono aria-hidden />}
      {etiqueta}
    </Button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Simulador del panel</h1>
        <Button variant="ghost" size="sm" onClick={() => pedidos.refetch()} disabled={pedidos.isFetching}>
          <RefreshCw className={pedidos.isFetching ? "animate-spin" : undefined} aria-hidden />
          Actualizar
        </Button>
      </div>
      <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <Wrench />
        <AlertTitle>Solo para el demo</AlertTitle>
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          Hace lo que harán mostrador y producción en el panel de KARSO (otro proyecto). Solo existe con DEMO_PANEL=1.
        </AlertDescription>
      </Alert>

      <FormError message={error ?? (pedidos.error instanceof ApiError ? pedidos.error.message : undefined)} />

      {pedidos.isPending && <Skeleton className="h-48 w-full" aria-label="Cargando" />}
      {pedidos.data?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay pedidos.</p>}

      <ul className="space-y-4" aria-label="Pedidos">
        {pedidos.data?.map((pedido) => (
          <FilaPanel key={pedido.id} pedido={pedido} boton={boton} />
        ))}
      </ul>
    </div>
  );
}

function FilaPanel({
  pedido,
  boton,
}: {
  pedido: PedidoPanel;
  boton: (a: Accion, etiqueta: string, Icono: typeof Wrench, deshabilitado?: boolean) => React.ReactNode;
}) {
  const enProduccion = pedido.estatus === "recibido" || pedido.estatus === "en_proceso";
  return (
    <li aria-label={`Pedido ${pedido.folio}`}>
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-mono">{pedido.folio}</span>
            <EstadoBadge estatus={pedido.estatus} />
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {pedido.cliente} · {pedido.confirmadoAt ? formatearFechaHora(pedido.confirmadoAt) : "—"} · Total{" "}
            {formatearMxn(pedido.total)} · Saldo {formatearMxn(pedido.saldo)}
            {pedido.fechaEntregaEstimada && ` · Disponible a partir del ${formatearDia(pedido.fechaEntregaEstimada)}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {pedido.productos.map((linea) => (
              <li key={linea.lineaId} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                <span className="min-w-0 flex-1">
                  {linea.nombre} · {linea.variante}
                  {linea.fechaEntregaEstimada && (
                    <span className="block text-xs text-muted-foreground">
                      Lista a partir del {formatearDia(linea.fechaEntregaEstimada)}
                    </span>
                  )}
                </span>
                {linea.estatus && <EstadoBadge estatus={linea.estatus} />}
                {enProduccion && linea.estatus === "recibido" &&
                  boton({ tipo: "linea", id: pedido.id, lineaId: linea.lineaId, estatus: "en_proceso" }, "En proceso", Wrench)}
                {enProduccion && linea.estatus !== "listo" &&
                  boton({ tipo: "linea", id: pedido.id, lineaId: linea.lineaId, estatus: "listo" }, "Listo", CheckCircle2)}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {pedido.estatus === "enviado" && boton({ tipo: "validar", id: pedido.id }, "Validar (recibido)", CheckCircle2)}
            {pedido.estatus === "listo" &&
              boton({ tipo: "entregar", id: pedido.id }, "Entregar", PackageCheck, pedido.saldo > 0)}
            {pedido.estatus === "listo" && pedido.saldo > 0 && (
              <span className="text-sm text-destructive">No se puede entregar con saldo pendiente</span>
            )}
            {pedido.estatus === "pago_pendiente" && (
              <span className="text-sm text-muted-foreground">Esperando el pago del cliente</span>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
