"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, CreditCard, FileText, MapPin } from "lucide-react";
import Link from "next/link";
import { FormError } from "@/components/atoms/form-error";
import { EstadoBadge } from "@/components/atoms/estado-badge";
import { ItemResumen } from "@/components/molecules/item-resumen";
import { TotalesPedido } from "@/components/molecules/totales-pedido";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import { ApiError } from "@/lib/api-client";
import { formatearFechaHora, formatearMxn } from "@/lib/pedidos/formato";
import type { Pedido } from "@/lib/pedidos-api";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/validation/fiscal";
import { usePedido } from "@/hooks/use-pedidos";

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

const AMBAR = "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";

/** Aviso al volver de la página de pago (`?pago=aprobado|rechazado|pendiente|vencido`). */
function AvisoPago({ resultado, pedido }: { resultado?: string; pedido: Pedido }) {
  const limite = pedido.vencimientoPago ? formatearFechaHora(pedido.vencimientoPago) : "";
  if (resultado === "aprobado" && pedido.estatus === "enviado") {
    return (
      <Alert className="border-exito/50 bg-exito/10 text-foreground [&>svg]:text-exito">
        <CheckCircle2 />
        <AlertTitle>Pago aprobado</AlertTitle>
        <AlertDescription className="text-foreground/80">
          Tu pedido {pedido.folio} se envió a la sucursal para que revisen tus archivos.
        </AlertDescription>
      </Alert>
    );
  }
  if ((resultado === "rechazado" || resultado === "pendiente") && pedido.estatus === "pago_pendiente") {
    return (
      <Alert className={AMBAR}>
        <AlertTriangle />
        <AlertTitle>{resultado === "rechazado" ? "Tu pago fue rechazado" : "Tu pago quedó pendiente"}</AlertTitle>
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          {resultado === "pendiente" && "Mercado Pago todavía no lo confirma. "}
          Puedes intentarlo de nuevo antes del {limite}
        </AlertDescription>
      </Alert>
    );
  }
  if (resultado === "vencido" || (resultado && pedido.estatus === "cancelado")) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>El plazo para pagar venció</AlertTitle>
        <AlertDescription>El pedido se canceló. Si todavía lo necesitas, haz uno nuevo.</AlertDescription>
      </Alert>
    );
  }
  return null;
}

/** Estado del pago en el resumen: "Pagar" con la hora límite, o el pago aprobado con su referencia. */
function EstadoPago({ pedido }: { pedido: Pedido }) {
  const aprobado = pedido.pagos.find((p) => p.estatus === "aprobado");
  if (aprobado) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-exito/10 p-2 text-sm" data-testid="pago-aprobado">
        <CheckCircle2 className="size-4 shrink-0 text-exito" aria-hidden />
        Pagado el {formatearFechaHora(aprobado.fecha)} · Ref. {aprobado.referencia}
      </p>
    );
  }
  if (pedido.estatus !== "pago_pendiente") return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
        <Clock className="size-4 shrink-0" aria-hidden />
        {pedido.vencimientoPago ? `Paga antes del ${formatearFechaHora(pedido.vencimientoPago)}` : "Pago pendiente"}
      </p>
      <Button className="w-full" asChild>
        <Link href={`/panel/pedidos/${pedido.id}/pago`}>
          <CreditCard aria-hidden />
          Pagar {formatearMxn(pedido.total)}
        </Link>
      </Button>
    </div>
  );
}

export function DetallePedido({ id, resultadoPago }: { id: string; resultadoPago?: string }) {
  const detalle = usePedido(id);
  const datos = detalle.data;
  const errorCarga = detalle.error;
  const error = errorCarga ? mensajeDe(errorCarga, "No se pudo cargar el pedido") : undefined;

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

      {pedido && <AvisoPago resultado={resultadoPago} pedido={pedido} />}

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
                <EstadoBadge estatus={pedido.estatus} />
              </h1>
              <dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-[auto_1fr]">
                {pedido.confirmadoAt && (
                  <>
                    <dt>Fecha del pedido</dt>
                    <dd className="text-foreground">{formatearFechaHora(pedido.confirmadoAt)}</dd>
                  </>
                )}
                {pedido.cancelacion && (
                  <>
                    <dt>Cancelado</dt>
                    <dd className="text-foreground">
                      {formatearFechaHora(pedido.cancelacion.fecha)} · {pedido.cancelacion.motivo}
                    </dd>
                  </>
                )}
              </dl>
            </div>
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
                  <EstadoPago pedido={pedido} />
                </CardContent>
              </Card>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
