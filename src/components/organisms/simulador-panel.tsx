"use client";

import { CheckCircle2, Loader2, PackageCheck, RefreshCw, Wrench, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { EstadoBadge } from "@/components/atoms/estado-badge";
import { FormError } from "@/components/atoms/form-error";
import { Skeleton } from "@/components/atoms/skeleton";
import { useAccionPanel, useMotivosRechazo, usePedidosPanel } from "@/hooks/use-demo-panel";
import { ApiError } from "@/lib/api-client";
import type { MotivoRechazo, PedidoPanel, RechazoInput } from "@/lib/demo-panel-api";
import { limiteCorreccion, rechazosVigentes } from "@/lib/pedidos/correccion";
import { formatearDia, formatearDiaDe, formatearFechaHora, formatearMxn } from "@/lib/pedidos/formato";

type Accion = Parameters<ReturnType<typeof useAccionPanel>["mutateAsync"]>[0];
type Rechazar = (id: string, lineas: RechazoInput["lineas"]) => Promise<void>;

const controlClass =
  "w-full min-w-0 rounded-md border border-border bg-input px-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

/** Clave estable de una acción, para mostrar su spinner. */
const claveDe = (a: Accion) => (a.tipo === "linea" ? `${a.id}:${a.lineaId}:${a.estatus}` : `${a.id}:${a.tipo}`);

/**
 * Simulador del panel de KARSO (SPEC 08, solo con DEMO_PANEL=1): hace lo que harán
 * mostrador y producción en el panel real (otro proyecto), para ver el seguimiento
 * del pedido en la tienda.
 */
export function SimuladorPanel() {
  const pedidos = usePedidosPanel();
  const motivos = useMotivosRechazo();
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

  /** El formulario de rechazo muestra los errores por campo: aquí solo se lanza. */
  const rechazar: Rechazar = async (id, lineas) => {
    setError(undefined);
    await accion.mutateAsync({ tipo: "rechazar", id, lineas });
  };

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
          <FilaPanel key={pedido.id} pedido={pedido} boton={boton} motivos={motivos.data ?? []} rechazar={rechazar} />
        ))}
      </ul>
    </div>
  );
}

function FilaPanel({
  pedido,
  boton,
  motivos,
  rechazar,
}: {
  pedido: PedidoPanel;
  boton: (a: Accion, etiqueta: string, Icono: typeof Wrench, deshabilitado?: boolean) => React.ReactNode;
  motivos: MotivoRechazo[];
  rechazar: Rechazar;
}) {
  const [rechazando, setRechazando] = useState(false);
  const enProduccion = pedido.estatus === "recibido" || pedido.estatus === "en_proceso";
  const limite = pedido.estatus === "rechazado" ? limiteCorreccion(pedido) : null;
  const rechazos = pedido.estatus === "rechazado" ? rechazosVigentes(pedido) : [];
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
                  {rechazos
                    .filter((r) => r.lineaId === linea.lineaId)
                    .map((r) => (
                      <span key={r.lineaId} className="block text-xs text-destructive">
                        Rechazada: {motivos.find((m) => m.clave === r.motivo)?.nombre ?? r.motivo}
                        {r.corregidoEn ? " · archivo corregido" : " · sin corregir"}
                      </span>
                    ))}
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
            {pedido.estatus === "enviado" && !rechazando && (
              <Button size="sm" variant="outline" onClick={() => setRechazando(true)}>
                <XCircle aria-hidden />
                Rechazar
              </Button>
            )}
            {limite && (
              <span className="text-sm text-muted-foreground">
                Esperando la corrección del cliente (hasta el {formatearDiaDe(limite)})
              </span>
            )}
            {pedido.estatus === "listo" &&
              boton({ tipo: "entregar", id: pedido.id }, "Entregar", PackageCheck, pedido.saldo > 0)}
            {pedido.estatus === "listo" && pedido.saldo > 0 && (
              <span className="text-sm text-destructive">No se puede entregar con saldo pendiente</span>
            )}
            {pedido.estatus === "pago_pendiente" && (
              <span className="text-sm text-muted-foreground">Esperando el pago del cliente</span>
            )}
          </div>
          {pedido.estatus === "enviado" && rechazando && (
            <FormularioRechazo
              pedido={pedido}
              motivos={motivos}
              onRechazar={(lineas) => rechazar(pedido.id, lineas)}
              onCancelar={() => setRechazando(false)}
            />
          )}
        </CardContent>
      </Card>
    </li>
  );
}

interface LineaMarcada {
  marcada: boolean;
  motivo: string;
  comentario: string;
}

/**
 * Mostrador rechaza el pedido (SPEC 09): marca una o varias líneas, cada una con
 * su motivo del catálogo y un comentario para el cliente. Los errores llegan de la
 * API, por campo (`lineas.N.motivo`, `lineas.N.comentario`).
 */
function FormularioRechazo({
  pedido,
  motivos,
  onRechazar,
  onCancelar,
}: {
  pedido: PedidoPanel;
  motivos: MotivoRechazo[];
  onRechazar: (lineas: RechazoInput["lineas"]) => Promise<void>;
  onCancelar: () => void;
}) {
  const id = useId();
  const [lineas, setLineas] = useState<Record<string, LineaMarcada>>(() =>
    Object.fromEntries(pedido.productos.map((l) => [l.lineaId, { marcada: false, motivo: "", comentario: "" }])),
  );
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const cambiar = (lineaId: string, cambio: Partial<LineaMarcada>) =>
    setLineas((actual) => ({ ...actual, [lineaId]: { ...actual[lineaId], ...cambio } }));
  const marcadas = pedido.productos.filter((l) => lineas[l.lineaId].marcada);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    setError(undefined);
    try {
      await onRechazar(
        marcadas.map((l) => ({ lineaId: l.lineaId, motivo: lineas[l.lineaId].motivo, comentario: lineas[l.lineaId].comentario })),
      );
    } catch (err) {
      if (!(err instanceof ApiError)) return setError("No se pudo rechazar el pedido");
      // "lineas.0.motivo" → el error de esa línea marcada, por su lineaId.
      const porLinea: Record<string, string> = {};
      for (const [campo, mensaje] of Object.entries(err.fields)) {
        const [, indice, nombre] = campo.split(".");
        const linea = marcadas[Number(indice)];
        if (linea && nombre) porLinea[`${linea.lineaId}.${nombre}`] = mensaje;
      }
      setErrores(porLinea);
      if (Object.keys(porLinea).length === 0) setError(err.fields.lineas ?? err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-md border border-destructive/40 p-3" aria-label="Rechazar pedido">
      <p className="text-sm font-medium">Marca las líneas con problema y explica al cliente qué corregir.</p>
      {pedido.productos.map((linea) => {
        const valor = lineas[linea.lineaId];
        const nombre = `${linea.nombre} · ${linea.variante}`;
        const errorMotivo = errores[`${linea.lineaId}.motivo`];
        const errorComentario = errores[`${linea.lineaId}.comentario`];
        return (
          <fieldset key={linea.lineaId} className="min-w-0 space-y-2 rounded-md border p-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={valor.marcada}
                onChange={(e) => cambiar(linea.lineaId, { marcada: e.target.checked })}
              />
              <span className="min-w-0 break-words">Rechazar {nombre}</span>
            </label>
            {valor.marcada && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <div className="min-w-0 space-y-1">
                  <select
                    aria-label={`Motivo · ${nombre}`}
                    className={`${controlClass} h-9`}
                    value={valor.motivo}
                    onChange={(e) => cambiar(linea.lineaId, { motivo: e.target.value })}
                    aria-invalid={errorMotivo ? true : undefined}
                    aria-describedby={errorMotivo ? `${id}-${linea.lineaId}-motivo` : undefined}
                  >
                    <option value="">Elige el motivo</option>
                    {motivos.map((m) => (
                      <option key={m.clave} value={m.clave}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                  {errorMotivo && (
                    <p id={`${id}-${linea.lineaId}-motivo`} className="text-xs text-destructive">
                      {errorMotivo}
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <textarea
                    aria-label={`Comentario · ${nombre}`}
                    rows={2}
                    maxLength={500}
                    placeholder="Ej. El frente está a 150 dpi, se requieren 300"
                    className={`${controlClass} py-1.5`}
                    value={valor.comentario}
                    onChange={(e) => cambiar(linea.lineaId, { comentario: e.target.value })}
                    aria-invalid={errorComentario ? true : undefined}
                    aria-describedby={errorComentario ? `${id}-${linea.lineaId}-comentario` : undefined}
                  />
                  {errorComentario && (
                    <p id={`${id}-${linea.lineaId}-comentario`} className="text-xs text-destructive">
                      {errorComentario}
                    </p>
                  )}
                </div>
              </div>
            )}
          </fieldset>
        );
      })}
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={enviando || marcadas.length === 0}>
          {enviando ? <Loader2 className="animate-spin" aria-hidden /> : <XCircle aria-hidden />}
          Confirmar rechazo
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
