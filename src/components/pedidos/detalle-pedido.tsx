"use client";

import { ArrowLeft, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/auth/form-error";
import { EstadoBadge } from "@/components/pedidos/estado-badge";
import { ItemResumen } from "@/components/pedidos/item-resumen";
import { TotalesPedido } from "@/components/pedidos/totales-pedido";
import { VistaPreviaHoja } from "@/components/pedidos/vista-previa-hoja";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { formatearFechaHora } from "@/lib/pedidos/formato";
import { pedidosApi, type Catalogo, type PedidoResponse } from "@/lib/pedidos-api";

const mensajeDe = (error: unknown, porDefecto: string) => (error instanceof ApiError ? error.message : porDefecto);

interface ConfirmarCancelarProps {
  folio: string;
  open: boolean;
  cancelando: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmar: () => void;
}

function ConfirmarCancelar({ folio, open, cancelando, onOpenChange, onConfirmar }: ConfirmarCancelarProps) {
  return (
    <Dialog open={open} onOpenChange={(value) => !cancelando && onOpenChange(value)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Cancelar el pedido {folio}?</DialogTitle>
          <DialogDescription>La imprenta no lo procesará. Esta acción no se puede deshacer.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancelando}>
            No, conservarlo
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={cancelando}>
            {cancelando ? <Loader2 className="animate-spin" aria-hidden /> : <XCircle aria-hidden />}
            Sí, cancelar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DetallePedido({ id, recienConfirmado }: { id: string; recienConfirmado: boolean }) {
  const [datos, setDatos] = useState<PedidoResponse | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string>();
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    Promise.all([pedidosApi.detalle(id), pedidosApi.catalogo()])
      .then(([detalle, { catalogo }]) => {
        setDatos(detalle);
        setCatalogo(catalogo);
      })
      .catch((e) => setError(mensajeDe(e, "No se pudo cargar el pedido")));
  }, [id]);

  async function cancelar() {
    setCancelando(true);
    setError(undefined);
    try {
      setDatos(await pedidosApi.cancelar(id));
    } catch (e) {
      setError(mensajeDe(e, "No se pudo cancelar el pedido"));
      // Si el estado cambió (p. ej. ya está en proceso), se muestra el actual.
      pedidosApi.detalle(id).then(setDatos).catch(() => {});
    } finally {
      setCancelando(false);
      setConfirmarCancelar(false);
    }
  }

  const pedido = datos?.pedido;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/panel/pedidos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Mis pedidos
      </Link>

      {recienConfirmado && pedido?.folio && (
        <Alert className="border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100">
          <CheckCircle2 />
          <AlertTitle>Pedido {pedido.folio} recibido</AlertTitle>
          <AlertDescription className="text-green-800 dark:text-green-200">
            La imprenta revisará tu pedido. El pago queda pendiente por ahora.
          </AlertDescription>
        </Alert>
      )}

      <FormError message={error} />

      {!datos && !error && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {pedido && datos && catalogo && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                Pedido <span className="font-mono">{pedido.folio}</span>
                <EstadoBadge estado={pedido.estado} />
              </h1>
              <dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-[auto_1fr]">
                {pedido.confirmadoAt && (
                  <>
                    <dt>Fecha del pedido</dt>
                    <dd className="text-foreground">{formatearFechaHora(pedido.confirmadoAt)}</dd>
                  </>
                )}
                {pedido.canceladoAt && (
                  <>
                    <dt>Cancelado</dt>
                    <dd className="text-foreground">{formatearFechaHora(pedido.canceladoAt)}</dd>
                  </>
                )}
              </dl>
            </div>
            {pedido.estado === "pedido" && (
              <Button variant="outline" onClick={() => setConfirmarCancelar(true)}>
                <XCircle aria-hidden />
                Cancelar pedido
              </Button>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
            <section aria-label="Ítems del pedido">
              <ul className="space-y-3">
                {pedido.items.map((item) => {
                  const hoja = catalogo.hojas.find((h) => h.id === item.hojaId);
                  return (
                    <ItemResumen key={item.id} item={item} archivo={datos.archivos[item.archivoId]} catalogo={catalogo}>
                      {hoja && item.presupuesto.acomodo.piezasPorHoja > 0 && (
                        <div className="border-t pt-3">
                          <div className="sm:mx-auto sm:max-w-xs">
                            <VistaPreviaHoja
                              hoja={hoja}
                              pieza={{ anchoCm: item.anchoCm, altoCm: item.altoCm }}
                              acomodo={item.presupuesto.acomodo}
                              margenCm={catalogo.margenCm}
                              separacionCm={catalogo.separacionCm}
                              hojas={item.presupuesto.hojas}
                              archivo={datos.archivos[item.archivoId]}
                            />
                          </div>
                        </div>
                      )}
                    </ItemResumen>
                  );
                })}
              </ul>
            </section>

            <Card className="lg:sticky lg:top-4">
              <CardHeader>
                <CardTitle className="text-base">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TotalesPedido totales={pedido.totales} />
                <p className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                  <Clock className="size-4 shrink-0" aria-hidden />
                  Pago pendiente
                </p>
              </CardContent>
            </Card>
          </div>

          {pedido.folio && (
            <ConfirmarCancelar
              folio={pedido.folio}
              open={confirmarCancelar}
              cancelando={cancelando}
              onOpenChange={setConfirmarCancelar}
              onConfirmar={cancelar}
            />
          )}
        </>
      )}
    </div>
  );
}
