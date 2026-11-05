import type { Metadata } from "next";
import { EditorItem } from "@/components/organisms/editor-item";

export const metadata: Metadata = { title: "Agregar ítem" };

export default function AgregarItemPage() {
  return <EditorItem />;
}
