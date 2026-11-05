import { FlaskConical } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert";

/** Aviso amarillo del modo demo: muestra el código que "llegaría" por WhatsApp. */
export function DemoNotice({ codigo }: { codigo: string | null }) {
  if (!codigo) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <FlaskConical />
      <AlertTitle>
        Modo demo: tu código es <span className="font-mono tracking-widest">{codigo}</span>
      </AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        No se envían mensajes reales. El código también aparece en la consola del servidor.
      </AlertDescription>
    </Alert>
  );
}
