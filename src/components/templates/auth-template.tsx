import { SelectorTema } from "@/components/molecules/selector-tema";

export function AuthTemplate({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-fondo-degradado px-4 pt-16 pb-10">
      <SelectorTema className="absolute top-4 right-4" />
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
