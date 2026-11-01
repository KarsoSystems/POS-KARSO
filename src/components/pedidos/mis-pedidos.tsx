"use client";

import { ChevronRight, Package, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/auth/form-error";
import { EstadoBadge } from "@/components/pedidos/estado-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { formatearFecha, formatearMxn } from "@/lib/pedidos/formato";
import { pedidosApi, type Pedido } from "@/lib/pedidos-api";

function NuevoPedido() {
  return (
    <Button asChild>
      <Link href="/panel/pedidos/nuevo">
        <Plus aria-hidden />
        Nuevo pedido
      </Link>
    </Button>
  );
}

function FilaPedido({ pedido }: { pedido: Pedido }) {
  const items = pedido.items.length;
  return (
    <li>
      <Link
        href={`/panel/pedidos/${pedido.id}`}
        className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono font-medium">{pedido.folio}</span>
            <EstadoBadge estado={pedido.estado} />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatearFecha(pedido.confirmadoAt ?? pedido.createdAt)} · {items} {items === 1 ? "ítem" : "ítems"}
          </p>
        </div>
        <span className="font-medium tabular-nums">{formatearMxn(pedido.totales.totalCentavos)}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function MisPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    pedidosApi
      .listar()
      .then(({ pedidos }) => setPedidos(pedidos))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudieron cargar tus pedidos"));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mis pedidos</h1>
        <NuevoPedido />
      </div>

      <FormError message={error} />

      {!pedidos && !error && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {pedidos?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <Package className="size-10 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">Aún no tienes pedidos</p>
              <p className="text-sm text-muted-foreground">
                Arma tu primer pedido: sube tu archivo, elige producto y cantidad, y ve el presupuesto.
              </p>
            </div>
            <NuevoPedido />
          </CardContent>
        </Card>
      )}

      {pedidos && pedidos.length > 0 && (
        <ul className="space-y-3" aria-label="Pedidos">
          {pedidos.map((pedido) => (
            <FilaPedido key={pedido.id} pedido={pedido} />
          ))}
        </ul>
      )}
    </div>
  );
}
