import type { Totales } from "@/lib/pedidos/cotizacion";
import type { EstadoPedido } from "@/lib/pedidos/formato";
import type { LineaConArchivos } from "@/lib/pedidos/linea";
import type { Direccion } from "@/lib/sucursales/schema";
import type { DatosFiscales } from "@/lib/validation/fiscal";

// EstadoPedido, Totales y LineaCotizada viven en src/lib porque el front los usa
// (cotización en vivo, etiquetas); se re-exportan aquí como dominio.
export type { EstadoPedido, Totales };
export type { EspecificacionLinea, MedidaLinea } from "@/lib/pedidos/cotizacion";
export type { Advertencia, ArchivoLinea, ArchivosLinea, ReversoLinea } from "@/lib/pedidos/archivo-linea";

/**
 * Línea del pedido con la forma de KARSO-PROMPT-v1.md 6.5: copia los datos de la
 * variante al guardarse, para que cambios del catálogo no afecten pedidos hechos.
 */
export interface LineaPedido extends LineaConArchivos {
  lineaId: string; // UUID
  // archivos: { frente, reverso } con los datos y advertencias de cada cara (SPEC 05)
  descripcion: string; // 0–500 caracteres
  problema: string | null; // propio del demo, p. ej. "Couché 8.7 x 5 cm ya no está disponible"
}

/** Copia de la sucursal al elegirla: el pedido conserva lo que vio el cliente aunque el panel la cambie. */
export interface SucursalEntrega {
  nombre: string;
  direccion: Direccion;
  telefono: string;
  horario: string;
}

/** Un código aplicado al pedido (KARSO 6.5), con lo que descontó. */
export interface PromocionAplicada {
  promocionId: string;
  codigo: string;
  porcentaje: number;
  descuento: number; // en pesos
}

/** Pedido con los totales de KARSO 5.4 (subtotal, descuento, baseIva, tasaIva, iva, total), en pesos. */
export interface Pedido extends Totales {
  id: string; // UUID
  folio: string | null; // "P-000001", se asigna al confirmar (KAR-… llega en la SPEC 06)
  userId: string;
  estado: EstadoPedido;
  productos: LineaPedido[]; // máx. 20
  sucursalEntregaId: string | null; // obligatoria para hacer el pedido (SPEC 06)
  sucursalEntrega: SucursalEntrega | null; // propio del demo
  promociones: PromocionAplicada[];
  requiereFactura: boolean; // con factura, tasaIva = iva.tasa de la configuración
  datosFiscales: DatosFiscales | null; // en el borrador se conservan aunque se quite la factura; al confirmar sin factura, null
  avisos: string[]; // solo en el borrador: "El código VERANO15 ya no es válido: venció"
  pago: { estado: "pendiente" };
  createdAt: string; // ISO 8601
  updatedAt: string;
  confirmadoAt: string | null;
  canceladoAt: string | null;
}

export function formatFolio(consecutivo: number): string {
  return `P-${String(consecutivo).padStart(6, "0")}`;
}
