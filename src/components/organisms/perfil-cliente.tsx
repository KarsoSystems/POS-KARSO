"use client";

import { FileText, Loader2, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import { FormError } from "@/components/atoms/form-error";
import { Skeleton } from "@/components/atoms/skeleton";
import { FormularioDatosFiscales } from "@/components/molecules/formulario-datos-fiscales";
import { TarjetaContrasena } from "@/components/organisms/tarjeta-contrasena";
import { TarjetaDireccion } from "@/components/organisms/tarjeta-direccion";
import { TarjetaSesiones } from "@/components/organisms/tarjeta-sesiones";
import { TarjetaTelefono } from "@/components/organisms/tarjeta-telefono";
import { useSesion } from "@/hooks/use-auth";
import { useBorrarDatosFiscales, useGuardarDatosFiscales } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api-client";
import type { PublicUser } from "@/lib/auth-api";

/** Número de cliente, nombre y correo: solo lectura (KARSO 5.1). */
function DatosPersonales({ user }: { user: PublicUser }) {
  const nombre = [user.nombre, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(" ");
  const fila = "grid grid-cols-[8rem_minmax(0,1fr)] gap-2";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="size-4" aria-hidden />
          Datos personales
        </CardTitle>
        <CardDescription>El nombre y el correo no se pueden cambiar.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1 text-sm" aria-label="Datos personales">
          <div className={fila}>
            <dt className="text-muted-foreground">Número de cliente</dt>
            <dd className="font-mono">{user.idCliente}</dd>
          </div>
          <div className={fila}>
            <dt className="text-muted-foreground">Nombre</dt>
            <dd className="break-words">{nombre}</dd>
          </div>
          <div className={fila}>
            <dt className="text-muted-foreground">Correo</dt>
            <dd className="break-all">{user.correo}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Datos fiscales (SPEC 06) editables desde el perfil, y "Borrar". Los pedidos hechos conservan su copia. */
function DatosFiscalesPerfil({ user }: { user: PublicUser }) {
  const guardar = useGuardarDatosFiscales();
  const borrar = useBorrarDatosFiscales();
  const [borrados, setBorrados] = useState(false);
  // "datosFiscales.rfc" → "rfc", como en el checkout.
  const errores =
    guardar.error instanceof ApiError
      ? Object.fromEntries(
          Object.entries(guardar.error.fields)
            .filter(([ruta]) => ruta.startsWith("datosFiscales."))
            .map(([ruta, mensaje]) => [ruta.slice("datosFiscales.".length), mensaje]),
        )
      : {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" aria-hidden />
          Datos fiscales
        </CardTitle>
        <CardDescription>Se precargan cuando pides factura en un pedido.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormularioDatosFiscales
          valor={user.datosFiscales}
          onGuardar={(datos) => {
            setBorrados(false);
            return guardar.mutateAsync(datos);
          }}
          guardando={guardar.isPending}
          errores={errores}
          conOpcionPerfil={false}
        />
        {user.datosFiscales && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={() => borrar.mutate(undefined, { onSuccess: () => setBorrados(true) })}
            disabled={borrar.isPending}
          >
            {borrar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            Borrar datos fiscales
          </Button>
        )}
        {borrados && !user.datosFiscales && (
          <p role="status" className="text-sm text-muted-foreground">
            Datos fiscales borrados.
          </p>
        )}
        <FormError message={borrar.error instanceof ApiError ? borrar.error.message : undefined} />
      </CardContent>
    </Card>
  );
}

/**
 * "Mi perfil" (SPEC 10; KARSO 5.1): datos personales de solo lectura y tarjetas que
 * se guardan por separado, para que el error de una no bloquee a las demás.
 */
export function PerfilCliente() {
  const sesion = useSesion();
  const user = sesion.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
      <FormError message={sesion.error ? "No se pudo cargar tu perfil" : undefined} />
      {!user && !sesion.error && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {user && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <div className="min-w-0 space-y-6">
            <DatosPersonales user={user} />
            <TarjetaTelefono whatsapp={user.whatsapp} />
            <TarjetaContrasena tieneContrasena={user.providers.includes("password")} />
            <TarjetaSesiones />
          </div>
          <div className="min-w-0 space-y-6">
            <TarjetaDireccion user={user} />
            <DatosFiscalesPerfil user={user} />
          </div>
        </div>
      )}
    </div>
  );
}
