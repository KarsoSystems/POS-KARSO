"use client";

import { Check, Loader2, MapPin } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import { FormError } from "@/components/atoms/form-error";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { useGuardarDireccion } from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api-client";
import type { PublicUser } from "@/lib/auth-api";
import { direccionNegocioSchema } from "@/lib/validation/perfil";

type CampoDireccion = "calle" | "colonia" | "ciudad" | "estado" | "codigoPostal";

const CAMPOS: { campo: CampoDireccion; etiqueta: string; ayuda?: string }[] = [
  { campo: "calle", etiqueta: "Calle y número", ayuda: "Ej. Av. Juárez 123" },
  { campo: "colonia", etiqueta: "Colonia" },
  { campo: "ciudad", etiqueta: "Ciudad" },
  { campo: "estado", etiqueta: "Estado" },
  { campo: "codigoPostal", etiqueta: "Código postal" },
];

const VACIA: Record<CampoDireccion, string> = { calle: "", colonia: "", ciudad: "", estado: "", codigoPostal: "" };

/**
 * Dirección y negocio (SPEC 10; KARSO 5.1 y 6.1). "Soy socio" hace obligatorios el
 * nombre del negocio y la dirección; un ocasional puede dejar la dirección vacía.
 */
export function TarjetaDireccion({ user }: { user: PublicUser }) {
  const id = useId();
  const guardar = useGuardarDireccion();
  const [socio, setSocio] = useState(user.tipo === "socio");
  const [negocio, setNegocio] = useState(user.nombreNegocio ?? "");
  const [direccion, setDireccion] = useState(user.direccion ?? VACIA);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [guardada, setGuardada] = useState(false);

  // Lo guardado cambió (esta tarjeta u otra pestaña): el formulario lo toma.
  useEffect(() => {
    setSocio(user.tipo === "socio");
    setNegocio(user.nombreNegocio ?? "");
    setDireccion(user.direccion ?? VACIA);
  }, [user.tipo, user.nombreNegocio, user.direccion]);

  const tocar = (campo: string) => {
    setGuardada(false);
    setErrores((actual) => ({ ...actual, [campo]: "" }));
  };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setGuardada(false);
    setError(undefined);
    // Un ocasional que no escribió nada no tiene dirección.
    const vacia = Object.values(direccion).every((v) => v.trim() === "");
    const datos = { tipo: socio ? "socio" : "ocasional", nombreNegocio: socio ? negocio : null, direccion: vacia ? null : direccion };
    const local = direccionNegocioSchema.safeParse(datos);
    if (!local.success) {
      setErrores(Object.fromEntries(local.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }
    setErrores({});
    try {
      await guardar.mutateAsync(local.data);
      setGuardada(true);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrores(err.fields);
      else setError(err instanceof ApiError ? err.message : "No se pudo guardar la dirección");
    }
  }

  const mensaje = (campo: string) =>
    errores[campo] ? (
      <p id={`${id}-${campo}-error`} className="text-sm text-destructive">
        {errores[campo]}
      </p>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4" aria-hidden />
          Dirección y negocio
        </CardTitle>
        <CardDescription>
          {socio ? "Como socio, el nombre del negocio y la dirección son obligatorios." : "La dirección es opcional."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} noValidate className="space-y-3" aria-label="Dirección y negocio">
          <FormError message={error} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={socio}
              onChange={(e) => {
                tocar("nombreNegocio");
                setSocio(e.target.checked);
              }}
            />
            Soy socio (tengo un negocio)
          </label>
          {socio && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-negocio`}>Nombre del negocio</Label>
              <Input
                id={`${id}-negocio`}
                value={negocio}
                maxLength={120}
                onChange={(e) => {
                  tocar("nombreNegocio");
                  setNegocio(e.target.value);
                }}
                aria-invalid={errores.nombreNegocio ? true : undefined}
                aria-describedby={errores.nombreNegocio ? `${id}-nombreNegocio-error` : undefined}
              />
              {mensaje("nombreNegocio")}
            </div>
          )}
          {mensaje("direccion")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMPOS.map(({ campo, etiqueta, ayuda }) => {
              const ruta = `direccion.${campo}`;
              return (
                <div key={campo} className={campo === "calle" ? "min-w-0 space-y-1.5 sm:col-span-2" : "min-w-0 space-y-1.5"}>
                  <Label htmlFor={`${id}-${campo}`}>{etiqueta}</Label>
                  <Input
                    id={`${id}-${campo}`}
                    value={direccion[campo]}
                    placeholder={ayuda}
                    inputMode={campo === "codigoPostal" ? "numeric" : undefined}
                    maxLength={campo === "codigoPostal" ? 5 : 160}
                    onChange={(e) => {
                      tocar(ruta);
                      setDireccion((actual) => ({ ...actual, [campo]: e.target.value }));
                    }}
                    aria-invalid={errores[ruta] ? true : undefined}
                    aria-describedby={errores[ruta] ? `${id}-${ruta}-error` : undefined}
                  />
                  {mensaje(ruta)}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Guardar dirección
            </Button>
            {guardada && (
              <p className="flex items-center gap-1 text-sm text-exito" role="status">
                <Check className="size-4" aria-hidden />
                Dirección guardada
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
