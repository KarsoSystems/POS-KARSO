"use client";

import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { FormError } from "@/components/atoms/form-error";
import { Button } from "@/components/atoms/button";
import { Card, CardContent } from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import { FilaPedido } from "@/components/molecules/fila-pedido";
import { ApiError } from "@/lib/api-client";
import { usePedidos } from "@/hooks/use-pedidos";

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

export function MisPedidos() {
  const { data: pedidos, error: errorCarga } = usePedidos();
  const error = errorCarga
    ? errorCarga instanceof ApiError
      ? errorCarga.message
      : "No se pudieron cargar tus pedidos"
    : undefined;

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
