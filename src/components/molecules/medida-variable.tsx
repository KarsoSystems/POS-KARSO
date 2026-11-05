import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import type { MedidaVariante } from "@/lib/catalogo/schema";
import { formatearM } from "@/lib/pedidos/formato";

export interface MedidaTexto {
  ancho: string;
  alto: string;
}

interface MedidaVariableProps {
  medida: MedidaVariante;
  /** Metro lineal: el ancho es fijo y solo se captura el largo (`alto`). */
  metroLineal: boolean;
  valor: MedidaTexto;
  onCambiar: (valor: MedidaTexto) => void;
  errores: { ancho?: string; alto?: string };
}

function CampoMedida({
  id,
  etiqueta,
  valor,
  rango,
  unidad,
  error,
  onCambiar,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  rango: { min: number; max: number };
  unidad: string;
  error?: string;
  onCambiar: (valor: string) => void;
}) {
  const ayuda = `Entre ${formatearM(rango.min)} y ${formatearM(rango.max)} ${unidad}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {etiqueta} ({unidad})
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={rango.min}
        max={rango.max}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-ayuda`}
      />
      <p id={`${id}-ayuda`} className={error ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
        {error ?? ayuda}
      </p>
    </div>
  );
}

/** Ancho y alto de una lona, o largo de un metro lineal, con sus medidas rápidas. */
export function MedidaVariable({ medida, metroLineal, valor, onCambiar, errores }: MedidaVariableProps) {
  const { unidad } = medida;
  return (
    <div className="space-y-4">
      {medida.medidasRapidas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Medida rápida:</span>
          {medida.medidasRapidas.map((rapida) => (
            <Button
              key={rapida.nombre}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onCambiar({ ancho: formatearM(rapida.ancho), alto: formatearM(rapida.alto) })}
            >
              {rapida.nombre} {formatearM(rapida.ancho)} × {formatearM(rapida.alto)} {unidad}
            </Button>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {metroLineal ? (
          <p className="self-center text-sm text-muted-foreground">
            Ancho fijo: <span className="font-medium text-foreground">{formatearM(medida.ancho.min)} {unidad}</span>
          </p>
        ) : (
          <CampoMedida
            id="medida-ancho"
            etiqueta="Ancho"
            valor={valor.ancho}
            rango={medida.ancho}
            unidad={unidad}
            error={errores.ancho}
            onCambiar={(ancho) => onCambiar({ ...valor, ancho })}
          />
        )}
        <CampoMedida
          id="medida-alto"
          etiqueta={metroLineal ? "Largo" : "Alto"}
          valor={valor.alto}
          rango={medida.alto}
          unidad={unidad}
          error={errores.alto}
          onCambiar={(alto) => onCambiar({ ...valor, alto })}
        />
      </div>
    </div>
  );
}
