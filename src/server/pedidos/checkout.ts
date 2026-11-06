import { evaluarCodigo, normalizarCodigo } from "@/lib/pedidos/promociones";
import type { CheckoutData } from "@/lib/validation/checkout";
import type { Pedido } from "@/server/domain/pedido";
import { userRepository } from "@/server/repositories";
import type { ContextoTienda } from "@/server/tienda";
import { cambiarBorrador } from "./borrador";

// Checkout del borrador (SPEC 06): sucursal de entrega, factura y códigos de
// promoción. Cada cambio exitoso vacía los avisos; el recálculo vuelve a poner los
// que sigan aplicando.

/** Un error de un campo del checkout: la ruta responde 422 con `{ [campo]: mensaje }`. */
export class CampoCheckoutError extends Error {
  constructor(
    readonly campo: string,
    message: string,
  ) {
    super(message);
    this.name = "CampoCheckoutError";
  }
}

export class CodigoNoAplicadoError extends Error {
  constructor(codigo: string) {
    super(`El código ${codigo} no está aplicado`);
    this.name = "CodigoNoAplicadoError";
  }
}

/**
 * Sucursal, "Requiero factura" y datos fiscales. Al pedir factura sin datos en el
 * borrador se precargan los del perfil; con `guardarDatosFiscales`, los nuevos
 * también se guardan en el perfil.
 */
export async function cambiarCheckout(userId: string, contexto: ContextoTienda, data: CheckoutData): Promise<Pedido> {
  if (data.sucursalEntregaId) {
    const sucursal = contexto.sucursales.find((s) => s._id === data.sucursalEntregaId);
    if (!sucursal?.activa) throw new CampoCheckoutError("sucursalEntregaId", "Elige una sucursal disponible");
  }
  const user = await userRepository.findById(userId);

  const pedido = await cambiarBorrador(userId, contexto, (borrador) => {
    if (data.sucursalEntregaId !== undefined) {
      borrador.sucursalEntregaId = data.sucursalEntregaId;
      // La copia la arma el recálculo con la sucursal vigente.
      if (data.sucursalEntregaId === null) borrador.sucursalEntrega = null;
    }
    if (data.datosFiscales !== undefined) borrador.datosFiscales = data.datosFiscales;
    if (data.requiereFactura !== undefined) {
      borrador.requiereFactura = data.requiereFactura;
      if (data.requiereFactura && !borrador.datosFiscales) borrador.datosFiscales = user?.datosFiscales ?? null;
    }
    borrador.avisos = [];
  });

  if (data.guardarDatosFiscales && data.datosFiscales) {
    await userRepository.update(userId, { datosFiscales: data.datosFiscales });
  }
  return pedido;
}

/** Aplica un código (sin importar mayúsculas) si vale para este cliente y cabe en el pedido. */
export async function aplicarCodigo(userId: string, contexto: ContextoTienda, texto: string): Promise<Pedido> {
  const codigo = normalizarCodigo(texto);
  const promocion = contexto.promociones.find((p) => p.codigo === codigo);
  const usos = promocion ? await userRepository.contarUsosPromocion(promocion._id, userId) : { totales: 0, delCliente: 0 };
  const evaluacion = evaluarCodigo(promocion, {
    ahora: new Date(),
    usosTotales: usos.totales,
    usosDelCliente: usos.delCliente,
  });

  return cambiarBorrador(userId, contexto, (borrador) => {
    // Se revisa bajo el lock: dos pestañas no pueden pasar del máximo a la vez.
    if (borrador.promociones.some((p) => p.codigo === codigo)) {
      throw new CampoCheckoutError("codigo", "Ya aplicaste este código");
    }
    if (!evaluacion.ok) throw new CampoCheckoutError("codigo", evaluacion.mensaje);
    const max = contexto.configuracion.promociones.maxCodigosPorPedido;
    if (borrador.promociones.length >= max) {
      throw new CampoCheckoutError("codigo", `Solo se aceptan ${max} códigos por pedido`);
    }
    // El descuento lo calcula el recálculo, con el modo de combinación y el tope.
    borrador.promociones.push({ promocionId: promocion!._id, codigo, porcentaje: promocion!.porcentaje, descuento: 0 });
    borrador.avisos = [];
  });
}

export async function quitarCodigo(userId: string, contexto: ContextoTienda, texto: string): Promise<Pedido> {
  const codigo = normalizarCodigo(texto);
  return cambiarBorrador(userId, contexto, (borrador) => {
    if (!borrador.promociones.some((p) => p.codigo === codigo)) throw new CodigoNoAplicadoError(codigo);
    borrador.promociones = borrador.promociones.filter((p) => p.codigo !== codigo);
    borrador.avisos = [];
  });
}
