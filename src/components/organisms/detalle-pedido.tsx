"use client";

import { ArrowLeft, CheckCircle2, Clock, FileText, Loader2, MapPin, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FormError } from "@/components/atoms/form-error";
import { EstadoBadge } from "@/components/atoms/estado-badge";
import { ItemResumen } from "@/components/molecules/item-resumen";
import { TotalesPedido } from "@/components/molecules/totales-pedido";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Skeleton } from "@/components/atoms/skeleton";
import { ApiError } from "@/lib/api-client";
import { formatearFechaHora } from "@/lib/pedidos/formato";
import type { Pedido } from "@/lib/pedidos-api";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/validation/fiscal";
import { useCancelarPedido, usePedido } from "@/hooks/use-pedidos";

const mensajeDe = (error: unknown, porDefecto: string) => (error instanceof ApiError ? error.message : porDefecto);

/** Dónde recoge el cliente: la copia de la sucursal que guardó el pedido al hacerse. */
function Entrega({ sucursal }: { sucursal: Pedido["sucursalEntrega"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4" aria-hidden />
          Entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {sucursal ? (
          <>
            <p className="font-medium">{sucursal.nombre}</p>
            <p className="text-muted-foreground">
              {sucursal.direccion.calle}, {sucursal.direccion.colonia}, {sucursal.direccion.ciudad},{" "}
              {sucursal.direccion.estado}, C.P. {sucursal.direccion.codigoPostal}
            </p>
            <p className="text-muted-foreground">{sucursal.horario}</p>
            <p className="text-muted-foreground">Tel. {sucursal.telefono}</p>
          </>
        ) : (
          <p className="text-muted-foreground">Sin sucursal de entrega</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Datos con los que la imprenta emitirá la factura (no se timbra en línea). */
function Factura({ datos }: { datos: NonNullable<Pedido["datosFiscales"]> }) {
  const regimen = REGIMENES_FISCALES.find((r) => r.clave === datos.regimenFiscal);
  const uso = USOS_CFDI.find((u) => u.clave === datos.usoCfdi);
  const fila = "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" aria-hidden />
          Factura
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1 text-sm">
          <div className={fila}>
            <dt className="text-muted-foreground">RFC</dt>
            <dd className="font-mono">{datos.rfc}</dd>
          </div>
          <div className={fila}>
            <dt className="text-muted-foreground">Razón social</dt>
            <dd className="break-words">{datos.razonSocial}</dd>
          </div>
          <div className={fila}>
            <dt className="text-muted-foreground">Régimen</dt>
            <dd>
              {datos.regimenFiscal}
              {regimen && ` · ${regimen.descripcion}`}
            </dd>
          </div>
          <div className={fila}>
            <dt className="text-muted-foreground">Uso del CFDI</dt>
            <dd>
              {datos.usoCfdi}
              {uso && ` · ${uso.descripcion}`}
            </dd>
          </div>
          <div className={fila}>
            <dt className="text-muted-foreground">Código postal</dt>
            <dd>{datos.codigoPostal}</dd>
          </div>
          <div className={fila}>
            <dt className="text-muted-foreground">Correo</dt>
            <dd className="break-all">{datos.correoFactura}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

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
  const detalle = usePedido(id);
  const cancelarPedido = useCancelarPedido(id);
  const [errorCancelar, setErrorCancelar] = useState<string>();
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const datos = detalle.data;
  const cancelando = cancelarPedido.isPending;
  const errorCarga = detalle.error;
  const error = errorCancelar ?? (errorCarga ? mensajeDe(errorCarga, "No se pudo cargar el pedido") : undefined);

  async function cancelar() {
    setErrorCancelar(undefined);
    try {
      await cancelarPedido.mutateAsync();
    } catch (e) {
      setErrorCancelar(mensajeDe(e, "No se pudo cancelar el pedido"));
      // Si el estado cambió (p. ej. ya está en proceso), se muestra el actual.
      detalle.refetch();
    } finally {
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
        <Alert className="border-exito/50 bg-exito/10 text-foreground [&>svg]:text-exito">
          <CheckCircle2 />
          <AlertTitle>Pedido {pedido.folio} recibido</AlertTitle>
          <AlertDescription className="text-foreground/80">
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

      {pedido && datos && (
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <section aria-label="Ítems del pedido">
              <ul className="space-y-3">
                {pedido.productos.map((linea) => (
                  <ItemResumen key={linea.lineaId} linea={linea} archivos={datos.archivos} />
                ))}
              </ul>
            </section>

            <div className="min-w-0 space-y-4">
              <Entrega sucursal={pedido.sucursalEntrega} />
              {pedido.requiereFactura && pedido.datosFiscales && <Factura datos={pedido.datosFiscales} />}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Resumen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <TotalesPedido totales={pedido} confirmado />
                  <p className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                    <Clock className="size-4 shrink-0" aria-hidden />
                    Pago pendiente
                  </p>
                </CardContent>
              </Card>
            </div>
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
