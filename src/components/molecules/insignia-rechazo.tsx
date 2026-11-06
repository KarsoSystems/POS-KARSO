import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/atoms/badge";

/** Insignia de una línea con archivos que no cumplen las reglas: se puede pedir igual. */
export function InsigniaRechazo({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    // Puede partirse en dos renglones: a 375 px no cabe junto a la miniatura y las acciones.
    <Badge className="border-amber-300 bg-amber-100 whitespace-normal text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <TriangleAlert aria-hidden />
      Podría ser rechazado
    </Badge>
  );
}
