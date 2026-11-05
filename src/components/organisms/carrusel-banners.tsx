"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Button } from "@/components/atoms/button";
import { Skeleton } from "@/components/atoms/skeleton";
import { useBanners } from "@/hooks/use-banners";
import type { Banner } from "@/lib/tienda-api";

/** Imagen del banner: `imagenMovil` por debajo de 640 px (breakpoint `sm`), `imagen` arriba. */
function ImagenBanner({ banner }: { banner: Banner }) {
  return (
    <picture>
      <source media="(max-width: 639px)" srcSet={banner.imagenMovil} />
      <img
        src={banner.imagen}
        alt={banner.titulo}
        className="aspect-[5/6] w-full rounded-lg object-cover sm:aspect-[16/5]"
        draggable={false}
      />
    </picture>
  );
}

/**
 * Banners activos y vigentes del panel, por `orden`. Se desplaza con flechas o
 * deslizando (scroll-snap); no avanza solo. Sin banners no se muestra nada.
 */
export function CarruselBanners() {
  const { data: banners, isPending, isError } = useBanners();
  const pista = useRef<HTMLUListElement>(null);

  if (isPending) return <Skeleton className="aspect-[5/6] w-full rounded-lg sm:aspect-[16/5]" />;
  if (isError || !banners || banners.length === 0) return null;

  const mover = (sentido: 1 | -1) => {
    const el = pista.current;
    if (el) el.scrollBy({ left: sentido * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section aria-roledescription="carrusel" aria-label="Promociones" className="relative">
      <ul
        ref={pista}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((banner, i) => (
          <li
            key={banner._id}
            className="w-full shrink-0 snap-start"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${banners.length}: ${banner.titulo}`}
          >
            {banner.liga ? (
              <Link
                href={banner.liga}
                className="block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <ImagenBanner banner={banner} />
              </Link>
            ) : (
              <ImagenBanner banner={banner} />
            )}
          </li>
        ))}
      </ul>
      {banners.length > 1 && (
        <div className="pointer-events-none absolute inset-y-0 right-2 left-2 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-events-auto rounded-full bg-card/80 backdrop-blur"
            onClick={() => mover(-1)}
            aria-label="Banner anterior"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-events-auto rounded-full bg-card/80 backdrop-blur"
            onClick={() => mover(1)}
            aria-label="Banner siguiente"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      )}
    </section>
  );
}
