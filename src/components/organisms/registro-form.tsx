"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { useRegistro } from "@/hooks/use-auth";
import { guardarDemoCodigo } from "@/lib/demo-codigo";
import { applyApiError } from "@/lib/forms";
import { registroSchema, type RegistroData, type RegistroInput } from "@/lib/validation/auth";

export function RegistroForm() {
  const router = useRouter();
  const registro = useRegistro();
  const form = useForm<RegistroInput, unknown, RegistroData>({
    resolver: zodResolver(registroSchema),
    defaultValues: {
      nombre: "",
      apellidoPaterno: "",
      apellidoMaterno: "",
      whatsapp: "",
      correo: "",
      password: "",
    },
  });

  async function onSubmit(values: RegistroData) {
    try {
      const { demoCodigo } = await registro.mutateAsync(values);
      guardarDemoCodigo(demoCodigo);
      router.replace("/registro/verificar");
    } catch (error) {
      applyApiError(form, error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
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

        <FormField
          control={form.control}
          name="correo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="tu@correo.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>Mínimo 8 caracteres, con al menos una letra y un número.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton loading={form.formState.isSubmitting} loadingText="Creando cuenta…">
          Crear cuenta
        </SubmitButton>

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Inicia sesión
          </Link>
        </p>
      </form>
    </Form>
  );
}
