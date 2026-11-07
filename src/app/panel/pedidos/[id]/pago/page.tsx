import type { Metadata } from "next";
import { PagoSimulado } from "@/components/organisms/pago-simulado";

export const metadata: Metadata = { title: "Pagar pedido" };

export default async function PagoPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PagoSimulado key={id} id={id} />;
}
