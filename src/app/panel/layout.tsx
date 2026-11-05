import type { Metadata } from "next";
import { PanelTemplate } from "@/components/templates/panel-template";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel" } };

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelTemplate>{children}</PanelTemplate>;
}
