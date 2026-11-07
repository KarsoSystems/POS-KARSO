"use client";

import { Home, Package, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/atoms/badge";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  proximamente?: boolean;
}

// `proximamente` marca una sección que aún no existe (se muestra deshabilitada).
const ITEMS: NavItem[] = [
  { label: "Inicio", href: "/panel", icon: Home },
  { label: "Mis pedidos", href: "/panel/pedidos", icon: Package },
  { label: "Mi perfil", href: "/panel/perfil", icon: UserRound },
];

const itemClass =
  "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors";

/** Inicio solo en su ruta exacta; las demás secciones también en sus subrutas. */
const esActivo = (pathname: string, href: string) =>
  href === "/panel" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export function PanelNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menú del panel" className="flex flex-col gap-1">
      {ITEMS.map(({ label, href, icon: Icon, proximamente }) =>
        proximamente ? (
          <span
            key={href}
            role="link"
            aria-disabled="true"
            className={cn(itemClass, "cursor-not-allowed text-muted-foreground/70")}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
            <Badge variant="secondary" className="ml-auto">
              Próximamente
            </Badge>
          </span>
        ) : (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={esActivo(pathname, href) ? "page" : undefined}
            className={cn(
              itemClass,
              esActivo(pathname, href)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        ),
      )}
    </nav>
  );
}
