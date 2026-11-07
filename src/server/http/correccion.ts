import type { NextResponse } from "next/server";
import {
  ArchivoCorreccionInvalidoError,
  CorreccionIncompletaError,
  CorreccionVencidaError,
  LineaNoRechazadaError,
} from "@/server/pedidos/correccion";
import { EstatusPedidoInvalidoError, PedidoNoEncontradoError } from "@/server/repositories";
import { apiError } from "./responses";

// Errores de la corrección de un pedido rechazado (SPEC 09) como respuestas HTTP.

export function errorCorreccion(error: unknown): NextResponse {
  if (error instanceof PedidoNoEncontradoError) return apiError(404, "NO_ENCONTRADO", "El pedido no existe");
  if (error instanceof CorreccionVencidaError) return apiError(409, "CORRECCION_VENCIDA", error.message);
  if (error instanceof EstatusPedidoInvalidoError) {
    return apiError(409, "ESTATUS_INVALIDO", "Este pedido no está esperando una corrección");
  }
  if (error instanceof LineaNoRechazadaError) return apiError(422, "LINEA_NO_RECHAZADA", error.message);
  if (error instanceof CorreccionIncompletaError) return apiError(422, "CORRECCION_INCOMPLETA", error.message);
  if (error instanceof ArchivoCorreccionInvalidoError) {
    return apiError(422, "VALIDACION", "Revisa los datos marcados", { [error.campo]: error.message });
  }
  throw error;
}
