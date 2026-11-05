import type { Totales } from "@/lib/pedidos/cotizacion";
import type { EstadoPedido } from "@/lib/pedidos/formato";
import type { LineaCotizada } from "@/lib/pedidos/linea";

// EstadoPedido, Totales y LineaCotizada viven en src/lib porque el front los usa
// (cotización en vivo, etiquetas); se re-exportan aquí como dominio.
export type { EstadoPedido, Totales };
export type { EspecificacionLinea, MedidaLinea } from "@/lib/pedidos/cotizacion";

/**
 * Línea del pedido con la forma de KARSO-PROMPT-v1.md 6.5: copia los datos de la
 * variante al guardarse, para que cambios del catálogo no afecten pedidos hechos.
 */
export interface LineaPedido extends LineaCotizada {
  lineaId: string; // UUID
  archivoId: string; // temporal: en la SPEC 05 pasa a archivos.frente / archivos.reverso
  descripcion: string; // 0–500 caracteres
  problema: string | null; // propio del demo, p. ej. "Couché 8.7 x 5 cm ya no está disponible"
}

/** Pedido con los totales de KARSO 5.4 (subtotal, descuento, baseIva, tasaIva, iva, total), en pesos. */
export interface Pedido extends Totales {
  id: string; // UUID
  folio: string | null; // "P-000001", se asigna al confirmar (KAR-… llega en la SPEC 06)
  userId: string;
  estado: EstadoPedido;
  productos: LineaPedido[]; // máx. 20
  pago: { estado: "pendiente" };
  createdAt: string; // ISO 8601
  updatedAt: string;
  confirmadoAt: string | null;
  canceladoAt: string | null;
}

export function formatFolio(consecutivo: number): string {
  return `P-${String(consecutivo).padStart(6, "0")}`;
}
