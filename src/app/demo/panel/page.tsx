import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimuladorPanel } from "@/components/organisms/simulador-panel";

export const metadata: Metadata = { title: "Simulador del panel" };

// Solo en el demo (SPEC 08): sin DEMO_PANEL=1 la página no existe.
export const dynamic = "force-dynamic";

export default function SimuladorPanelPage() {
  if (process.env.DEMO_PANEL !== "1") notFound();
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6">
      <SimuladorPanel />
    </main>
  );
}
