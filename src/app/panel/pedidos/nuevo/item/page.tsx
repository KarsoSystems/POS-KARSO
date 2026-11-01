import type { Metadata } from "next";
import { EditorItem } from "@/components/pedidos/editor-item";

export const metadata: Metadata = { title: "Agregar ítem" };

export default function AgregarItemPage() {
  return <EditorItem />;
}
