"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card";
import { FormError } from "@/components/atoms/form-error";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/atoms/form";
import { Input } from "@/components/atoms/input";
import { DemoNotice } from "@/components/molecules/demo-notice";
import { useCuentaRegresiva } from "@/hooks/use-cuenta-regresiva";
import {
  useCancelarCambioTelefono,
  usePedirCambioTelefono,
  useReenviarCodigoTelefono,
  useTelefonoEnCurso,
  useVerificarTelefono,
} from "@/hooks/use-perfil";
import { ApiError } from "@/lib/api-client";
import { guardarDemoCodigo, leerDemoCodigo } from "@/lib/demo-codigo";
import { applyApiError } from "@/lib/forms";
import { formatearWhatsapp } from "@/lib/telefono";
import { verificarWhatsappSchema, type VerificarWhatsappInput } from "@/lib/validation/auth";
import { cambioTelefonoSchema, type CambioTelefonoInput } from "@/lib/validation/perfil";

/**
 * Teléfono (SPEC 10): el número nuevo se verifica con un código por WhatsApp, como
 * en el registro. Mientras no se confirme, el número de la cuenta sigue siendo el
 * anterior. Al recargar la página, el cambio en curso se retoma.
 */
export function TarjetaTelefono({ whatsapp }: { whatsapp: string | null }) {
  const enCurso = useTelefonoEnCurso();
  const pedir = usePedirCambioTelefono();
  const verificar = useVerificarTelefono();
  const reenviar = useReenviarCodigoTelefono();
  const cancelar = useCancelarCambioTelefono();
  const [cambiando, setCambiando] = useState(false);
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState(false);
  const { segundos: espera, reiniciar: setEspera } = useCuentaRegresiva(0);
  const nuevo = enCurso.data ?? null;

  const formNumero = useForm<CambioTelefonoInput>({ resolver: zodResolver(cambioTelefonoSchema), defaultValues: { whatsapp: "" } });
  const formCodigo = useForm<VerificarWhatsappInput>({ resolver: zodResolver(verificarWhatsappSchema), defaultValues: { codigo: "" } });

  // Al retomar un cambio (recarga), el aviso de demo vuelve a mostrar el código.
  useEffect(() => {
    if (nuevo) setCodigoDemo(leerDemoCodigo());
  }, [nuevo]);

  function recibirCodigo(demoCodigo: string | undefined, reenviarEn: number) {
    guardarDemoCodigo(demoCodigo);
    setCodigoDemo(demoCodigo ?? null);
    setEspera(reenviarEn);
    formCodigo.reset({ codigo: "" });
  }

  async function onPedir(values: CambioTelefonoInput) {
    setAviso(null);
    setActualizado(false);
    try {
      const { demoCodigo, reenviarEn } = await pedir.mutateAsync(values);
      recibirCodigo(demoCodigo, reenviarEn);
      setCambiando(false);
      formNumero.reset({ whatsapp: "" });
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) setEspera(error.retryAfter);
      applyApiError(formNumero, error);
    }
  }

  async function onVerificar(values: VerificarWhatsappInput) {
    setAviso(null);
    try {
      await verificar.mutateAsync(values.codigo);
      guardarDemoCodigo(undefined);
      setCodigoDemo(null);
      setActualizado(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 410) {
        // El código ya no sirve. Si se agotó, el cambio se cerró: hay que pedirlo otra vez.
        setCodigoDemo(null);
        formCodigo.reset({ codigo: "" });
        setAviso(error.code === "CODIGO_EXPIRADO" ? `${error.message}` : `${error.message} Escribe el número otra vez.`);
        return;
      }
      applyApiError(formCodigo, error);
    }
  }

  async function onReenviar() {
    setAviso(null);
    formCodigo.clearErrors();
    try {
      const { demoCodigo, reenviarEn } = await reenviar.mutateAsync(undefined);
      recibirCodigo(demoCodigo, reenviarEn);
      setAviso("Te enviamos un código nuevo.");
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter) setEspera(error.retryAfter);
      setAviso(error instanceof ApiError ? error.message : "No se pudo reenviar el código");
    }
  }

  async function onCancelar() {
    setAviso(null);
    await cancelar.mutateAsync(undefined).catch(() => {});
    guardarDemoCodigo(undefined);
    setCodigoDemo(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="size-4" aria-hidden />
          Teléfono (WhatsApp)
        </CardTitle>
        <CardDescription>Debe ser un número con WhatsApp: ahí te avisamos de tus pedidos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          Número actual:{" "}
          <span className="font-medium whitespace-nowrap" data-testid="telefono-actual">
            {formatearWhatsapp(whatsapp)}
          </span>
        </p>
        {actualizado && (
          <p className="flex items-center gap-1 text-sm text-exito" role="status">
            <Check className="size-4" aria-hidden />
            Teléfono actualizado
          </p>
        )}
        {aviso && (
          <p role="status" className="text-sm text-muted-foreground">
            {aviso}
          </p>
        )}

        {nuevo ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enviamos un código de 6 dígitos a{" "}
              <span className="font-medium whitespace-nowrap text-foreground">{formatearWhatsapp(nuevo)}</span>. Vence en 10
              minutos.
            </p>
            <DemoNotice codigo={codigoDemo} />
            <Form {...formCodigo}>
              <form onSubmit={formCodigo.handleSubmit(onVerificar)} noValidate className="space-y-3" aria-label="Verificar el número nuevo">
                <FormError message={formCodigo.formState.errors.root?.server?.message} />
                <FormField
                  control={formCodigo.control}
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
                          className="max-w-48 font-mono tracking-[0.3em]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="outline" disabled={verificar.isPending}>
                    {verificar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                    Confirmar número
                  </Button>
                  <Button type="button" variant="ghost" onClick={onReenviar} disabled={espera > 0 || reenviar.isPending}>
                    {espera > 0 ? `Reenviar código en ${espera} s` : "Reenviar código"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={onCancelar} disabled={cancelar.isPending}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        ) : cambiando ? (
          <Form {...formNumero}>
            <form onSubmit={formNumero.handleSubmit(onPedir)} noValidate className="space-y-3" aria-label="Cambiar teléfono">
              <FormError message={formNumero.formState.errors.root?.server?.message} />
              <FormField
                control={formNumero.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número nuevo de WhatsApp</FormLabel>
                    <FormControl>
                      <Input type="tel" inputMode="tel" autoComplete="tel-national" placeholder="81 1234 5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline" disabled={pedir.isPending || espera > 0}>
                  {pedir.isPending && <Loader2 className="animate-spin" aria-hidden />}
                  {espera > 0 ? `Enviar código en ${espera} s` : "Enviar código"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCambiando(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setActualizado(false);
              setCambiando(true);
            }}
            disabled={enCurso.isPending}
          >
            Cambiar teléfono
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
