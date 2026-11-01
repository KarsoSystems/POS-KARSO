import type { Acomodo } from "@/lib/pedidos/acomodo";
import type { EstadoPedido } from "@/lib/pedidos/formato";
import type { PresupuestoItem, Totales } from "@/lib/pedidos/presupuesto";
import type { Tamano } from "@/lib/validation/pedidos";

// Acomodo, PresupuestoItem, Totales, Tamano y EstadoPedido viven en src/lib porque
// el front los usa (presupuesto en vivo, etiquetas); se re-exportan aquí como dominio.
export type { Acomodo, EstadoPedido, PresupuestoItem, Tamano, Totales };

export interface Subpedido {
  id: string; // UUID
  archivoId: string;
  descripcion: string; // 0–500 caracteres
  productoId: string;
  tamano: Tamano;
  anchoCm: number; // medidas resueltas (predefinido o personalizado)
  altoCm: number;
  papelId: string;
  hojaId: string;
  cantidad: number; // entero 1–100,000
  presupuesto: PresupuestoItem;
  problema: string | null; // p. ej. "El papel ya no existe en el catálogo"
}

export interface Pedido {
  id: string; // UUID
  folio: string | null; // "P-000001", se asigna al confirmar
  userId: string;
  estado: EstadoPedido;
  items: Subpedido[]; // máx. 20
  totales: Totales; // en borrador se recalcula; al confirmar se congela
  pago: { estado: "pendiente" };
  createdAt: string; // ISO 8601
  updatedAt: string;
  confirmadoAt: string | null;
  canceladoAt: string | null;
}

export function formatFolio(consecutivo: number): string {
  return `P-${String(consecutivo).padStart(6, "0")}`;
}
