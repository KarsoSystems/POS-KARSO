import { z } from "zod";

// Datos fiscales para "Requiero factura" (KARSO-PROMPT-v1.md 3 y 6.1). Solo se
// guardan; no se timbra. Se validan con el formato del RFC y los catálogos del SAT
// de CFDI 4.0 (Anexo 20: c_RegimenFiscal y c_UsoCFDI) para no guardar datos que
// después no se podrían timbrar. Si el SAT cambia los catálogos, se actualizan aquí.
// No se revisa que el uso de CFDI corresponda al régimen (decisión de la SPEC 06).

export type TipoPersona = "fisica" | "moral";

export interface RegimenFiscal {
  clave: string;
  descripcion: string;
  fisica: boolean;
  moral: boolean;
}

export const REGIMENES_FISCALES: readonly RegimenFiscal[] = [
  { clave: "601", descripcion: "General de Ley Personas Morales", fisica: false, moral: true },
  { clave: "603", descripcion: "Personas Morales con Fines no Lucrativos", fisica: false, moral: true },
  { clave: "605", descripcion: "Sueldos y Salarios e Ingresos Asimilados a Salarios", fisica: true, moral: false },
  { clave: "606", descripcion: "Arrendamiento", fisica: true, moral: false },
  { clave: "607", descripcion: "Régimen de Enajenación o Adquisición de Bienes", fisica: true, moral: false },
  { clave: "608", descripcion: "Demás ingresos", fisica: true, moral: false },
  { clave: "610", descripcion: "Residentes en el Extranjero sin Establecimiento Permanente en México", fisica: true, moral: true },
  { clave: "611", descripcion: "Ingresos por Dividendos (socios y accionistas)", fisica: true, moral: false },
  { clave: "612", descripcion: "Personas Físicas con Actividades Empresariales y Profesionales", fisica: true, moral: false },
  { clave: "614", descripcion: "Ingresos por intereses", fisica: true, moral: false },
  { clave: "615", descripcion: "Régimen de los ingresos por obtención de premios", fisica: true, moral: false },
  { clave: "616", descripcion: "Sin obligaciones fiscales", fisica: true, moral: false },
  { clave: "620", descripcion: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos", fisica: false, moral: true },
  { clave: "621", descripcion: "Incorporación Fiscal", fisica: true, moral: false },
  { clave: "622", descripcion: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", fisica: false, moral: true },
  { clave: "623", descripcion: "Opcional para Grupos de Sociedades", fisica: false, moral: true },
  { clave: "624", descripcion: "Coordinados", fisica: false, moral: true },
  {
    clave: "625",
    descripcion: "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
    fisica: true,
    moral: false,
  },
  { clave: "626", descripcion: "Régimen Simplificado de Confianza", fisica: true, moral: true },
];

export const USOS_CFDI: readonly { clave: string; descripcion: string }[] = [
  { clave: "G01", descripcion: "Adquisición de mercancías" },
  { clave: "G02", descripcion: "Devoluciones, descuentos o bonificaciones" },
  { clave: "G03", descripcion: "Gastos en general" },
  { clave: "I01", descripcion: "Construcciones" },
  { clave: "I02", descripcion: "Mobiliario y equipo de oficina por inversiones" },
  { clave: "I03", descripcion: "Equipo de transporte" },
  { clave: "I04", descripcion: "Equipo de cómputo y accesorios" },
  { clave: "I05", descripcion: "Dados, troqueles, moldes, matrices y herramental" },
  { clave: "I06", descripcion: "Comunicaciones telefónicas" },
  { clave: "I07", descripcion: "Comunicaciones satelitales" },
  { clave: "I08", descripcion: "Otra maquinaria y equipo" },
  { clave: "D01", descripcion: "Honorarios médicos, dentales y gastos hospitalarios" },
  { clave: "D02", descripcion: "Gastos médicos por incapacidad o discapacidad" },
  { clave: "D03", descripcion: "Gastos funerales" },
  { clave: "D04", descripcion: "Donativos" },
  { clave: "D05", descripcion: "Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)" },
  { clave: "D06", descripcion: "Aportaciones voluntarias al SAR" },
  { clave: "D07", descripcion: "Primas por seguros de gastos médicos" },
  { clave: "D08", descripcion: "Gastos de transportación escolar obligatoria" },
  { clave: "D09", descripcion: "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones" },
  { clave: "D10", descripcion: "Pagos por servicios educativos (colegiaturas)" },
  { clave: "S01", descripcion: "Sin efectos fiscales" },
  { clave: "CP01", descripcion: "Pagos" },
  { clave: "CN01", descripcion: "Nómina" },
];

const RFC_MORAL = /^[A-ZÑ&]{3}(\d{6})[A-Z\d]{3}$/;
const RFC_FISICA = /^[A-ZÑ&]{4}(\d{6})[A-Z\d]{3}$/;

/** "fisica" (13 caracteres), "moral" (12) o null si el RFC no tiene formato válido o su fecha no existe. */
export function tipoPersona(rfc: string): TipoPersona | null {
  const coincidencia = RFC_MORAL.exec(rfc) ?? RFC_FISICA.exec(rfc);
  if (!coincidencia) return null;
  const [aa, mm, dd] = [0, 2, 4].map((i) => Number(coincidencia[1].slice(i, i + 2)));
  // Año de 2 dígitos: el 29 de febrero se acepta siempre, porque no se sabe el siglo.
  const diasDelMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  if (!diasDelMes || dd < 1 || dd > diasDelMes || Number.isNaN(aa)) return null;
  return rfc.length === 12 ? "moral" : "fisica";
}

const mayusculas = (texto: string) => texto.trim().replace(/\s+/g, " ").toUpperCase();

export const datosFiscalesSchema = z
  .object({
    rfc: z.string({ error: "RFC inválido" }).transform(mayusculas),
    razonSocial: z
      .string({ error: "Escribe la razón social" })
      .transform(mayusculas)
      .pipe(z.string().min(1, "Escribe la razón social").max(254, "La razón social no puede pasar de 254 caracteres")),
    regimenFiscal: z.string({ error: "Elige el régimen fiscal" }).trim(),
    codigoPostal: z
      .string({ error: "El código postal debe tener 5 dígitos" })
      .trim()
      .regex(/^\d{5}$/, "El código postal debe tener 5 dígitos"),
    usoCfdi: z
      .string({ error: "Elige el uso del CFDI" })
      .trim()
      .toUpperCase()
      .refine((clave) => USOS_CFDI.some((u) => u.clave === clave), "Elige el uso del CFDI"),
    correoFactura: z.string({ error: "Correo inválido" }).trim().toLowerCase().pipe(z.email("Correo inválido")),
  })
  .superRefine((datos, ctx) => {
    const persona = tipoPersona(datos.rfc);
    if (!persona) ctx.addIssue({ code: "custom", path: ["rfc"], message: "RFC inválido" });

    const regimen = REGIMENES_FISCALES.find((r) => r.clave === datos.regimenFiscal);
    if (!regimen) {
      ctx.addIssue({ code: "custom", path: ["regimenFiscal"], message: "Elige el régimen fiscal" });
    } else if (persona && !regimen[persona]) {
      ctx.addIssue({
        code: "custom",
        path: ["regimenFiscal"],
        message: `El régimen ${regimen.clave} no aplica a personas ${persona === "moral" ? "morales" : "físicas"}`,
      });
    }
  });

export type DatosFiscales = z.output<typeof datosFiscalesSchema>;
export type DatosFiscalesInput = z.input<typeof datosFiscalesSchema>;
