"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import { FormError } from "@/components/atoms/form-error";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/atoms/form";
import { Input } from "@/components/atoms/input";
import { useCambiarContrasena } from "@/hooks/use-perfil";
import { applyApiError } from "@/lib/forms";
import { contrasenaSchema, type ContrasenaInput } from "@/lib/validation/perfil";

/**
 * Contraseña (SPEC 10): la nueva y su confirmación. Desde la SPEC 11 pide la actual
 * si la cuenta ya tiene una, y al guardar se cierran las sesiones de los demás
 * dispositivos. Una cuenta que solo entra con Google la crea sin la actual y desde
 * entonces también entra con correo y contraseña.
 */
export function TarjetaContrasena({ tieneContrasena }: { tieneContrasena: boolean }) {
  const cambiar = useCambiarContrasena();
  const [guardada, setGuardada] = useState(false);
  const form = useForm<ContrasenaInput>({
    resolver: zodResolver(contrasenaSchema),
    defaultValues: { contrasenaActual: "", password: "", confirmacion: "" },
  });

  async function onSubmit(values: ContrasenaInput) {
    setGuardada(false);
    try {
      await cambiar.mutateAsync(values);
      form.reset({ contrasenaActual: "", password: "", confirmacion: "" });
      setGuardada(true);
    } catch (error) {
      applyApiError(form, error);
    }
  }

  const titulo = tieneContrasena ? "Cambiar contraseña" : "Crear contraseña";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" aria-hidden />
          {titulo}
        </CardTitle>
        <CardDescription>
          {tieneContrasena
            ? "Al menos 8 caracteres, con una letra y un número."
            : "Entras con Google. Crea una contraseña para entrar también con tu correo."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-3" aria-label={titulo}>
            <FormError message={form.formState.errors.root?.server?.message} />
            {tieneContrasena && (
              <FormField
                control={form.control}
                name="contrasenaActual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña actual</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nueva contraseña</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...field}
                      onChange={(e) => {
                        setGuardada(false);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmacion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirma la contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline" disabled={cambiar.isPending}>
                {cambiar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {tieneContrasena ? "Cambiar contraseña" : "Crear contraseña"}
              </Button>
              {guardada && (
                <p className="flex items-center gap-1 text-sm text-exito" role="status">
                  <Check className="size-4" aria-hidden />
                  Contraseña guardada. Cerramos tus otras sesiones.
                </p>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
