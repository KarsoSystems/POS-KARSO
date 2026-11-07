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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/atoms/form";
import { Input } from "@/components/atoms/input";
import { useLogin } from "@/hooks/use-auth";
import { conSiguiente, destinoPara } from "@/lib/auth-routes";
import { applyApiError } from "@/lib/forms";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

/** `siguiente`: la página del panel a la que volver al terminar (SPEC 08), ya validada por la página. */
export function LoginForm({ siguiente = null }: { siguiente?: string | null }) {
  const router = useRouter();
  const login = useLogin();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { correo: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    try {
      const { user } = await login.mutateAsync(values);
      router.replace(destinoPara(user.estado, siguiente));
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
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton loading={form.formState.isSubmitting} loadingText="Entrando…">
          Iniciar sesión
        </SubmitButton>

        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <Link href={conSiguiente("/registro", siguiente)} className="font-medium text-foreground underline underline-offset-4">
            Regístrate
          </Link>
        </p>
      </form>
    </Form>
  );
}
