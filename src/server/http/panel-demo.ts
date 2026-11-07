import { NextResponse } from "next/server";
import { LineaNoEncontradaError, LineaNoRetrocedeError, SaldoPendienteError, demoPanelActivo } from "@/server/pedidos/panel-demo";
import { EstatusPedidoInvalidoError, PedidoNoEncontradoError } from "@/server/repositories";
import { apiError } from "./responses";

// Respuestas comunes de las rutas del simulador del panel.

/** 404 si el simulador no está activo (DEMO_PANEL=1): fuera del demo, las rutas no existen. */
export const sinPanelDemo = (): NextResponse | null =>
  demoPanelActivo() ? null : apiError(404, "NO_ENCONTRADO", "No encontrado");

/** Errores de las acciones del panel como respuestas HTTP; lo demás se relanza. */
export function errorPanelDemo(error: unknown): NextResponse {
  if (error instanceof PedidoNoEncontradoError) return apiError(404, "NO_ENCONTRADO", "El pedido no existe");
  if (error instanceof LineaNoEncontradaError) return apiError(404, "NO_ENCONTRADO", error.message);
  if (error instanceof EstatusPedidoInvalidoError) return apiError(409, "ESTATUS_INVALIDO", error.message);
  if (error instanceof LineaNoRetrocedeError) return apiError(409, "ESTATUS_INVALIDO", error.message);
  if (error instanceof SaldoPendienteError) return apiError(409, "SALDO_PENDIENTE", error.message);
  throw error;
}
