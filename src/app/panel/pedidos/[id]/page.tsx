import type { Metadata } from "next";
import { DetallePedido } from "@/components/organisms/detalle-pedido";

export const metadata: Metadata = { title: "Pedido" };

export default async function DetallePedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pago?: string }>;
}) {
  const [{ id }, { pago }] = await Promise.all([params, searchParams]);
  return <DetallePedido key={id} id={id} resultadoPago={pago} />;
}
