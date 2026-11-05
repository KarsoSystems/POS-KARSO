import type { Metadata } from "next";
import { EditorItem } from "@/components/organisms/editor-item";

export const metadata: Metadata = { title: "Editar ítem" };

export default async function EditarItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return <EditorItem key={itemId} itemId={itemId} />;
}
