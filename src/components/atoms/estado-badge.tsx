import { Badge } from "@/components/atoms/badge";
import { ETIQUETA_ESTATUS, type EstatusPedido } from "@/lib/pedidos/formato";
import { cn } from "@/lib/utils";

const AZUL = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
const AMBAR = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
const ROJO = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";

/** Colores por estatus de KARSO: espera del cliente (ámbar), en la imprenta (azul), listo (verde), problema (rojo). */
const COLOR: Record<EstatusPedido, string> = {
  borrador: "bg-muted text-muted-foreground",
  pago_pendiente: AMBAR,
  enviado: AZUL,
  recibido: AZUL,
  en_proceso: AZUL,
  listo: "bg-exito/15 text-exito",
  entregado: "bg-exito/15 text-exito",
  rechazado: ROJO,
  cancelado: ROJO,
};

export function EstadoBadge({ estatus, className }: { estatus: EstatusPedido; className?: string }) {
  return <Badge className={cn(COLOR[estatus], className)}>{ETIQUETA_ESTATUS[estatus]}</Badge>;
}
