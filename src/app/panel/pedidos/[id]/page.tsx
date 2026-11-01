import type { Metadata } from "next";
import { DetallePedido } from "@/components/pedidos/detalle-pedido";

export const metadata: Metadata = { title: "Pedido" };

export default async function DetallePedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmado?: string }>;
}) {
  const [{ id }, { confirmado }] = await Promise.all([params, searchParams]);
  return <DetallePedido key={id} id={id} recienConfirmado={confirmado === "1"} />;
}
