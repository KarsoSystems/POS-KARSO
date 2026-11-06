"use client";

import { Info, Loader2, Minus, Pencil, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/atoms/alert";
import { FormError } from "@/components/atoms/form-error";
import { AvisoPreciosEjemplo } from "@/components/molecules/aviso-precios-ejemplo";
import { CodigosPromocion } from "@/components/molecules/codigos-promocion";
import { FormularioDatosFiscales } from "@/components/molecules/formulario-datos-fiscales";
import { ItemResumen } from "@/components/molecules/item-resumen";
import { SelectorSucursal } from "@/components/molecules/selector-sucursal";
import { TotalesPedido } from "@/components/molecules/totales-pedido";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Skeleton } from "@/components/atoms/skeleton";
import { ApiError } from "@/lib/api-client";
import { MAX_ITEMS_POR_PEDIDO } from "@/lib/validation/pedidos";
import { useProductos } from "@/hooks/use-productos";
import {
  useAplicarCodigo,
  useBorrador,
  useCambiarCheckout,
  useConfirmarPedido,
  useQuitarCodigo,
  useQuitarItem,
} from "@/hooks/use-pedidos";
import { useSucursales } from "@/hooks/use-sucursales";
import type { CheckoutInput, LineaPedido } from "@/lib/pedidos-api";
import type { DatosFiscales } from "@/lib/validation/fiscal";

const mensajeDe = (error: unknown, porDefecto: string) => (error instanceof ApiError ? error.message : porDefecto);

/** Errores de `datosFiscales.rfc`, … del servidor, por campo del formulario. */
function erroresFiscales(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(
    Object.entries(error.fields)
      .filter(([ruta]) => ruta.startsWith("datosFiscales."))
      .map(([ruta, mensaje]) => [ruta.slice("datosFiscales.".length), mensaje]),
  );
}

/** Lo que se quitó del borrador al recalcularlo (un código vencido, una sucursal inactiva). */
function AvisosBorrador({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <Info />
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        <ul className="space-y-1">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Aviso al pulsar "Hacer pedido" sin ítems. */
function AvisoPedidoVacio({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>No has agregado nada a tu pedido</DialogTitle>
          <DialogDescription>Agrega al menos un ítem con tu archivo para poder hacer el pedido.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" asChild>
            <Link href="/panel">Ir al inicio del panel</Link>
          </Button>
          <DialogClose asChild>
            <Button>Regresar al pedido</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmarQuitarProps {
  item: LineaPedido | null;
  descripcion: string;
  quitando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Pide confirmación antes de quitar un ítem: su archivo puede borrarse también. */
function ConfirmarQuitar({ item, descripcion, quitando, onConfirmar, onCancelar }: ConfirmarQuitarProps) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && !quitando && onCancelar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>¿Quitar este ítem?</DialogTitle>
          <DialogDescription>
            Se quitará {descripcion} de tu pedido. Si su archivo no se usa en otro ítem, también se borrará.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={quitando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={quitando}>
            {quitando ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            Quitar ítem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BorradorPedido() {
  const router = useRouter();
  const borrador = useBorrador();
  const { data: tienda, error: errorProductos } = useProductos();
  const quitarItem = useQuitarItem();
  const confirmarPedido = useConfirmarPedido();
  const sucursales = useSucursales();
  const cambiarCheckout = useCambiarCheckout();
  const aplicarCodigo = useAplicarCodigo();
  const quitarCodigo = useQuitarCodigo();
  const [errorCodigo, setErrorCodigo] = useState<string>();
  const [errorCheckout, setErrorCheckout] = useState<unknown>();
  // Lo que el cliente acaba de elegir, mientras el servidor responde: la casilla y la
  // sucursal cambian en el mismo clic, no hasta que llega el borrador recalculado.
  const [sucursalPedida, setSucursalPedida] = useState<string | null>(null);
  const [facturaPedida, setFacturaPedida] = useState<boolean | null>(null);
  const [errorAccion, setErrorAccion] = useState<string>();
  const [porQuitar, setPorQuitar] = useState<LineaPedido | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [avisoVacio, setAvisoVacio] = useState(false);

  const datos = borrador.data;
  const errorCarga = borrador.error ?? errorProductos;
  const error = errorAccion ?? (errorCarga ? mensajeDe(errorCarga, "No se pudo cargar tu pedido") : undefined);
  const quitando = quitarItem.isPending;

  async function quitar() {
    if (!porQuitar) return;
    setErrorAccion(undefined);
    try {
      await quitarItem.mutateAsync(porQuitar.lineaId);
    } catch (e) {
      setErrorAccion(mensajeDe(e, "No se pudo quitar el ítem"));
    } finally {
      setPorQuitar(null);
    }
  }

  const ocupadoCheckout = cambiarCheckout.isPending || aplicarCodigo.isPending || quitarCodigo.isPending;

  async function checkout(input: CheckoutInput) {
    setErrorCheckout(undefined);
    try {
      return await cambiarCheckout.mutateAsync(input);
    } catch (e) {
      setErrorCheckout(e);
      throw e;
    }
  }

  async function aplicar(codigo: string) {
    setErrorCodigo(undefined);
    try {
      await aplicarCodigo.mutateAsync(codigo);
    } catch (e) {
      setErrorCodigo(e instanceof ApiError ? (e.fields.codigo ?? e.message) : "No se pudo aplicar el código");
      throw e;
    }
  }

  async function quitarElCodigo(codigo: string) {
    setErrorCodigo(undefined);
    try {
      await quitarCodigo.mutateAsync(codigo);
    } catch (e) {
      setErrorCodigo(mensajeDe(e, "No se pudo quitar el código"));
    }
  }

  async function hacerPedido() {
    if (!datos || datos.pedido.productos.length === 0) return setAvisoVacio(true);
    setConfirmando(true);
    setErrorAccion(undefined);
    try {
      const { pedido } = await confirmarPedido.mutateAsync();
      router.push(`/panel/pedidos/${pedido.id}?confirmado=1`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PEDIDO_VACIO") setAvisoVacio(true);
      else setErrorAccion(mensajeDe(e, "No se pudo hacer el pedido"));
      // Si el panel cambió algo (catálogo, un código, una sucursal), el borrador
      // recalculado muestra qué ítem corregir o qué se quitó.
      if (e instanceof ApiError && ["ITEMS_CON_PROBLEMAS", "PROMOCION_INVALIDA", "CHECKOUT_INCOMPLETO"].includes(e.code)) {
        borrador.refetch();
      }
      setConfirmando(false);
    }
  }

  const items = datos?.pedido.productos ?? [];
  const lleno = items.length >= MAX_ITEMS_POR_PEDIDO;
  const conProblemas = items.some((item) => item.problema);
  const pedido = datos?.pedido;
  const sucursalElegida = sucursalPedida ?? pedido?.sucursalEntregaId ?? null;
  const requiereFactura = facturaPedida ?? pedido?.requiereFactura ?? false;
  // Lo que falta para hacer el pedido (KARSO: no hay entrega a domicilio; la factura pide datos).
  const faltan = [
    ...(pedido && !pedido.sucursalEntregaId ? ["Elige la sucursal de entrega"] : []),
    ...(pedido?.requiereFactura && !pedido.datosFiscales ? ["Captura tus datos fiscales"] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo pedido</h1>
        {datos &&
          (lleno ? (
            <Button variant="outline" disabled>
              <Plus aria-hidden />
              Agregar ítem
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/panel/pedidos/nuevo/item">
                <Plus aria-hidden />
                Agregar ítem
              </Link>
            </Button>
          ))}
      </div>

      <AvisoPreciosEjemplo ejemplo={tienda?.ejemplo} />
      <FormError message={error} />
      <AvisosBorrador avisos={pedido?.avisos ?? []} />
      {lleno && (
        <p className="text-sm text-muted-foreground">Máximo {MAX_ITEMS_POR_PEDIDO} ítems por pedido.</p>
      )}

      {!datos && !error && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {datos && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section aria-label="Ítems del pedido">
            {items.length === 0 ? (
              <Card>
                <CardContent className="space-y-1 py-8 text-center">
                  <p className="font-medium">Tu pedido está vacío</p>
                  <p className="text-sm text-muted-foreground">
                    Usa &quot;Agregar ítem&quot; para subir tu archivo y elegir producto, tamaño y cantidad.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-3">
                {items.map((item) => (
                  <ItemResumen
                    key={item.lineaId}
                    linea={item}
                    archivos={datos.archivos}
                    className="border-2 border-dashed"
                    acciones={
                      <>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/panel/pedidos/nuevo/item/${item.lineaId}`} aria-label="Editar ítem">
                            <Pencil aria-hidden />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Quitar ítem"
                          className="rounded-full hover:bg-destructive/10"
                          onClick={() => setPorQuitar(item)}
                        >
                          {/* Como en la maqueta: círculo rojo relleno con un signo menos. */}
                          <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-white">
                            <Minus className="size-3.5" strokeWidth={3} aria-hidden />
                          </span>
                        </Button>
                      </>
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sucursal de entrega</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Recoges tu pedido en sucursal; no hay entrega a domicilio.</p>
                {sucursales.data ? (
                  <SelectorSucursal
                    sucursales={sucursales.data.sucursales}
                    elegida={sucursalElegida}
                    onElegir={(sucursalEntregaId) => {
                      setSucursalPedida(sucursalEntregaId);
                      checkout({ sucursalEntregaId })
                        .catch(() => {})
                        .finally(() => setSucursalPedida(null));
                    }}
                    deshabilitado={ocupadoCheckout}
                    error={errorCheckout instanceof ApiError ? errorCheckout.fields.sucursalEntregaId : undefined}
                  />
                ) : sucursales.error ? (
                  <p className="text-sm text-destructive">{mensajeDe(sucursales.error, "No se pudieron cargar las sucursales")}</p>
                ) : (
                  <Skeleton className="h-40 w-full" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Códigos de promoción</CardTitle>
              </CardHeader>
              <CardContent>
                <CodigosPromocion
                  aplicadas={datos.pedido.promociones}
                  onAplicar={aplicar}
                  onQuitar={quitarElCodigo}
                  ocupado={ocupadoCheckout}
                  error={errorCodigo}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Factura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={requiereFactura}
                    disabled={ocupadoCheckout}
                    onChange={(e) => {
                      setFacturaPedida(e.target.checked);
                      checkout({ requiereFactura: e.target.checked })
                        .catch(() => {})
                        .finally(() => setFacturaPedida(null));
                    }}
                  />
                  Requiero factura
                </label>
                {requiereFactura && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Se suma el IVA. La imprenta emite la factura con estos datos.
                    </p>
                    <FormularioDatosFiscales
                      valor={datos.pedido.datosFiscales}
                      onGuardar={(datosFiscales: DatosFiscales, guardarDatosFiscales: boolean) =>
                        checkout({ datosFiscales, guardarDatosFiscales })
                      }
                      guardando={cambiarCheckout.isPending}
                      errores={erroresFiscales(errorCheckout)}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="lg:sticky lg:top-4">
              <CardHeader>
                <CardTitle className="text-base">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TotalesPedido totales={datos.pedido} />
                {conProblemas && (
                  <p className="text-sm text-destructive">Corrige los ítems marcados antes de hacer el pedido.</p>
                )}
                {items.length > 0 && faltan.length > 0 && (
                  <ul className="space-y-1 text-sm text-destructive" aria-label="Falta para hacer el pedido">
                    {faltan.map((falta) => (
                      <li key={falta}>{falta}</li>
                    ))}
                  </ul>
                )}
                <Button
                  className="w-full"
                  onClick={hacerPedido}
                  disabled={confirmando || conProblemas || ocupadoCheckout || (items.length > 0 && faltan.length > 0)}
                >
                  {confirmando ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                  Hacer pedido
                </Button>
                <p className="text-xs text-muted-foreground">El pago se hace después; tu pedido queda con pago pendiente.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <AvisoPedidoVacio open={avisoVacio} onOpenChange={setAvisoVacio} />
      <ConfirmarQuitar
        item={porQuitar}
        descripcion={
          porQuitar && datos
            ? `${porQuitar.nombre} (${datos.archivos[porQuitar.archivos.frente?.archivoId ?? ""]?.nombreOriginal ?? "sin archivo"})`
            : "el ítem"
        }
        quitando={quitando}
        onConfirmar={quitar}
        onCancelar={() => setPorQuitar(null)}
      />
    </div>
  );
}
