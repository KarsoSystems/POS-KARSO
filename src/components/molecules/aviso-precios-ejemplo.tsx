import { FlaskConical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";

/** Aviso cuando el catálogo tiene `ejemplo: true`: los precios no son reales. */
export function AvisoPreciosEjemplo({ ejemplo }: { ejemplo: boolean | undefined }) {
  if (!ejemplo) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <FlaskConical />
      <AlertTitle>Precios de ejemplo</AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        Los precios y medidas son de demostración; la imprenta los reemplazará por los reales.
      </AlertDescription>
    </Alert>
  );
}
