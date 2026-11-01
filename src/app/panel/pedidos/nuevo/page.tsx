import type { Metadata } from "next";
import { BorradorPedido } from "@/components/pedidos/borrador-pedido";

export const metadata: Metadata = { title: "Nuevo pedido" };

export default function NuevoPedidoPage() {
  return <BorradorPedido />;
}
