"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import {
  datosFiscalesSchema,
  REGIMENES_FISCALES,
  USOS_CFDI,
  type DatosFiscales,
  type DatosFiscalesInput,
} from "@/lib/validation/fiscal";
import { cn } from "@/lib/utils";

type Campo = keyof DatosFiscalesInput;

interface FormularioDatosFiscalesProps {
  /** Los del borrador (precargados del perfil al pedir factura), o null. */
  valor: DatosFiscales | null;
  /** Resuelve si se guardaron; rechaza si no (los errores del servidor llegan en `errores`). */
  onGuardar: (datos: DatosFiscales, guardarEnPerfil: boolean) => Promise<unknown>;
  guardando?: boolean;
  /** Errores del servidor por campo (`rfc`, `regimenFiscal`, …). */
  errores?: Partial<Record<Campo, string>>;
  /** "Guardar en mi perfil": solo en el checkout; en "Mi perfil" (SPEC 10) ya se guardan ahí. */
  conOpcionPerfil?: boolean;
}

const VACIOS: DatosFiscalesInput = {
  rfc: "",
  razonSocial: "",
  regimenFiscal: "",
  codigoPostal: "",
  usoCfdi: "",
  correoFactura: "",
};

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-border bg-input px-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

const iguales = (a: DatosFiscalesInput, b: DatosFiscales | null) =>
  b !== null && (Object.keys(VACIOS) as Campo[]).every((campo) => a[campo] === b[campo]);

/**
 * Datos fiscales para "Requiero factura" (KARSO 6.1), con los catálogos del SAT de
 * CFDI 4.0. Se validan igual que en el servidor antes de guardar. "Guardar en mi
 * perfil" viene marcada: así se precargan en el siguiente pedido.
 */
export function FormularioDatosFiscales({
  valor,
  onGuardar,
  guardando,
  errores = {},
  conOpcionPerfil = true,
}: FormularioDatosFiscalesProps) {
  const id = useId();
  const [campos, setCampos] = useState<DatosFiscalesInput>(valor ?? VACIOS);
  const [locales, setLocales] = useState<Partial<Record<Campo, string>>>({});
  const [enPerfil, setEnPerfil] = useState(true);

  // Si los datos guardados cambian (precarga del perfil, otra pestaña, se borraron), el formulario los toma.
  useEffect(() => {
    setCampos(valor ?? VACIOS);
  }, [valor]);

  const guardados = iguales(campos, valor);
  const mensajes = { ...errores, ...locales };

  function cambiar(campo: Campo, texto: string) {
    setCampos((actual) => ({ ...actual, [campo]: texto }));
    setLocales((actual) => ({ ...actual, [campo]: undefined }));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = datosFiscalesSchema.safeParse(campos);
    if (!resultado.success) {
      const nuevos: Partial<Record<Campo, string>> = {};
      for (const issue of resultado.error.issues) nuevos[issue.path[0] as Campo] ??= issue.message;
      return setLocales(nuevos);
    }
    setLocales({});
    setCampos(resultado.data);
    await onGuardar(resultado.data, enPerfil).catch(() => {});
  }

  const campo = (nombre: Campo) => ({
    id: `${id}-${nombre}`,
    value: campos[nombre],
    "aria-invalid": mensajes[nombre] ? true : undefined,
    "aria-describedby": mensajes[nombre] ? `${id}-${nombre}-error` : undefined,
  });
  const error = (nombre: Campo) =>
    mensajes[nombre] && (
      <p className="text-sm text-destructive" id={`${id}-${nombre}-error`}>
        {mensajes[nombre]}
      </p>
    );

  return (
    <form onSubmit={guardar} noValidate className="space-y-3" aria-label="Datos fiscales">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-rfc`}>RFC</Label>
          <Input
            {...campo("rfc")}
            onChange={(e) => cambiar("rfc", e.target.value)}
            maxLength={13}
            autoCapitalize="characters"
            className="uppercase"
          />
          {error("rfc")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-codigoPostal`}>Código postal</Label>
          <Input
            {...campo("codigoPostal")}
            onChange={(e) => cambiar("codigoPostal", e.target.value)}
            inputMode="numeric"
            maxLength={5}
          />
          {error("codigoPostal")}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-razonSocial`}>Razón social</Label>
        <Input
          {...campo("razonSocial")}
          onChange={(e) => cambiar("razonSocial", e.target.value)}
          maxLength={254}
          className="uppercase"
        />
        {error("razonSocial") ?? (
          <p className="text-xs text-muted-foreground">
            Como aparece en tu Constancia de Situación Fiscal, sin el régimen societario (p. ej. sin «S.A. de C.V.»).
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-regimenFiscal`}>Régimen fiscal</Label>
        <select {...campo("regimenFiscal")} onChange={(e) => cambiar("regimenFiscal", e.target.value)} className={selectClass}>
          <option value="">Elige el régimen fiscal</option>
          {REGIMENES_FISCALES.map((r) => (
            <option key={r.clave} value={r.clave}>
              {r.clave} · {r.descripcion}
            </option>
          ))}
        </select>
        {error("regimenFiscal")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-usoCfdi`}>Uso del CFDI</Label>
        <select {...campo("usoCfdi")} onChange={(e) => cambiar("usoCfdi", e.target.value)} className={selectClass}>
          <option value="">Elige el uso del CFDI</option>
          {USOS_CFDI.map((u) => (
            <option key={u.clave} value={u.clave}>
              {u.clave} · {u.descripcion}
            </option>
          ))}
        </select>
        {error("usoCfdi")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-correoFactura`}>Correo para la factura</Label>
        <Input
          {...campo("correoFactura")}
          onChange={(e) => cambiar("correoFactura", e.target.value)}
          type="email"
          autoComplete="email"
        />
        {error("correoFactura")}
      </div>

      {conOpcionPerfil && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={enPerfil}
            onChange={(e) => setEnPerfil(e.target.checked)}
          />
          Guardar en mi perfil
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={guardando}>
          {guardando && <Loader2 className="animate-spin" aria-hidden />}
          Guardar datos fiscales
        </Button>
        <p
          className={cn("flex items-center gap-1 text-sm text-exito", !guardados && "invisible")}
          aria-live="polite"
        >
          <Check className="size-4" aria-hidden />
          {guardados ? "Datos guardados" : ""}
        </p>
      </div>
    </form>
  );
}
