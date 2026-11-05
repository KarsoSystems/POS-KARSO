"use client";

import { Loader2, Minus, Pencil, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/atoms/form-error";
import { AvisoPreciosEjemplo } from "@/components/molecules/aviso-precios-ejemplo";
import { ItemResumen } from "@/components/molecules/item-resumen";
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
import { etiquetasItem } from "@/lib/pedidos/formato";
import { useCatalogo } from "@/hooks/use-catalogo";
import { useBorrador, useConfirmarPedido, useQuitarItem } from "@/hooks/use-pedidos";
import type { Subpedido } from "@/lib/pedidos-api";

const mensajeDe = (error: unknown, porDefecto: string) => (error instanceof ApiError ? error.message : porDefecto);

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
  item: Subpedido | null;
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
  const { data: catalogo, error: errorCatalogo } = useCatalogo();
  const quitarItem = useQuitarItem();
  const confirmarPedido = useConfirmarPedido();
  const [errorAccion, setErrorAccion] = useState<string>();
  const [porQuitar, setPorQuitar] = useState<Subpedido | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [avisoVacio, setAvisoVacio] = useState(false);

  const datos = borrador.data;
  const errorCarga = borrador.error ?? errorCatalogo;
  const error = errorAccion ?? (errorCarga ? mensajeDe(errorCarga, "No se pudo cargar tu pedido") : undefined);
  const quitando = quitarItem.isPending;

  async function quitar() {
    if (!porQuitar) return;
    setErrorAccion(undefined);
    try {
      await quitarItem.mutateAsync(porQuitar.id);
    } catch (e) {
      setErrorAccion(mensajeDe(e, "No se pudo quitar el ítem"));
    } finally {
      setPorQuitar(null);
    }
  }

  async function hacerPedido() {
    if (!datos || datos.pedido.items.length === 0) return setAvisoVacio(true);
    setConfirmando(true);
    setErrorAccion(undefined);
    try {
      const { pedido } = await confirmarPedido.mutateAsync();
      router.push(`/panel/pedidos/${pedido.id}?confirmado=1`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PEDIDO_VACIO") setAvisoVacio(true);
      else setErrorAccion(mensajeDe(e, "No se pudo hacer el pedido"));
      // Si el catálogo cambió, el borrador recalculado muestra qué ítem corregir.
      if (e instanceof ApiError && e.code === "ITEMS_CON_PROBLEMAS") borrador.refetch();
      setConfirmando(false);
    }
  }

  const items = datos?.pedido.items ?? [];
  const lleno = items.length >= MAX_ITEMS_POR_PEDIDO;
  const conProblemas = items.some((item) => item.problema);

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

      <AvisoPreciosEjemplo ejemplo={catalogo?.ejemplo} />
      <FormError message={error} />
      {lleno && (
        <p className="text-sm text-muted-foreground">Máximo {MAX_ITEMS_POR_PEDIDO} ítems por pedido.</p>
      )}

      {(!datos || !catalogo) && !error && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {datos && catalogo && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
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
                    key={item.id}
                    item={item}
                    archivo={datos.archivos[item.archivoId]}
                    catalogo={catalogo}
                    className="border-2 border-dashed"
                    acciones={
                      <>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/panel/pedidos/nuevo/item/${item.id}`} aria-label="Editar ítem">
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

          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <TotalesPedido totales={datos.pedido.totales} />
              {conProblemas && (
                <p className="text-sm text-destructive">Corrige los ítems marcados antes de hacer el pedido.</p>
              )}
              <Button className="w-full" onClick={hacerPedido} disabled={confirmando || conProblemas}>
                {confirmando ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
                Hacer pedido
              </Button>
              <p className="text-xs text-muted-foreground">El pago se hace después; tu pedido queda con pago pendiente.</p>
            </CardContent>
          </Card>
        </div>
      )}

      <AvisoPedidoVacio open={avisoVacio} onOpenChange={setAvisoVacio} />
      <ConfirmarQuitar
        item={porQuitar}
        descripcion={
          porQuitar && catalogo && datos
            ? `${etiquetasItem(catalogo, porQuitar).producto} (${datos.archivos[porQuitar.archivoId]?.nombreOriginal ?? "sin archivo"})`
            : "el ítem"
        }
        quitando={quitando}
        onConfirmar={quitar}
        onCancelar={() => setPorQuitar(null)}
      />
    </div>
  );
}
