import type { Metadata } from "next";
import { PerfilCliente } from "@/components/organisms/perfil-cliente";

export const metadata: Metadata = { title: "Mi perfil" };

export default function PerfilPage() {
  return <PerfilCliente />;
}
