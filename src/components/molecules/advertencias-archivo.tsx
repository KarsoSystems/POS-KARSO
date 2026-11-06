import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";
import { cn } from "@/lib/utils";

/**
 * Motivos por los que el archivo podría rechazarse (KARSO 5.7). Solo advierte: la
 * línea se guarda igual y mostrador decide al revisar el pedido.
 */
export function AdvertenciasArchivo({
  advertencias,
  className,
}: {
  advertencias: { mensaje: string }[];
  className?: string;
}) {
  if (advertencias.length === 0) return null;
  return (
    <Alert
      className={cn(
        "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
        className,
      )}
    >
      <TriangleAlert />
      <AlertTitle className="line-clamp-none">Tu archivo podría ser rechazado al revisarlo en sucursal</AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        <ul className="list-disc space-y-1 pl-4">
          {advertencias.map((a) => (
            <li key={a.mensaje}>{a.mensaje}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
