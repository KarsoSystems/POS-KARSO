import type { Metadata } from "next";
import { SeguimientoPedido } from "@/components/organisms/seguimiento-pedido";

export const metadata: Metadata = { title: "Seguimiento del pedido" };

export default async function SeguimientoPage({ params }: { params: Promise<{ folio: string }> }) {
  const { folio } = await params;
  return <SeguimientoPedido folio={decodeURIComponent(folio)} />;
}
