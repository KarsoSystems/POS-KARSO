"use client";

import { Loader2, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { formatearMxn } from "@/lib/pedidos/formato";
import type { PromocionAplicada } from "@/lib/pedidos-api";

interface CodigosPromocionProps {
  aplicadas: PromocionAplicada[];
  /** Resuelve si se aplicó (el campo se limpia); rechaza si no (el texto se queda para corregirlo). */
  onAplicar: (codigo: string) => Promise<unknown>;
  onQuitar: (codigo: string) => void;
  ocupado?: boolean;
  error?: string;
}

/** Códigos de promoción del pedido: campo para aplicar uno y la lista de los aplicados con su descuento. */
export function CodigosPromocion({ aplicadas, onAplicar, onQuitar, ocupado, error }: CodigosPromocionProps) {
  const id = useId();
  const [texto, setTexto] = useState("");

  async function aplicar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!texto.trim() || ocupado) return;
    try {
      await onAplicar(texto);
      setTexto("");
    } catch {
      // El mensaje llega en `error`.
    }
  }

  return (
    <div className="space-y-2">
      {/* Un form propio: Enter aplica el código sin enviar nada más. */}
      <form onSubmit={aplicar} className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Código de promoción
        </label>
        <Input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Código de promoción"
          autoCapitalize="characters"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="uppercase placeholder:normal-case"
        />
        <Button type="submit" variant="outline" disabled={ocupado || !texto.trim()}>
          {ocupado && <Loader2 className="animate-spin" aria-hidden />}
          Aplicar
        </Button>
      </form>
      {error && (
        <p className="text-sm text-destructive" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {aplicadas.length > 0 && (
        <ul className="space-y-1" aria-label="Códigos aplicados">
          {aplicadas.map((p) => (
            <li key={p.codigo} className="flex items-center gap-2 rounded-md bg-accent/40 px-2 py-1 text-sm">
              <Tag className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">
                {p.codigo} <span className="font-normal text-muted-foreground">({p.porcentaje} %)</span>
              </span>
              <span className="tabular-nums">−{formatearMxn(p.descuento)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Quitar ${p.codigo}`}
                disabled={ocupado}
                onClick={() => onQuitar(p.codigo)}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
