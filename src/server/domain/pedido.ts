import type { Totales } from "@/lib/pedidos/cotizacion";
import type { EstatusLinea } from "@/lib/pedidos/entrega";
import type { EstatusPedido } from "@/lib/pedidos/formato";
import type { LineaConArchivos } from "@/lib/pedidos/linea";
import type { Direccion } from "@/lib/sucursales/schema";
import type { DatosFiscales } from "@/lib/validation/fiscal";

// EstatusPedido, Totales y LineaCotizada viven en src/lib porque el front los usa
// (cotización en vivo, etiquetas); se re-exportan aquí como dominio.
export type { EstatusLinea, EstatusPedido, Totales };
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
  estatus: EstatusLinea | null; // KARSO 5.8: null hasta que se valida el pedido (SPEC 08)
  fechaEntregaEstimada: string | null; // "YYYY-MM-DD", al pasar a recibido
  loteId: string | null; // lo asigna el armado (panel); siempre null en la tienda
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

/** Un cambio de estatus (KARSO 6.5 `historialEstatus`). */
export interface CambioEstatus {
  estatus: EstatusPedido;
  fecha: string; // ISO 8601
  por: string; // "sistema", "cliente" (al enviar una corrección, SPEC 09) o el id del empleado, desde el panel
  comentario: string;
}

/** Un pago (KARSO 6.5 `pagos`). En línea siempre es el total con Mercado Pago. */
export interface Pago {
  tipo: "total"; // anticipo y liquidación son de mostrador
  metodo: "mercadopago";
  monto: number; // en pesos
  referencia: string; // 10 dígitos, como el id de pago de Mercado Pago
  estatus: "aprobado" | "rechazado" | "pendiente";
  fecha: string;
  recibidoPor: null; // solo en mostrador
}

/** Cancelación (KARSO 6.5). En la tienda solo la hace el sistema, al vencer el pago o la corrección. */
export interface Cancelacion {
  fecha: string;
  por: string; // "sistema"
  motivo: string; // "Pago no recibido en 24 h" o "No corrigió el archivo en el plazo" (SPEC 09)
  reembolso: null; // los reembolsos los registra el admin, desde el panel
}

/**
 * Rechazo de una línea (KARSO 6.5 `rechazos`; SPEC 09). Mostrador rechaza el pedido
 * completo con un motivo por línea: todas las líneas de una ronda comparten `fecha`
 * y `fechaLimiteCorreccion`.
 */
export interface Rechazo {
  fecha: string; // ISO
  por: string; // "panel-demo" (o el id del empleado, desde el panel)
  lineaId: string;
  motivo: string; // clave de configuracion.pedidos.motivosRechazo
  comentario: string; // 1–500 caracteres
  fechaLimiteCorreccion: string; // ISO: fin del último día para corregir, en la hora de la tienda
  corregidoEn: string | null; // cuando el cliente subió el archivo nuevo de esa línea
}

/** Pedido con los totales de KARSO 5.4 (subtotal, descuento, baseIva, tasaIva, iva, total), en pesos. */
export interface Pedido extends Totales {
  id: string; // UUID
  folio: string | null; // "KAR-2026-000001", se asigna al confirmar (SPEC 07)
  userId: string;
  estatus: EstatusPedido;
  historialEstatus: CambioEstatus[]; // [] en el borrador
  productos: LineaPedido[]; // máx. 20
  sucursalEntregaId: string | null; // obligatoria para hacer el pedido (SPEC 06)
  sucursalEntrega: SucursalEntrega | null; // propio del demo
  promociones: PromocionAplicada[];
  requiereFactura: boolean; // con factura, tasaIva = iva.tasa de la configuración
  datosFiscales: DatosFiscales | null; // en el borrador se conservan aunque se quite la factura; al confirmar sin factura, null
  avisos: string[]; // solo en el borrador: "El código VERANO15 ya no es válido: venció"
  vencimientoPago: string | null; // propio del demo: confirmadoAt + horasExpiracionPagoPendiente
  pagos: Pago[];
  pagado: number; // suma de los pagos aprobados, en pesos
  saldo: number; // total − pagado
  cancelacion: Cancelacion | null;
  rechazos: Rechazo[]; // [] en el borrador; se conservan las rondas anteriores
  correccionEnviadaEn: string | null; // "Enviar corrección": de aquí cuenta la entrega al revalidar (KARSO 5.9)
  fechaInicioConteo: string | null; // KARSO 5.9: ISO, al pasar a recibido (SPEC 08)
  fechaEntregaEstimada: string | null; // "YYYY-MM-DD", la más tardía de las líneas: "disponible para recoger a partir del…"
  qr: string | null; // el folio, como KARSO; el enlace de seguimiento lo arma el front
  createdAt: string; // ISO 8601
  updatedAt: string;
  confirmadoAt: string | null;
}
