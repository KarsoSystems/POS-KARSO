"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { DemoNotice } from "@/components/molecules/demo-notice";
import { FormError } from "@/components/atoms/form-error";
import { SubmitButton } from "@/components/atoms/submit-button";
import { Button } from "@/components/atoms/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/atoms/form";
import { Input } from "@/components/atoms/input";
import { useRedirigirSegunEstado, useReenviarCodigo, useSesion, useVerificarWhatsapp } from "@/hooks/use-auth";
import { useCuentaRegresiva } from "@/hooks/use-cuenta-regresiva";
import { ApiError } from "@/lib/api-client";
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
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  // El código se acaba de enviar al llegar aquí: el reenvío arranca bloqueado.
  const { segundos: espera, reiniciar: setEspera } = useCuentaRegresiva(COOLDOWN_SEGUNDOS);
  const verificarWhatsapp = useVerificarWhatsapp();
  const reenviarCodigo = useReenviarCodigo();
  const reenviando = reenviarCodigo.isPending;
  const redirigirSegunEstado = useRedirigirSegunEstado();
  const { data: user } = useSesion({ alFallar: useCallback(() => router.replace("/login"), [router]) });
  const whatsapp = user?.whatsapp ?? null;
  const [aviso, setAviso] = useState<string | null>(null);

  const form = useForm<VerificarWhatsappInput>({
    resolver: zodResolver(verificarWhatsappSchema),
    defaultValues: { codigo: "" },
  });

  // El código del demo vive en sessionStorage: solo se lee en el navegador.
  useEffect(() => setCodigoDemo(leerDemoCodigo()), []);

  async function onSubmit(values: VerificarWhatsappInput) {
    setAviso(null);
    try {
      await verificarWhatsapp.mutateAsync(values);
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
    setAviso(null);
    form.clearErrors();
    try {
      const { demoCodigo, reenviarEn } = await reenviarCodigo.mutateAsync();
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
