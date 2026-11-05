"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { FormError } from "@/components/atoms/form-error";
import { SubmitButton } from "@/components/atoms/submit-button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/atoms/form";
import { Input } from "@/components/atoms/input";
import { useCompletarPerfil, useRedirigirSegunEstado, useSesion } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api-client";
import { guardarDemoCodigo } from "@/lib/demo-codigo";
import { applyApiError } from "@/lib/forms";
import {
  completarPerfilSchema,
  type CompletarPerfilData,
  type CompletarPerfilInput,
} from "@/lib/validation/auth";

export function CompletarPerfilForm() {
  const router = useRouter();
  const form = useForm<CompletarPerfilInput, unknown, CompletarPerfilData>({
    resolver: zodResolver(completarPerfilSchema),
    defaultValues: { nombre: "", apellidoPaterno: "", apellidoMaterno: "", whatsapp: "" },
  });

  const completarPerfil = useCompletarPerfil();
  const redirigirSegunEstado = useRedirigirSegunEstado();
  const { data: user } = useSesion({ alFallar: useCallback(() => router.replace("/login"), [router]) });
  const correo = user?.correo ?? null;

  // Precarga lo que llegó de Google (nombre), una sola vez.
  const precargado = useRef(false);
  useEffect(() => {
    if (!user || precargado.current) return;
    precargado.current = true;
    if (!form.getValues("nombre")) form.setValue("nombre", user.nombre);
  }, [user, form]);

  async function onSubmit(values: CompletarPerfilData) {
    try {
      const { demoCodigo } = await completarPerfil.mutateAsync(values);
      guardarDemoCodigo(demoCodigo);
      router.replace("/registro/verificar");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
        return redirigirSegunEstado();
      }
      applyApiError(form, error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        {correo && (
          <p className="text-sm text-muted-foreground">
            Cuenta: <span className="font-medium break-all text-foreground">{correo}</span>
          </p>
        )}
        <FormError message={form.formState.errors.root?.server?.message} />

        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input autoComplete="given-name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="apellidoPaterno"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apellido paterno</FormLabel>
                <FormControl>
                  <Input autoComplete="family-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="apellidoMaterno"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apellido materno</FormLabel>
                <FormControl>
                  <Input autoComplete="additional-name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="whatsapp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp</FormLabel>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground" aria-hidden>
                  +52
                </span>
                <FormControl>
                  <Input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="55 1234 5678" {...field} />
                </FormControl>
              </div>
              <FormDescription>10 dígitos. Ahí te enviaremos el código de verificación.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton loading={form.formState.isSubmitting} loadingText="Guardando…">
          Continuar
        </SubmitButton>
      </form>
    </Form>
  );
}
