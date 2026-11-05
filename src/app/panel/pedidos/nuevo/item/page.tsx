import type { Metadata } from "next";
import { EditorItem } from "@/components/organisms/editor-item";

export const metadata: Metadata = { title: "Agregar ítem" };

/** `?producto=<_id>` (p. ej. desde un banner) abre el editor con ese producto elegido. */
export default async function AgregarItemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { producto } = await searchParams;
  return <EditorItem productoInicial={typeof producto === "string" ? producto : undefined} />;
}
