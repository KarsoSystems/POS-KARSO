"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";
import { Skeleton } from "@/components/atoms/skeleton";
import { ApiError } from "@/lib/api-client";
import { usePedidoPorFolio } from "@/hooks/use-pedidos";

/**
 * Lo que abre el QR del pedido (SPEC 08): busca el pedido del usuario por folio y
 * lleva a su detalle, con la traza. Un pedido de otro cliente no se muestra.
 */
export function SeguimientoPedido({ folio }: { folio: string }) {
  const router = useRouter();
  const { data, error } = usePedidoPorFolio(folio);

  useEffect(() => {
    if (data) router.replace(`/panel/pedidos/${data.pedido.id}`);
  }, [data, router]);

  if (error) {
    const noEsta = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Alert variant="destructive">
          <AlertTitle>{noEsta ? "Pedido no encontrado" : "No se pudo cargar el pedido"}</AlertTitle>
          <AlertDescription>
            {noEsta
              ? `El pedido ${folio} no existe o es de otra cuenta. Inicia sesión con la cuenta que hizo el pedido.`
              : "Inténtalo de nuevo en un momento."}
          </AlertDescription>
        </Alert>
        <Link href="/panel/pedidos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Mis pedidos
        </Link>
      </div>
    );
  }
  return <Skeleton className="mx-auto h-48 w-full max-w-md" aria-label={`Abriendo el pedido ${folio}`} />;
}
