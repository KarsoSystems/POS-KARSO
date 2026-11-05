import type { Metadata } from "next";
import { BorradorPedido } from "@/components/organisms/borrador-pedido";

export const metadata: Metadata = { title: "Nuevo pedido" };

export default function NuevoPedidoPage() {
  return <BorradorPedido />;
}
