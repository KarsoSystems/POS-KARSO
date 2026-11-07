"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** El enlace que lleva el QR: la página de seguimiento de la tienda, con el folio (lo lee mostrador al escanear). */
export const enlaceSeguimiento = (origen: string, folio: string) =>
  `${origen}/panel/seguimiento/${encodeURIComponent(folio)}`;

/**
 * QR del pedido (KARSO `qr` = folio). Abre la traza del pedido para su dueño; el
 * origen es el de la tienda donde se ve, así funciona en local y en producción.
 */
export function QrSeguimiento({ folio, grande = false }: { folio: string; grande?: boolean }) {
  const [enlace, setEnlace] = useState<string>();
  const [imagen, setImagen] = useState<string>();

  useEffect(() => {
    const url = enlaceSeguimiento(window.location.origin, folio);
    setEnlace(url);
    let vigente = true;
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" })
      .then((svg) => vigente && setImagen(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => vigente && setImagen(undefined));
    return () => {
      vigente = false;
    };
  }, [folio]);

  const lado = grande ? "size-56" : "size-32";
  return (
    <figure className="flex flex-col items-center gap-2" data-testid="qr-seguimiento" data-enlace={enlace}>
      <div className={cn("rounded-md bg-white p-1", lado)}>
        {imagen && (
          // eslint-disable-next-line @next/next/no-img-element -- SVG generado en el navegador, no un archivo
          <img src={imagen} alt={`Código QR del pedido ${folio}`} className="size-full" />
        )}
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">
        {grande ? <span className="block text-sm font-medium text-foreground">Muéstralo al recoger</span> : null}
        <span className="font-mono">{folio}</span>
      </figcaption>
    </figure>
  );
}
