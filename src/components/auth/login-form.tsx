"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authApi } from "@/lib/auth-api";
import { rutaParaEstado } from "@/lib/auth-routes";
import { applyApiError } from "@/lib/forms";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm() {
  const router = useRouter();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { correo: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    try {
      const { user } = await authApi.login(values);
      router.replace(rutaParaEstado(user.estado));
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
          <Link href="/registro" className="font-medium text-foreground underline underline-offset-4">
            Regístrate
          </Link>
        </p>
      </form>
    </Form>
  );
}
