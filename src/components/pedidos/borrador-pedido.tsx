"use client";

import { Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormError } from "@/components/auth/form-error";
import { AvisoPreciosEjemplo } from "@/components/pedidos/aviso-precios-ejemplo";
import { ItemResumen } from "@/components/pedidos/item-resumen";
import { TotalesPedido } from "@/components/pedidos/totales-pedido";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { MAX_ITEMS_POR_PEDIDO } from "@/lib/validation/pedidos";
import { etiquetasItem } from "@/lib/pedidos/formato";
import { pedidosApi, type Catalogo, type PedidoResponse, type Subpedido } from "@/lib/pedidos-api";

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
  const [datos, setDatos] = useState<PedidoResponse | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string>();
  const [porQuitar, setPorQuitar] = useState<Subpedido | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [avisoVacio, setAvisoVacio] = useState(false);

  useEffect(() => {
    Promise.all([pedidosApi.borrador(), pedidosApi.catalogo()])
      .then(([borrador, { catalogo }]) => {
        setDatos(borrador);
        setCatalogo(catalogo);
      })
      .catch((e) => setError(mensajeDe(e, "No se pudo cargar tu pedido")));
  }, []);

  async function quitar() {
    if (!porQuitar) return;
    setQuitando(true);
    setError(undefined);
    try {
      setDatos(await pedidosApi.quitarItem(porQuitar.id));
    } catch (e) {
      setError(mensajeDe(e, "No se pudo quitar el ítem"));
    } finally {
      setQuitando(false);
      setPorQuitar(null);
    }
  }

  async function hacerPedido() {
    if (!datos || datos.pedido.items.length === 0) return setAvisoVacio(true);
    setConfirmando(true);
    setError(undefined);
    try {
      const { pedido } = await pedidosApi.confirmar();
      router.push(`/panel/pedidos/${pedido.id}?confirmado=1`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PEDIDO_VACIO") setAvisoVacio(true);
      else setError(mensajeDe(e, "No se pudo hacer el pedido"));
      // Si el catálogo cambió, el borrador recalculado muestra qué ítem corregir.
      if (e instanceof ApiError && e.code === "ITEMS_CON_PROBLEMAS") {
        pedidosApi.borrador().then(setDatos).catch(() => {});
      }
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

      {!datos && !error && (
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
                          onClick={() => setPorQuitar(item)}
                        >
                          <Trash2 aria-hidden />
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
