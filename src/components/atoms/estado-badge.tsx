import { Badge } from "@/components/atoms/badge";
import { ETIQUETA_ESTADO, type EstadoPedido } from "@/lib/pedidos/formato";
import { cn } from "@/lib/utils";

const COLOR: Record<EstadoPedido, string> = {
  borrador: "bg-muted text-muted-foreground",
  pedido: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  en_proceso: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  entregado: "bg-exito/15 text-exito",
  cancelado: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function EstadoBadge({ estado, className }: { estado: EstadoPedido; className?: string }) {
  return <Badge className={cn(COLOR[estado], className)}>{ETIQUETA_ESTADO[estado]}</Badge>;
}
