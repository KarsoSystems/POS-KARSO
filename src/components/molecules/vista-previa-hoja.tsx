"use client";

import { useId } from "react";
import type { Acomodo, Medidas } from "@/lib/pedidos/acomodo";
import { geometriaHoja, leyendaHoja } from "@/lib/pedidos/vista-previa";
import { urlArchivo } from "@/lib/archivos";
import type { PublicArchivo } from "@/lib/pedidos-api";

interface VistaPreviaHojaProps {
  hoja: { nombre: string; anchoCm: number; altoCm: number };
  pieza: Medidas; // medidas originales del diseño, sin girar
  acomodo: Acomodo;
  margenCm: number;
  separacionCm: number;
  /** Total de hojas; se omite de la leyenda si aún no se conoce. */
  hojas?: number;
  archivo: PublicArchivo | null | undefined;
}

/** Recorta el nombre para que quepa en la pieza (~0.6 em por carácter). */
function nombreQueCabe(nombre: string, anchoMm: number, fuenteMm: number): string {
  const max = Math.max(3, Math.floor(anchoMm / (fuenteMm * 0.6)));
  return nombre.length <= max ? nombre : `${nombre.slice(0, max - 1)}…`;
}

/**
 * Hoja a escala (viewBox en milímetros) con el margen punteado y la cuadrícula
 * de piezas. JPG/PNG se dibujan en cada pieza (girados si el acomodo los giró);
 * PDF, AI y PSD nunca se cargan: se dibuja un rectángulo con el nombre.
 */
export function VistaPreviaHoja({
  hoja,
  pieza,
  acomodo,
  margenCm,
  separacionCm,
  hojas,
  archivo,
}: VistaPreviaHojaProps) {
  const idPieza = `pieza-${useId().replace(/[^\w-]/g, "")}`;
  const g = geometriaHoja(hoja, pieza, acomodo, margenCm, separacionCm);
  const leyenda = leyendaHoja(hoja, acomodo.piezasPorHoja, hojas);

  // Diseño en su orientación original (ancho × alto, en mm).
  const disenoAncho = acomodo.rotada ? g.pieza.alto : g.pieza.ancho;
  const disenoAlto = acomodo.rotada ? g.pieza.ancho : g.pieza.alto;
  const fuente = Math.max(2, Math.min(g.pieza.ancho, g.pieza.alto) * 0.1);
  const trazo = Math.max(0.3, g.hoja.ancho / 400);

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${g.hoja.ancho} ${g.hoja.alto}`}
        role="img"
        aria-label={`Vista previa: ${leyenda}`}
        className="mx-auto block max-h-[28rem] w-full"
      >
        <defs>
          {/* La pieza se define una vez y se repite con <use>: con cientos de piezas la imagen se decodifica una sola vez. */}
          <g id={idPieza}>
            <rect
              width={g.pieza.ancho}
              height={g.pieza.alto}
              className="fill-muted stroke-muted-foreground/60"
              strokeWidth={trazo}
            />
            {archivo?.previsualizable ? (
              <g transform={acomodo.rotada ? `translate(${g.pieza.ancho} 0) rotate(90)` : undefined}>
                <image
                  href={urlArchivo(archivo.id)}
                  width={disenoAncho}
                  height={disenoAlto}
                  preserveAspectRatio="xMidYMid meet"
                />
              </g>
            ) : (
              <text
                x={g.pieza.ancho / 2}
                y={g.pieza.alto / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fuente}
                className="fill-muted-foreground"
              >
                {nombreQueCabe(archivo?.nombreOriginal ?? "Archivo", g.pieza.ancho, fuente)}
              </text>
            )}
          </g>
        </defs>

        <rect
          width={g.hoja.ancho}
          height={g.hoja.alto}
          className="fill-white stroke-border dark:fill-neutral-100"
          strokeWidth={trazo * 2}
        />
        <rect
          x={g.util.x}
          y={g.util.y}
          width={g.util.ancho}
          height={g.util.alto}
          fill="none"
          className="stroke-muted-foreground/70"
          strokeWidth={trazo}
          strokeDasharray={`${trazo * 6} ${trazo * 4}`}
        />
        {g.piezas.map((p, i) => (
          <use key={i} href={`#${idPieza}`} x={p.x} y={p.y} data-pieza={i} />
        ))}
      </svg>
      <figcaption className="text-center text-sm text-muted-foreground">{leyenda}</figcaption>
    </figure>
  );
}
