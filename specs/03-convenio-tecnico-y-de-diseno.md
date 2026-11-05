# SPEC 03 — Convenio técnico y de diseño

> **Estado:** Approved
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-11-02
> **Objetivo:** Refactorizar el front para cumplir el convenio técnico y de diseño acordado con el socio (atomic design, React Query con hooks e identidad gráfica en tema oscuro y claro) y dejar la app 100% web, sin cambiar su comportamiento.

---

## Por qué existe este spec

Con un socio se firmó un convenio técnico y de diseño. Este spec no agrega funciones: **refactoriza y valida** que el proyecto cumpla ese convenio.

Estado del convenio al crear el spec (✅ = ya se cumple, ❌ = lo hace este spec, ⛔ = descartado):

| Punto del convenio | Estado | Nota |
| --- | --- | --- |
| Peticiones HTTP centralizadas en un solo cliente | ✅ | `src/lib/api-client.ts`, `auth-api.ts` y `pedidos-api.ts`. Los componentes no importan `src/server`. |
| Peticiones HTTP con TanStack React Query | ❌ | Hoy cada componente usa `useEffect` + `useState`. |
| Lógica en hooks propios | ❌ | No existe `src/hooks/`. La lógica vive dentro de los componentes (`editor-item.tsx` tiene 534 líneas). |
| Atomic design | ❌ | Los componentes se agrupan por funcionalidad (`auth/`, `pedidos/`, `panel/`, `ui/`). |
| Identidad gráfica (colores, espacios, tipografía) | ❌ | Se usa el tema gris por defecto de shadcn y la fuente Geist. |
| Build ofuscado y sin source maps | ⛔ | Descartado por completo el 2026-11-02. Next ya no publica source maps del navegador en producción por defecto (`productionBrowserSourceMaps: false`); este spec no lo cambia ni lo verifica. |
| App 100% web | ❌ | Existe `desktop/` con un shell de Tauri 2 (SPEC 01). Se retira. |

Al implementar el spec, cada ❌ de esta tabla pasa a ✅ y la tabla se copia al README.

**Regla del refactor:** el comportamiento no cambia. Los tests de Vitest y Playwright existentes deben seguir pasando. Solo se ajustan los selectores que dependan de rutas de archivos o de clases de estilo.

---

## Alcance

**Entra:**

- Retirar el shell de Tauri (`desktop/`) y sus menciones.
- Reorganizar `src/components/` en `atoms/`, `molecules/`, `organisms/` y `templates/`. Las páginas de `src/app` son el nivel "pages".
- Mover los componentes de shadcn a `atoms/` y apuntar ahí el alias `ui` de `components.json`.
- Reglas de ESLint que impidan importar "hacia arriba" entre niveles.
- Instalar TanStack React Query y React Query Devtools (solo en desarrollo).
- Hooks en `src/hooks/` para todas las peticiones: sesión, autenticación, catálogo, pedidos y subida de archivos con progreso.
- Hooks propios para la lógica de UI que hoy vive en los componentes: el editor de ítem y la cuenta regresiva de reenvío del código.
- Una regla de ESLint que impida a componentes y páginas llamar a `authApi` o `pedidosApi` directamente (los imports de tipos sí se permiten).
- Tests de los hooks de pedidos con `@testing-library/react`.
- Identidad gráfica tomada de la maqueta "Crear pedido" del socio: colores, tipografía, espaciados y estilo de componentes.
- Tema oscuro (por defecto) y tema claro derivado, con un selector que recuerda la elección.
- Actualizar el README: estructura, convenio, temas y retiro de Tauri.

**Fuera de alcance (para specs futuros):**

- Las funciones nuevas de la maqueta: despunte, dobladillo, ojillos, precio por m², medidas largo × ancho en la tarjeta del ítem, campo "Detalles", anticipo mínimo, pago restante, entrega estimada y "Reportar error".
- Reacomodar las pantallas como en la maqueta (ficha del cliente en la barra lateral, ítems editables en línea dentro de la página del pedido). Solo se toma la identidad.
- Ofuscar el código y borrar o verificar los source maps del build.
- Cualquier app de escritorio o móvil nativa.
- Reforzar la validación de formularios y datos más allá de la actual.
- Storybook o catálogo visual de componentes.

---

## Modelo de datos

Este spec no agrega datos al servidor ni cambia `data/*.json`. Reutiliza los modelos de los SPEC 01 y 02.

El único dato nuevo vive en el navegador:

| Clave de `localStorage` | Valores | Por defecto |
| --- | --- | --- |
| `tema` | `"dark"` \| `"light"` | `"dark"` |

### Identidad gráfica

Fuente: la maqueta del socio, guardada en `docs/identidad/maqueta-crear-pedido.png`. Los valores se tomaron a ojo de la captura. El socio puede ajustarlos después sin tocar componentes, porque todo vive en tokens de `src/app/globals.css`.

**Tipografía:** Montserrat (`next/font/google`, variable `--font-montserrat`), sustituye a Geist Sans. Geist Mono se queda para folios y montos tabulares.

**Tokens** (los nombres son los de shadcn ya usados en `globals.css`; `--exito` y `--fondo-degradado` son nuevos):

| Token | Oscuro (maqueta) | Claro (derivado) |
| --- | --- | --- |
| `--background` | `#0B0F14` | `#F4F6F8` |
| `--fondo-degradado` | `linear-gradient(180deg, #0B0F14, #0F2A3A)` | `linear-gradient(180deg, #F4F6F8, #E3ECF1)` |
| `--foreground` | `#F2F4F5` | `#0B0F14` |
| `--card` / `--popover` | `#1C2228` | `#FFFFFF` |
| `--muted` | `#2A3036` | `#E9EDF0` |
| `--muted-foreground` | `#A3ABB3` | `#56606A` |
| `--input` (fondo de campos) | `#2A3036` | `#FFFFFF` |
| `--border` | `#3A4048` | `#D0D5DB` |
| `--primary` (acento ámbar) | `#F5B83D` | `#F5B83D` |
| `--primary-foreground` | `#0B0F14` | `#0B0F14` |
| `--acento-texto` (montos y nombre del cliente) | `#F5B83D` | `#A86A0C` |
| `--ring` | `#F5B83D` | `#A86A0C` |
| `--exito` | `#6BE04A` | `#2E9E1F` |
| `--destructive` | `#E53935` | `#C62828` |
| `--sidebar` | `#000000` | `#FFFFFF` |
| `--sidebar-foreground` | `#F2F4F5` | `#0B0F14` |
| `--radius` | `0.25rem` | `0.25rem` |

En el tema claro el ámbar no se usa como color de texto sobre blanco porque no da contraste suficiente. Por eso existe `--acento-texto`.

**Espaciados** (escala de Tailwind, múltiplos de 8 px):

| Dónde | Valor |
| --- | --- |
| Margen interior del área de contenido | `p-6` (24 px) |
| Separación entre tarjetas y secciones | `gap-6` (24 px) |
| Margen interior de tarjetas | `p-4` (16 px) |
| Separación entre campos de un formulario | `gap-4` (16 px) |
| Separación entre etiqueta y campo | `gap-2` (8 px) |

**Estilo de componentes:**

- Botón principal: fondo ámbar, texto `--primary-foreground`, esquina superior derecha más redondeada (`rounded-tr-xl`). Si lleva icono, el icono va en un recuadro claro a la izquierda, como "Agregar producto" en la maqueta.
- Zonas de ítems y de subida de archivo: borde punteado (`border-dashed`).
- Acción de quitar: icono circular rojo (`--destructive`).
- Estado activo o correcto: verde (`--exito`).
- Fondo del contenido del panel: `--fondo-degradado`. Barra lateral: `--sidebar`.

### Atomic design

```
src/components/
├── atoms/       # piezas indivisibles: los de shadcn y átomos propios
├── molecules/   # combinan átomos con una sola responsabilidad
├── organisms/   # secciones con datos (usan hooks) o formularios completos
└── templates/   # esqueletos de página: layout del panel y de acceso
```

Reglas de importación (las hace cumplir ESLint con `no-restricted-imports` por carpeta):

- `atoms/` no importa de `molecules/`, `organisms/` ni `templates/`.
- `molecules/` no importa de `organisms/` ni `templates/`.
- `organisms/` no importa de `templates/`.
- Solo `organisms/` y `templates/` usan hooks de datos de `src/hooks/`.
- Se mantiene la regla del proyecto: nada en `src/components` importa de `src/server`.

Destino de cada componente actual:

| Hoy | Destino |
| --- | --- |
| `ui/alert`, `ui/badge`, `ui/button`, `ui/card`, `ui/dialog`, `ui/form`, `ui/input`, `ui/label`, `ui/sheet`, `ui/skeleton` | `atoms/` (mismo nombre) |
| `auth/form-error`, `auth/submit-button`, `pedidos/estado-badge` | `atoms/` |
| `auth/demo-notice`, `pedidos/aviso-precios-ejemplo`, `pedidos/item-resumen`, `pedidos/totales-pedido`, `pedidos/miniatura-archivo`, `pedidos/vista-previa-hoja`, `pedidos/subida-archivo`, `panel/panel-user`, `panel/panel-nav` | `molecules/` |
| `FilaPedido` (hoy dentro de `pedidos/mis-pedidos`) | `molecules/fila-pedido.tsx` |
| Selector de tema (nuevo) | `molecules/selector-tema.tsx` |
| `auth/login-form`, `auth/registro-form`, `auth/completar-perfil-form`, `auth/verificar-whatsapp-form`, `auth/google-mock-dialog` | `organisms/` |
| `pedidos/mis-pedidos`, `pedidos/borrador-pedido`, `pedidos/detalle-pedido`, `pedidos/editor-item`, `panel/panel-inicio` | `organisms/` |
| `panel/panel-shell` | `templates/panel-template.tsx` |
| Contenido visual de `src/app/(auth)/layout.tsx` | `templates/auth-template.tsx` |

Las carpetas `auth/`, `pedidos/`, `panel/` y `ui/` desaparecen. Los nombres de archivo siguen en kebab-case, como hoy.

### React Query

```ts
// src/hooks/query-keys.ts
export const queryKeys = {
  sesion: ["sesion"],
  catalogo: ["catalogo"],
  borrador: ["pedidos", "borrador"],
  pedidos: ["pedidos", "lista"],
  pedido: (id: string) => ["pedidos", "detalle", id],
} as const;
```

`QueryClient` (en `src/app/providers.tsx`, componente cliente montado en el layout raíz):

- `retry: false`. Los errores se muestran al primer fallo, como hoy, y los tests de error no se vuelven lentos.
- `refetchOnWindowFocus: false`. Ninguna pantalla se recarga sola al volver a la pestaña, como hoy.
- `staleTime: 0` (valor por defecto). El catálogo se lee fresco en cada pantalla, porque puede cambiar sin reiniciar el servidor (SPEC 02).

Hooks (cada archivo agrupa un dominio):

| Archivo | Hooks |
| --- | --- |
| `src/hooks/use-auth.ts` | `useSesion`, `useLogin`, `useRegistro`, `useGoogleMock`, `useCompletarPerfil`, `useVerificarWhatsapp`, `useReenviarCodigo`, `useLogout` |
| `src/hooks/use-catalogo.ts` | `useCatalogo` |
| `src/hooks/use-pedidos.ts` | `useBorrador`, `useAgregarItem`, `useEditarItem`, `useQuitarItem`, `useConfirmarPedido`, `usePedidos`, `usePedido`, `useCancelarPedido` |
| `src/hooks/use-subir-archivo.ts` | `useSubirArchivo` (mutación sobre `subirArchivo`, expone `progreso` de 0 a 1 y `cancelar`) |
| `src/hooks/use-editor-item.ts` | `useEditorItem` (estado de campos, errores, presupuesto y vista previa en vivo del editor) |
| `src/hooks/use-cuenta-regresiva.ts` | `useCuentaRegresiva` (espera para reenviar el código de WhatsApp) |

Efecto de cada mutación en la caché:

| Mutación | Efecto |
| --- | --- |
| Agregar, editar o quitar ítem | `setQueryData(borrador)` con la respuesta |
| Confirmar pedido | Invalida `borrador` y `pedidos`; `setQueryData(pedido(id))` |
| Cancelar pedido | `setQueryData(pedido(id))`; invalida `pedidos` |
| Login, registro, Google simulado, completar perfil, verificar WhatsApp | `setQueryData(sesion)` cuando la respuesta trae el usuario |
| Logout | `queryClient.clear()` |

---

## Plan de implementación

1. **Retirar Tauri.** Borrar `desktop/`. Quitar `desktop/**` de los `ignores` de `eslint.config.mjs`. En el README, quitar la sección "App de escritorio" y la línea de `desktop/` en "Estructura", y anotar en la fila del SPEC 01 "shell Tauri retirado en SPEC 03". Los SPEC 01 y 02 no se editan: son historia. Verificación: `pnpm lint` y `pnpm test` pasan.
2. **Guardar la maqueta.** Copiar la captura del socio a `docs/identidad/maqueta-crear-pedido.png`.
3. **Mover shadcn a `atoms/`.** Mover `src/components/ui/*` a `src/components/atoms/`. Cambiar `aliases.ui` de `components.json` a `@/components/atoms` y actualizar los imports. Verificación: `pnpm lint`, `pnpm test` y `pnpm test:e2e` pasan.
4. **Mover el resto de los componentes** según la tabla de destino, incluido extraer `FilaPedido` a `molecules/fila-pedido.tsx`. Convertir `panel-shell` en `templates/panel-template.tsx` y sacar el contenido visual de `src/app/(auth)/layout.tsx` a `templates/auth-template.tsx`. Borrar las carpetas vacías. Verificación: lint, unidad y e2e pasan.
5. **Reglas de ESLint por nivel.** Agregar en `eslint.config.mjs` un bloque `no-restricted-imports` por carpeta con las reglas de importación de atomic design. Verificación: `pnpm lint` pasa; un import de prueba de `organisms/` dentro de `atoms/` falla y se quita.
6. **Instalar React Query.** Agregar `@tanstack/react-query` y `@tanstack/react-query-devtools` con versión exacta. Crear `src/app/providers.tsx` con el `QueryClient` configurado y las devtools solo si `process.env.NODE_ENV === "development"`. Montarlo en `src/app/layout.tsx`. Crear `src/hooks/query-keys.ts`.
7. **Hooks de catálogo y pedidos (lectura).** Crear `use-catalogo.ts` y las consultas de `use-pedidos.ts`. Migrar `mis-pedidos` y `detalle-pedido` a esas consultas. Verificación: e2e de pedidos pasa.
8. **Hooks de pedidos (mutaciones).** Agregar las mutaciones de `use-pedidos.ts` con los efectos de caché de la tabla. Migrar `borrador-pedido` y `detalle-pedido` (cancelar).
9. **Subida de archivos.** Crear `use-subir-archivo.ts` sobre `subirArchivo` y migrar `subida-archivo`. La cancelación y el progreso se comportan igual que hoy.
10. **Hook del editor de ítem.** Sacar la lógica de `editor-item` a `use-editor-item.ts`, usando `useCatalogo`, `useBorrador` y las mutaciones de ítem. El componente queda solo con el marcado.
11. **Hooks de autenticación.** Crear `use-auth.ts` y `use-cuenta-regresiva.ts`. Migrar los formularios de autenticación, `google-mock-dialog` y `panel-template` (sesión y logout).
12. **Regla de acceso a datos.** En `eslint.config.mjs`, prohibir en `src/components/**` y `src/app/**/page.tsx` los imports de valores de `@/lib/auth-api` y `@/lib/pedidos-api`, con `@typescript-eslint/no-restricted-imports` y `allowTypeImports: true`. Verificación: `pnpm lint` pasa y ya no queda ningún `useEffect` que pida datos al API en `src/components`.
13. **Tests de hooks.** Agregar `@testing-library/react` y `jsdom`. Ampliar `include` de `vitest.config.mts` a `src/**/*.test.{ts,tsx}`. Crear `src/hooks/use-pedidos.test.tsx` (con `// @vitest-environment jsdom`) que cubra: agregar ítem actualiza `borrador` sin otra petición; confirmar invalida `pedidos`; un error del API llega como `ApiError` en `error`.
14. **Tokens y tipografía.** Reemplazar en `globals.css` los valores de `:root` (claro) y `.dark` (oscuro) por los de la tabla, y agregar `--exito`, `--acento-texto` y `--fondo-degradado` a `@theme`. Cambiar Geist Sans por Montserrat en `src/app/layout.tsx`.
15. **Temas.** Agregar `next-themes` con versión exacta. En `providers.tsx`: `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`, `storageKey="tema"`. Poner `suppressHydrationWarning` en `<html>`. Crear `molecules/selector-tema.tsx` y montarlo en `panel-template` (barra lateral) y en `auth-template` (esquina superior).
16. **Estilo de componentes.** Aplicar el estilo de la maqueta: variante principal de `atoms/button.tsx`, borde punteado en `subida-archivo` y en las tarjetas de ítem del borrador, quitar en rojo, `--exito`, fondo degradado del panel y barra lateral `--sidebar`. Aplicar la escala de espaciados de la tabla. Verificación manual en los dos temas: login, registro, verificar, panel, Mis pedidos, borrador, editor y detalle.
17. **README.** Actualizar "Estructura" (niveles de atomic design y `src/hooks/`), agregar la sección "Convenio técnico y de diseño" con la tabla del convenio ya en ✅ y la sección "Temas" (clave `tema`). Agregar la fila del SPEC 03 a la tabla de specs.

---

## Criterios de aceptación

- [ ] La carpeta `desktop/` no existe. `eslint.config.mjs` y `.gitignore` no mencionan Tauri, y el README solo lo menciona en la nota "shell Tauri retirado en SPEC 03" (los SPEC 01 y 02 sí, como historia).
- [ ] `docs/identidad/maqueta-crear-pedido.png` existe.
- [ ] `src/components/` contiene solo `atoms/`, `molecules/`, `organisms/` y `templates/`.
- [ ] `components.json` tiene `"ui": "@/components/atoms"`.
- [ ] Si un archivo de `atoms/` importa algo de `molecules/`, `organisms/` o `templates/`, `pnpm lint` falla. Lo mismo para `molecules/` → `organisms/`/`templates/` y `organisms/` → `templates/`.
- [ ] Si un archivo de `src/components` importa un valor (no un tipo) de `@/lib/pedidos-api` o `@/lib/auth-api`, `pnpm lint` falla.
- [ ] `grep -rn "useEffect" src/components` no muestra ninguna petición al API.
- [ ] `@tanstack/react-query` y `next-themes` están en `dependencies` con versión exacta. `@tanstack/react-query-devtools` no aparece en el bundle de `pnpm build` (su botón no se ve con `pnpm start`).
- [ ] Con `pnpm dev`, el botón de React Query Devtools aparece en pantalla.
- [ ] Al agregar un ítem al borrador, la mutación hace un solo `POST /api/pedidos/borrador/items` y no pide el borrador por su cuenta. El único `GET /api/pedidos/borrador` posterior es el que hace la pantalla del borrador al montarse (`staleTime: 0`, como antes del refactor).
- [ ] Después de "Hacer pedido", "Mis pedidos" muestra el folio nuevo sin recargar la página.
- [ ] Después de "Cerrar sesión" e iniciar sesión con otra cuenta, no se ven pedidos de la cuenta anterior.
- [ ] `pnpm lint`, `pnpm test` (incluido `src/hooks/use-pedidos.test.tsx`) y `pnpm test:e2e` pasan.
- [ ] La primera visita sin `tema` en `localStorage` se ve en tema oscuro.
- [ ] El selector de tema está en la barra lateral del panel y en las pantallas de acceso. Al cambiarlo se guarda `tema` en `localStorage` y la elección se conserva al recargar, sin parpadeo del otro tema.
- [ ] En tema oscuro, la barra lateral es `#000000`, el botón principal es `#F5B83D` y el fondo del contenido del panel es el degradado de la tabla.
- [ ] La fuente calculada del `body` es Montserrat.
- [ ] La zona de subida de archivo y las tarjetas de ítem del borrador tienen borde punteado.
- [ ] El README tiene la sección "Convenio técnico y de diseño" y en su tabla todos los puntos están en ✅, salvo el de ofuscación, que aparece como ⛔ descartado.

---

## Decisiones

- **Sí:** de la maqueta se toma solo la identidad (colores, tipografía, espaciados y estilo de componentes). Las funciones nuevas que trae merecen sus propios specs.
- **No:** reacomodar las pantallas como en la maqueta. Mezclaría el refactor con cambios de comportamiento y rompería la regla de "los tests no cambian".
- **Sí:** tema oscuro y claro, oscuro por defecto. Lo pidió el usuario.
- **Sí:** el tema claro es una derivación propia, porque la maqueta solo define el oscuro. Está en tokens, así que el socio puede ajustarlo sin tocar componentes.
- **Sí:** `next-themes` para el cambio de tema. Resuelve el parpadeo inicial y la persistencia. Escribir un script propio no aporta nada.
- **No:** seguir la preferencia del sistema operativo (`enableSystem={false}`). La identidad de la marca es oscura; el claro es opcional.
- **Sí:** Montserrat. Es la sans geométrica más parecida a la de la maqueta y está en Google Fonts.
- **Sí:** los componentes de shadcn van a `atoms/` y `components.json` apunta ahí, para que `shadcn add` respete la estructura.
- **No:** dejar `ui/` como capa aparte. Serían dos lugares para lo mismo.
- **Sí:** las reglas de atomic design y de acceso a datos se hacen cumplir con ESLint, no solo con documentación.
- **Sí:** React Query para todas las peticiones, autenticación incluida, con hooks en `src/hooks/`. Devtools solo en desarrollo.
- **Sí:** `retry: false`, `refetchOnWindowFocus: false` y `staleTime: 0`. Mantienen el comportamiento actual y la regla del SPEC 02 de que el catálogo se lee fresco.
- **Sí:** las mutaciones escriben su respuesta en la caché (`setQueryData`) en vez de volver a pedir. Así se evita una petición extra en cada cambio del borrador.
- **Sí:** el borrador también usa `staleTime: 0`, aunque la pantalla del borrador vuelva a pedirlo al montarse tras guardar un ítem. Así, tras un cambio de catálogo, siempre se ve recalculado (SPEC 02). **No:** `staleTime: Infinity` o un valor corto solo para el borrador. Decisión tomada durante la implementación (paso 10).
- **Sí:** la subida de archivos sigue con `XMLHttpRequest` dentro de una mutación, porque `fetch` no reporta el avance de subida.
- **⛔ Descartado:** ofuscar el código y borrar o verificar los source maps del build. Decisión del 2026-11-02. Next ya no publica source maps del navegador en producción por defecto.
- **⛔ Descartado:** app de escritorio. La app será 100% web; se retira `desktop/`.
- **No:** Storybook. Útil con atomic design, pero es otro spec.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Mover decenas de archivos rompe imports o tests e2e que dependen de rutas | Se mueve por pasos (shadcn primero, luego el resto) y en cada paso pasan lint, unidad y e2e. Los e2e usan roles y textos, no rutas de archivo. |
| React Query cambia sutilmente cuándo se pide cada dato (dobles peticiones, datos viejos) | `retry` y `refetchOnWindowFocus` desactivados, `staleTime: 0` y tests de hooks sobre la caché. |
| Datos de una cuenta visibles tras cambiar de usuario | `queryClient.clear()` al cerrar sesión, con criterio de aceptación. |
| Los colores medidos a ojo no coinciden con el diseño original del socio | Todos viven en tokens de `globals.css`; corregirlos no toca componentes. |
| Contraste bajo del ámbar sobre fondo claro | `--acento-texto` más oscuro en el tema claro. |
| Parpadeo del tema al cargar | `next-themes` aplica la clase antes de pintar; `suppressHydrationWarning` en `<html>`. |

---

## Lo que **no** está en este spec

- Despunte, dobladillo, ojillos, precio por m², medidas largo × ancho, campo "Detalles", anticipo mínimo, pago restante, entrega estimada y "Reportar error".
- El layout de la maqueta (ficha del cliente en la barra lateral, ítems editables en línea).
- Ofuscación del código y control de source maps.
- App de escritorio o móvil nativa.
- Validación de formularios y datos más estricta.
- Storybook.

Cada una de esas cosas, si llega, va en su propio spec.
