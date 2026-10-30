"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { DemoNotice } from "@/components/auth/demo-notice";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-api";
import { rutaParaEstado } from "@/lib/auth-routes";
import { guardarDemoCodigo, leerDemoCodigo } from "@/lib/demo-codigo";
import { applyApiError } from "@/lib/forms";
import { verificarWhatsappSchema, type VerificarWhatsappInput } from "@/lib/validation/auth";

const COOLDOWN_SEGUNDOS = 60;

/** "+525512345678" → "+52 55 1234 5678" */
function formatearWhatsapp(whatsapp: string | null): string {
  const m = whatsapp?.match(/^\+52(\d{2})(\d{4})(\d{4})$/);
  return m ? `+52 ${m[1]} ${m[2]} ${m[3]}` : (whatsapp ?? "");
}

export function VerificarWhatsappForm() {
  const router = useRouter();
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  // El código se acaba de enviar al llegar aquí: el reenvío arranca bloqueado.
  const [espera, setEspera] = useState(COOLDOWN_SEGUNDOS);
  const [reenviando, setReenviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const form = useForm<VerificarWhatsappInput>({
    resolver: zodResolver(verificarWhatsappSchema),
    defaultValues: { codigo: "" },
  });

  useEffect(() => {
    setCodigoDemo(leerDemoCodigo());
    authApi
      .me()
      .then(({ user }) => setWhatsapp(user.whatsapp))
      .catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  async function redirigirSegunEstado() {
    try {
      const { user } = await authApi.me();
      router.replace(rutaParaEstado(user.estado));
    } catch {
      router.replace("/login");
    }
  }

  async function onSubmit(values: VerificarWhatsappInput) {
    setAviso(null);
    try {
      await authApi.verificarWhatsapp(values);
      guardarDemoCodigo(undefined);
      router.replace("/panel");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
        return redirigirSegunEstado();
      }
      if (error instanceof ApiError && error.status === 410) {
        // El código ya no sirve: se limpia el aviso y se habilita pedir otro.
        setCodigoDemo(null);
        form.reset({ codigo: "" });
      }
      applyApiError(form, error);
    }
  }

  async function reenviar() {
    setReenviando(true);
    setAviso(null);
    form.clearErrors();
    try {
      const { demoCodigo, reenviarEn } = await authApi.reenviarCodigo();
      guardarDemoCodigo(demoCodigo);
      setCodigoDemo(demoCodigo ?? null);
      setEspera(reenviarEn);
      form.reset({ codigo: "" });
      setAviso("Te enviamos un código nuevo.");
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) setEspera(error.retryAfter);
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
        return redirigirSegunEstado();
      }
      applyApiError(form, error);
    } finally {
      setReenviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enviamos un código de 6 dígitos a tu WhatsApp
        {whatsapp && (
          <>
            {" "}
            <span className="font-medium whitespace-nowrap text-foreground">{formatearWhatsapp(whatsapp)}</span>
          </>
        )}
        . Vence en 10 minutos.
      </p>

      <DemoNotice codigo={codigoDemo} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError message={form.formState.errors.root?.server?.message} />
          {aviso && (
            <p role="status" className="text-sm text-muted-foreground">
              {aviso}
            </p>
          )}

          <FormField
            control={form.control}
            name="codigo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código de verificación</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center font-mono text-lg tracking-[0.5em]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <SubmitButton loading={form.formState.isSubmitting} loadingText="Verificando…">
            Verificar
          </SubmitButton>
        </form>
      </Form>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={reenviar}
        disabled={espera > 0 || reenviando}
      >
        {espera > 0 ? `Reenviar código en ${espera} s` : reenviando ? "Enviando…" : "Reenviar código"}
      </Button>
    </div>
  );
}
