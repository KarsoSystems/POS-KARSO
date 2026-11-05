import type { Metadata } from "next";
import { PanelInicio } from "@/components/organisms/panel-inicio";

export const metadata: Metadata = { title: "Inicio" };

export default function PanelPage() {
  return <PanelInicio />;
}
