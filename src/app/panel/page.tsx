import type { Metadata } from "next";
import { PanelInicio } from "@/components/panel/panel-inicio";

export const metadata: Metadata = { title: "Inicio" };

export default function PanelPage() {
  return <PanelInicio />;
}
