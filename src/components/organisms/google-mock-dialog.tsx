"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormError } from "@/components/atoms/form-error";
import { SubmitButton } from "@/components/atoms/submit-button";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/atoms/form";
import { Input } from "@/components/atoms/input";
import { useGoogleMock } from "@/hooks/use-auth";
import { destinoPara } from "@/lib/auth-routes";
import { applyApiError } from "@/lib/forms";
import { googleMockSchema, type GoogleMockData, type GoogleMockInput } from "@/lib/validation/auth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

/** Botón "Continuar con Google" del demo: pide nombre y correo, sin OAuth real. */
/** `siguiente`: la página del panel a la que volver al terminar (SPEC 08), ya validada por la página. */
export function GoogleMockDialog({ siguiente = null }: { siguiente?: string | null }) {
  const router = useRouter();
  const googleMock = useGoogleMock();
  const [open, setOpen] = useState(false);
  const form = useForm<GoogleMockInput, unknown, GoogleMockData>({
    resolver: zodResolver(googleMockSchema),
    defaultValues: { nombre: "", correo: "" },
  });

  async function onSubmit(values: GoogleMockData) {
    try {
      const { user } = await googleMock.mutateAsync(values);
      router.replace(destinoPara(user.estado, siguiente));
    } catch (error) {
      applyApiError(form, error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <GoogleIcon />
          Continuar con Google
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <FlaskConical className="size-3.5" aria-hidden />
            Simulación de Google
          </span>
          <DialogTitle>Elige una cuenta</DialogTitle>
          <DialogDescription>
            En el demo no se conecta con Google. Escribe el nombre y correo de la cuenta que quieres simular.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormError message={form.formState.errors.root?.server?.message} />
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre en Google</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="correo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo de Google</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder="tu@gmail.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SubmitButton loading={form.formState.isSubmitting} loadingText="Entrando…">
              Continuar
            </SubmitButton>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Separador "o" entre el formulario y el botón de Google. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
      <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
    </div>
  );
}
