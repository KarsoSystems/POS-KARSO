"use client";

import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { FormError } from "@/components/atoms/form-error";
import { useCerrarOtrasSesiones } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api-client";

const textoCerradas = (n: number) =>
  n === 0 ? "No había otras sesiones abiertas." : n === 1 ? "Cerramos 1 sesión." : `Cerramos ${n} sesiones.`;

/** "Cerrar sesión en los demás dispositivos" (SPEC 11), con confirmación. La sesión actual sigue. */
export function TarjetaSesiones() {
  const cerrar = useCerrarOtrasSesiones();
  const [confirmando, setConfirmando] = useState(false);
  const [cerradas, setCerradas] = useState<number | null>(null);

  function confirmar() {
    cerrar.mutate(undefined, {
      onSuccess: ({ cerradas }) => {
        setCerradas(cerradas);
        setConfirmando(false);
      },
      onError: () => setConfirmando(false),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorSmartphone className="size-4" aria-hidden />
          Sesiones
        </CardTitle>
        <CardDescription>Si entraste en otro navegador o dispositivo, puedes cerrar esas sesiones desde aquí.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          variant="outline"
          className="h-auto whitespace-normal text-left"
          onClick={() => {
            setCerradas(null);
            setConfirmando(true);
          }}
        >
          <LogOut aria-hidden />
          Cerrar sesión en los demás dispositivos
        </Button>
        {cerradas !== null && (
          <p role="status" className="text-sm text-muted-foreground">
            {textoCerradas(cerradas)}
          </p>
        )}
        <FormError message={cerrar.error instanceof ApiError ? cerrar.error.message : undefined} />
      </CardContent>

      <Dialog open={confirmando} onOpenChange={(open) => !open && !cerrar.isPending && setConfirmando(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Cerrar las demás sesiones?</DialogTitle>
            <DialogDescription>
              Los otros navegadores y dispositivos tendrán que iniciar sesión otra vez. Esta sesión sigue abierta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={cerrar.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmar} disabled={cerrar.isPending}>
              {cerrar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
              Cerrar sesiones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
