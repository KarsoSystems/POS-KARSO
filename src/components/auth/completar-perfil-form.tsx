"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-api";
import { rutaParaEstado } from "@/lib/auth-routes";
import { guardarDemoCodigo } from "@/lib/demo-codigo";
import { applyApiError } from "@/lib/forms";
import {
  completarPerfilSchema,
  type CompletarPerfilData,
  type CompletarPerfilInput,
} from "@/lib/validation/auth";

export function CompletarPerfilForm() {
  const router = useRouter();
  const [correo, setCorreo] = useState<string | null>(null);
  const form = useForm<CompletarPerfilInput, unknown, CompletarPerfilData>({
    resolver: zodResolver(completarPerfilSchema),
    defaultValues: { nombre: "", apellidoPaterno: "", apellidoMaterno: "", whatsapp: "" },
  });

  // Precarga lo que llegó de Google (nombre) y muestra el correo de la cuenta.
  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => {
        setCorreo(user.correo);
        if (!form.getValues("nombre")) form.setValue("nombre", user.nombre);
      })
      .catch(() => router.replace("/login"));
  }, [form, router]);

  async function onSubmit(values: CompletarPerfilData) {
    try {
      const { demoCodigo } = await authApi.completarPerfil(values);
      guardarDemoCodigo(demoCodigo);
      router.replace("/registro/verificar");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
        try {
          const { user } = await authApi.me();
          return router.replace(rutaParaEstado(user.estado));
        } catch {
          return router.replace("/login");
        }
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
