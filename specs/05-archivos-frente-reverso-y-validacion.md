# SPEC 05 — Archivos: frente, reverso y validación

> **Estado:** Approved
> **Depende de:** SPEC 02, SPEC 04
> **Fecha:** 2026-11-05
> **Objetivo:** Que cada línea lleve su archivo de frente y, según `caras.reverso`, un reverso (archivo, calendario o texto). Los archivos se suben con el flujo de URL firmada de KARSO, emulado en local, y se validan contra las reglas de la sección 5.7 (formato, peso, color, resolución y medida), con advertencias claras que no bloquean el pedido.

---

## Por qué existe este spec

La sección 5.7 de `KARSO-PROMPT-v1.md` define qué archivo acepta cada producto (formatos, CMYK, resolución mínima, medida con rebase) y exige que el sistema diga con claridad qué falló y qué se esperaba. Hoy la tienda acepta un solo archivo por línea, sin revisar nada salvo extensión y tamaño, y acepta PNG y PSD, que KARSO no permite.

KARSO también fija **cómo** se suben los archivos: directo a Cloudflare R2 con URL firmada, y después el backend lee el archivo y lo valida. Este spec emula ese flujo en local para que el front no cambie cuando llegue R2.

**Reglas del negocio que KARSO no tiene** (decisiones del usuario; hay que proponerlas al socio para agregarlas a KARSO):

1. **Reverso con calendario o texto.** La máquina imprime frente y reverso en la misma pasada. Cuando el cliente no tiene diseño de reverso, la imprenta aprovecha esa cara con un calendario o con un texto. No cuesta extra y vale también cuando el reverso es `obligatorio`. El diseño de ese reverso lo hace la imprenta, no esta herramienta.
2. **Las validaciones advierten, no rechazan.** Un archivo que no cumple se guarda con advertencias ("podría ser rechazado"). La decisión final la toma mostrador al validar el pedido (estatus `recibido` o `rechazado`, SPEC 07).

---

## Alcance

**Entra:**

- **Subida en tres pasos, que emula R2:**
  1. `POST /api/archivos/subidas` pide una URL firmada de 15 minutos;
  2. el navegador sube el binario con `PUT` a esa URL. La sirve un "R2 local", un route handler que guarda en `FileStorage` con la llave `temporal/<id>.<ext>`;
  3. `POST /api/archivos/:id/confirmar` hace que el servidor lea el archivo, extraiga sus datos con `sharp` y genere la miniatura.

  La barra de progreso y la cancelación de la SPEC 02 se conservan en el `PUT`.
- **Formatos al subir:** la unión de lo que permite el catálogo, es decir jpg, jpeg y tiff más los vectores pdf, ai, eps y svg, con un tope global de 40 MB. **PNG y PSD dejan de aceptarse.** Se retira `POST /api/archivos`.
- **Datos que se extraen de JPG y TIFF:** ancho y alto en px, espacio de color y formato real. De los vectores, solo el formato y el peso.
- **Miniatura JPG en RGB** generada con `sharp` para JPG y TIFF, servida por `GET /api/archivos/:id/miniatura`. El original no se toca.
- **Validación pura** en `src/lib/pedidos/archivo-linea.ts`, compartida por el front (en vivo) y el servidor, contra las reglas del producto con las sobrescrituras de la variante: formato, peso, color, resolución efectiva y medida. Los vectores solo se revisan por formato y peso.
- **Todo resultado de la validación es advertencia:** la línea se guarda con `validado: false` y la lista de advertencias. "Hacer pedido" se permite.
- **Frente** obligatorio si `requiereArchivo`.
- **Reverso según `caras.reverso`:**
  - `no_aplica`: no hay reverso;
  - `opcional`: sin reverso, mi archivo, calendario o texto;
  - `obligatorio`: mi archivo, calendario o texto.
- **Calendario:** el cliente elige el año actual o el siguiente (zona America/Monterrey). **Texto:** de 1 a 500 caracteres, sin formato.
- **La línea guarda `archivos: { frente, reverso }`** con los datos de cada archivo, como en la sección 6.5.
- **Al hacer el pedido**, cada archivo de cada línea se copia a `pedidos/<folio>/<lineaId>_<cara>.<ext>` como un archivo nuevo, y los de `temporal/` que ya nadie usa se borran.
- **Pantallas:**
  - el editor reordena sus pasos para que los archivos vayan después de elegir la variante;
  - la zona de archivo muestra sus datos ("TIFF · CMYK · 1098 × 661 px · 3.2 MB") y las advertencias;
  - el borrador y el detalle muestran frente y reverso, y la insignia "Podría ser rechazado".
- **Datos de prueba:** `orders.json` pasa a la versión 3 y `archivos.json` a la versión 2, y los datos anteriores se descartan, como en la SPEC 04.
- Tests de unidad, de route handlers y e2e, con imágenes de prueba generadas con `sharp`.

**Fuera de alcance:**

- R2 real, buckets, CDN y la regla de ciclo de vida de 48 h sobre `temporal/`. En el demo, los archivos pendientes o abandonados no se limpian solos.
- Validación de `condicionesEspeciales` como `requiere_revision_manual`: el mock no tiene ninguna.
- Leer PDF, AI, EPS o SVG por dentro (medida, color o fuentes).
- Diseñar o previsualizar el calendario o el texto del reverso: lo hace la imprenta.
- El rechazo por parte de mostrador, los motivos, el plazo de 5 días y la corrección del archivo (SPEC 07).
- Folio `KAR-…`: las rutas usan el folio `P-…` hasta la SPEC 06.

---

## Modelo de datos

### Archivo (`src/server/domain/archivo.ts`)

```ts
type ExtensionPermitida = "jpg" | "jpeg" | "tiff" | "pdf" | "ai" | "eps" | "svg"; // unión del catálogo
type ColorArchivo = "CMYK" | "RGB" | "otro";

interface MetadatosArchivo {
  tipo: "imagen" | "vector";       // jpg/jpeg/tiff → imagen
  legible: boolean;                // false si sharp no pudo leer la imagen
  anchoPx: number | null;          // solo imágenes legibles
  altoPx: number | null;
  color: ColorArchivo | null;      // space de sharp: "cmyk" → CMYK, "srgb"/"rgb" → RGB, otro → "otro"
}

interface Archivo {
  id: string;                      // UUID
  userId: string;
  nombreOriginal: string;
  extension: ExtensionPermitida;
  mime: string;
  bytes: number;                   // declarados al pedir la URL; los reales al confirmar
  key: string;                     // "temporal/<id>.<ext>" o "pedidos/<folio>/<lineaId>_<cara>.<ext>"
  estado: "pendiente" | "subido";  // pendiente = URL emitida, aún sin confirmar
  metadatos: MetadatosArchivo | null; // se llena al confirmar
  miniatura: boolean;              // true si existe "<key>.miniatura.jpg"
  createdAt: string;
  subidoEn: string | null;
}

type PublicArchivo = Omit<Archivo, "userId" | "key">;
```

`data/archivos.json` pasa a `{ "version": 2, "archivos": Archivo[] }`, con descarte de la versión 1.

### URL firmada (`src/server/storage/url-firmada.ts`)

- **Firma:** HMAC-SHA256 con `AUTH_SECRET` sobre `PUT\n<key>\n<expira>\n<bytes>`.
- **URL:** `/api/r2-local/<key>?expira=<epoch-ms>&bytes=<n>&firma=<hex>`.
- **Vigencia:** 15 minutos.
- **Rechazos:**
  - firma alterada, URL vencida o llave distinta → 403;
  - un cuerpo de más bytes que los declarados → 413.

### Reglas de validación (`src/lib/pedidos/archivo-linea.ts`, puras)

Las reglas son `{ ...producto.archivo, ...variante.archivo }`. Ninguna regla bloquea: cada una que falla agrega una advertencia `{ codigo, mensaje }`, y `validado = advertencias.length === 0`.

| Código | Cuándo | Mensaje (ejemplo) |
| --- | --- | --- |
| `formato` | la extensión no está en `formatos` | "Formato PDF no permitido para este producto; se aceptan JPG, JPEG y TIFF" |
| `peso` | `bytes > pesoMaximoMB` | "Pesa 45.2 MB; el máximo es 40 MB" |
| `ilegible` | imagen que `sharp` no pudo leer | "No se pudo leer la imagen; mostrador la revisará" |
| `color` | `colorRequerido` no es `cualquiera` y no coincide | "El archivo está en RGB; se requiere CMYK" |
| `resolucion` | resolución efectiva < `resolucionMinima` | "Resolución efectiva de 150 dpi; se requieren al menos 300 dpi (mínimo 1098 × 661 px)" |
| `medida` | la proporción no corresponde, con la tolerancia | "La medida no corresponde: a 9.3 cm de ancho el archivo mide 9.3 × 5.0 cm; se esperaba 9.3 × 5.6 cm (± 0.1 cm)" |

**Medida y resolución** (solo imágenes legibles con `validarMedida`):

- **Medida esperada:**
  - variante **fija**: `W = ancho + 2·rebase` y `H = alto + 2·rebase`, en la unidad de la variante;
  - variante **variable**: la capturada, más su rebase (0 en el mock);
  - **metro lineal**: el ancho fijo por el largo capturado.
- **Orientaciones que se prueban:** `(W, H)` y, si `permiteGirar`, también `(H, W)`.
- **Para cada orientación:**
  - `escala = anchoPx ÷ W` (px por unidad);
  - la medida corresponde si `|altoPx ÷ escala − H| ≤ tolerancia`;
  - `resolución efectiva (dpi) = escala × 2.54` si la unidad es cm, o `× 0.0254` si es m.
- **Orientación que se usa:** la primera que corresponde; si ninguna, la `(W, H)`, para los mensajes.
- **Mínimo en px del mensaje:** `round(W ÷ 2.54 × resolucionMinima)` por `round(H ÷ 2.54 × resolucionMinima)` (en cm).

Ejemplos de KARSO:
- Tarjeta de 8.7 × 5 cm con rebase de 0.3 cm, que da 9.3 × 5.6 cm, a 300 dpi: **mínimo 1098 × 661 px**.
- Lona de 2.00 × 1.50 m a 100 dpi: **mínimo 7874 × 5906 px**.

Un archivo de 2196 × 1322 px, es decir 600 dpi, **pasa**: se pide al menos la mínima, no exactamente la mínima.

### Línea (`LineaPedido` de la SPEC 04)

`archivoId` se reemplaza por:

```ts
interface ArchivoLinea {
  archivoId: string;
  nombreOriginal: string;
  formato: ExtensionPermitida;
  color: ColorArchivo | null;
  anchoPx: number | null;
  altoPx: number | null;
  resolucion: number | null;       // dpi efectivos redondeados; null en vectores o ilegibles
  pesoMB: number;                  // 1 decimal
  validado: boolean;
  advertencias: { codigo: string; mensaje: string }[];
  subidoEn: string;
}

type ReversoLinea =
  | ({ tipo: "archivo" } & ArchivoLinea)
  | { tipo: "calendario"; anio: number }
  | { tipo: "texto"; texto: string };

// en LineaPedido:
archivos: { frente: ArchivoLinea | null; reverso: ReversoLinea | null };
```

KARSO guarda una `url` en cada cara. Aquí se guarda `archivoId`, y la URL se arma con `GET /api/archivos/:id`, porque en el demo los archivos se sirven con verificación de dueño. La forma de KARSO se recupera cuando llegue R2: URL firmada de lectura de 15 minutos.

**Entrada de la línea** (`lineaSchema`): `archivoId` se reemplaza por:

```ts
archivos: {
  frente: string | null;           // archivoId
  reverso: null | { tipo: "archivo"; archivoId: string } | { tipo: "calendario"; anio: number } | { tipo: "texto"; texto: string };
}
```

**Errores de estructura** (422, sí bloquean, porque la línea no tendría sentido):

- falta el frente con `requiereArchivo`;
- falta el reverso con `obligatorio`;
- llega un reverso con `no_aplica`;
- un archivo no existe, es de otro usuario o sigue `pendiente`;
- el año del calendario no es el actual ni el siguiente;
- un texto vacío o de más de 500 caracteres.

Al recalcular el borrador, las advertencias se vuelven a calcular con las reglas vigentes. Un calendario de un año que ya pasó marca `problema`.

`data/orders.json` pasa a la versión 3, con descarte de la versión 2.

### API

| Método y ruta | Uso | Errores principales |
| --- | --- | --- |
| `POST /api/archivos/subidas` | `{ nombre, bytes }` → `{ archivo, subida: { url, metodo: "PUT", expiraEn } }`; crea el archivo `pendiente` | 415 `FORMATO_NO_PERMITIDO`, 413 > 40 MB, 422 sin nombre |
| `PUT /api/r2-local/<key>?…` | Sube el binario (emula R2; sin sesión: la URL firmada autoriza) | 403 firma, vencida o llave; 413 más bytes que los declarados |
| `POST /api/archivos/:id/confirmar` | Lee el archivo, extrae metadatos, genera la miniatura → `{ archivo }` `subido` | 404 si no es del usuario, 409 si el binario no llegó |
| `GET /api/archivos/:id` | Original, solo al dueño (sin cambios) | 404 |
| `GET /api/archivos/:id/miniatura` | Miniatura JPG, solo al dueño | 404 si no hay o no es del usuario |
| `POST /api/archivos` | **Se retira** | — |

---

## Plan de implementación

1. **`sharp` e imágenes de prueba.**
   - Instalar `sharp` con versión exacta.
   - `e2e/fixtures/generar-imagenes.mjs` genera imágenes de un color, que pesan poco:
     - tarjeta CMYK de 1098 × 661, 2196 × 1322 y girada de 661 × 1098;
     - tarjeta RGB de 1098 × 661;
     - tarjeta CMYK de 549 × 331 (baja resolución) y de 1098 × 600 (medida incorrecta);
     - TIFF CMYK de 1098 × 661;
     - lona CMYK de 7874 × 5906.
   - Las imágenes generadas se versionan; un test comprueba que `sharp` lee cada una con lo esperado.
2. **Validación pura.** `src/lib/pedidos/archivo-linea.ts`, con `reglasDe(producto, variante)` y `validarArchivo(reglas, medidaEsperada, archivo)`. Tests con los ejemplos de KARSO:
   - 1098 × 661 pasa;
   - 2196 × 1322 pasa;
   - el girado pasa con `permiteGirar` y no pasa sin él;
   - RGB da `color`;
   - 549 × 331 da `resolucion`, con "(mínimo 1098 × 661 px)";
   - 1098 × 600 da `medida`;
   - lona de 7874 × 5906 a 2.00 × 1.50 m pasa;
   - PDF solo por formato y peso;
   - formato fuera de la variante da `formato`;
   - peso de más da `peso`;
   - ilegible da `ilegible`.
3. **Archivo versión 2, URL firmada y "R2 local".**
   - Dominio y repositorio con descarte de la versión 1.
   - `url-firmada.ts`.
   - `POST /api/archivos/subidas`, `PUT /api/r2-local/[...key]` (en streaming a `FileStorage`, contando bytes), `POST /api/archivos/:id/confirmar` (metadatos y miniatura con `sharp` y `toColorspace("srgb")`) y `GET /api/archivos/:id/miniatura`.
   - Se retira `POST /api/archivos`.
   - Tests:
     - flujo completo;
     - PNG o PSD → 415, y 41 MB → 413;
     - firma alterada, URL vencida (con reloj simulado) y otra llave → 403;
     - más bytes que los declarados → 413;
     - confirmar sin binario → 409, y de otro usuario → 404;
     - CMYK detectado;
     - miniatura JPG generada y servida solo al dueño.
4. **Línea con frente y reverso.**
   - Cambian `lineaSchema` (`archivos`) y `evaluarLinea`, que recibe los datos públicos de los archivos y devuelve la línea con `archivos` y las advertencias. También cambian dominio y repositorio (`orders.json` versión 3) y `prepararLinea`, `recalcularBorrador` y `liberarArchivoSiNoSeUsa`, que miran las dos caras.
   - Tests de rutas:
     - laminada sin reverso → 422;
     - volante bond con reverso → 422;
     - tarjeta couché sin reverso, con archivo, con calendario del año siguiente y con texto → 201;
     - un año pasado y un texto de 501 caracteres → 422;
     - un archivo RGB → 201 con `validado: false` y la advertencia `color`;
     - cambiar `colorRequerido` en el mock recalcula las advertencias.
5. **Archivos al hacer el pedido.** Dentro de `confirmar`, cada cara con archivo de cada línea se copia a `pedidos/<folio>/<lineaId>_<cara>.<ext>` (y su miniatura) como un `Archivo` nuevo, y la línea apunta a él. Los temporales que ya no usa nadie se borran. Tests:
   - rutas en el almacenamiento tras confirmar `P-000001`;
   - el temporal borrado;
   - el detalle sirve los archivos nuevos;
   - un mismo archivo en dos líneas queda copiado dos veces;
   - confirmar con advertencias → 201.
6. **Cliente HTTP y hooks.**
   - `subirArchivo` hace los tres pasos: pedir la URL, el `PUT` con `XMLHttpRequest` (progreso y cancelación) y confirmar.
   - Antes de pedir la URL revisa extensión y 40 MB.
   - `useSubirArchivo` no cambia su interfaz.
   - Tests con `fetch` y `XMLHttpRequest` simulados.
7. **Moléculas.**
   - `subida-archivo`: etiqueta de la cara, `accept` y "hasta 40 MB" nuevos, y datos del archivo ("TIFF · CMYK · 1098 × 661 px · 3.2 MB").
   - `advertencias-archivo` (nueva): "Tu archivo podría ser rechazado al revisarlo en sucursal" con cada motivo.
   - `selector-reverso` (nueva): sin reverso, mi archivo, calendario (año actual o siguiente) o texto (contador de 500).
   - `miniatura-archivo` usa `/miniatura` cuando `miniatura` es verdadero.
   - Insignia "Podría ser rechazado".
8. **Editor.** Pasos nuevos:
   1. producto;
   2. opciones y medida;
   3. archivos (frente y, según `caras.reverso`, el selector de reverso);
   4. acabados;
   5. cantidad y descripción.

   Las advertencias se recalculan en vivo al cambiar de variante o de medida, sin volver a subir el archivo. Editar una línea precarga frente y reverso.
9. **Borrador y detalle.** `item-resumen` muestra el frente y el reverso (miniatura, "Calendario 2027" o el texto recortado), las advertencias y la insignia "Podría ser rechazado". "Hacer pedido" sigue habilitado con advertencias.
10. **E2E.** Se actualizan `e2e/pedidos.spec.ts` y sus ayudantes (`subirPorApi` con los tres pasos) y se agrega `e2e/archivos.spec.ts` con los flujos de los criterios.
11. **Documentación.** El README suma:
    - el flujo de subida y el "R2 local";
    - formatos y 40 MB;
    - las reglas de validación con sus ejemplos;
    - las advertencias;
    - el reverso con calendario y texto, marcado como regla que hay que proponer a KARSO;
    - las rutas `pedidos/<folio>/…`;
    - las versiones nuevas de `orders.json` y `archivos.json`;
    - cómo regenerar las imágenes de prueba.

---

## Criterios de aceptación

- [ ] Subir un JPG pasa por los tres pasos: pedir la URL, `PUT` a `/api/r2-local/temporal/<id>.jpg` y confirmar. La barra de progreso avanza durante el `PUT` y "Cancelar" lo aborta.
- [ ] PNG y PSD muestran "Formato no permitido" y no se guardan. Un archivo de más de 40 MB muestra "El archivo supera 40 MB". La API responde 415 y 413.
- [ ] Un `PUT` con la firma alterada, con la URL vencida o a otra llave responde 403. Con más bytes que los declarados responde 413.
- [ ] Al confirmar una tarjeta CMYK de 1098 × 661 px, el archivo queda con `color: "CMYK"`, 1098 × 661 px, y la zona muestra "JPG · CMYK · 1098 × 661 px".
- [ ] Un TIFF CMYK muestra su miniatura (JPG generado) en el editor y en el borrador.
- [ ] En tarjeta couché, 1098 × 661, 2196 × 1322 y el girado 661 × 1098 quedan **sin advertencias**.
- [ ] Una tarjeta RGB muestra "El archivo está en RGB; se requiere CMYK".
- [ ] 549 × 331 muestra "Resolución efectiva de 150 dpi; se requieren al menos 300 dpi (mínimo 1098 × 661 px)". 1098 × 600 muestra la advertencia de medida con "se esperaba 9.3 × 5.6 cm (± 0.1 cm)".
- [ ] Una lona de 2.00 × 1.50 m con un archivo de 7874 × 5906 px queda sin advertencias. Si se cambia la medida a 3.00 × 1.50 m, sin volver a subir, aparece la advertencia de medida.
- [ ] Un PDF en tarjeta muestra la advertencia de formato ("se aceptan JPG, JPEG y TIFF") y no muestra advertencias de color, resolución ni medida.
- [ ] Una línea con advertencias se guarda, lleva la insignia "Podría ser rechazado" en el borrador y en el detalle, y "Hacer pedido" la acepta.
- [ ] Tarjeta laminada (reverso `obligatorio`): sin reverso no se guarda ("Elige el reverso"). Con calendario, texto o archivo sí.
- [ ] Tarjeta couché (reverso `opcional`): se guarda sin reverso, con archivo, con "Calendario 2026" o "Calendario 2027" (solo esos dos años) o con un texto. Un texto de 501 caracteres no se acepta.
- [ ] Volante bond (reverso `no_aplica`) no muestra la sección de reverso, y la API rechaza un reverso con 422.
- [ ] Un archivo de reverso se valida igual que el frente y muestra sus propias advertencias.
- [ ] Editar una línea precarga frente y reverso (archivo, calendario y año, o texto).
- [ ] Tras "Hacer pedido" `P-000001`, los archivos están en `pedidos/P-000001/<lineaId>_frente.<ext>` (y `_reverso`), los de `temporal/` ya no existen y el detalle muestra las miniaturas.
- [ ] Cambiar `colorRequerido` de la tarjeta a `cualquiera` en el mock quita la advertencia de color del borrador al recargar.
- [ ] Un `orders.json` de versión 2 y un `archivos.json` de versión 1 se reemplazan por archivos vacíos sin romper la app.
- [ ] La miniatura y el original de un archivo de otro usuario responden 404.
- [ ] A 375 px no hay scroll horizontal en el editor (con frente, reverso y advertencias), el borrador ni el detalle.
- [ ] Ningún componente importa de `src/server`, y las reglas de atomic design pasan en el lint.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` y `pnpm build` pasan.

---

## Decisiones

- **Sí:** al subir solo se extraen los datos del archivo; la validación contra la variante se hace al evaluar la línea, en el front y en el servidor. Cambiar de variante o de medida revalida sin volver a subir, y el orden de los pasos no importa.
- **No:** rechazar al subir según la variante. Obliga a elegir el producto antes y a volver a subir al cambiarlo.
- **Sí:** emular ya la subida directa a R2 con URL firmada (pedir URL, `PUT` y confirmar). Así el front no cambia cuando llegue R2 y el flujo local se parece al de producción.
- **No:** seguir con `POST /api/archivos`. Pasa el binario por el servidor, que es justo lo que KARSO prohíbe.
- **Sí:** la URL firmada usa HMAC con `AUTH_SECRET`, para no agregar otra variable de entorno en el demo.
- **Sí:** `sharp` para leer JPG y TIFF y generar miniaturas, como propone KARSO. Lee CMYK y TIFF.
- **Sí:** resolución efectiva calculada con los píxeles y la medida física.
- **No:** usar los dpi de los metadatos. Muchos archivos traen 72 dpi aunque les sobren píxeles.
- **Sí:** se pide resolución **al menos** mínima y proporción con tolerancia. Un archivo a 600 dpi pasa.
- **No:** píxeles exactos a la resolución mínima. Rechazaría archivos de más calidad.
- **Sí:** **todas** las validaciones contra la variante solo advierten ("podría ser rechazado"), incluidos formato, peso e ilegible (decisión del usuario). Mostrador decide al validar.
- **Sí:** al subir sí se rechaza lo que nunca puede servir: formatos fuera de la unión del catálogo (PNG y PSD, entre otros) y más de 40 MB.
- **Sí:** reverso con calendario o texto, sin costo extra, también para `obligatorio` (decisión del usuario; regla que hay que proponer a KARSO). La máquina imprime frente y reverso en la misma pasada.
- **Sí:** el calendario solo pide el año (el actual o el siguiente). El diseño es de la imprenta.
- **Sí:** el texto del reverso es texto simple de hasta 500 caracteres, igual que la descripción. La imprenta lo acomoda en su proceso de diseño.
- **No:** vista previa del calendario o del texto, ni opciones de diseño. Las maneja la imprenta.
- **Sí:** el reverso opcional no cambia el precio. En el mock, las variantes cuestan lo mismo con o sin reverso.
- **Sí:** miniatura JPG en RGB para JPG y TIFF. El navegador no muestra TIFF y muestra mal los JPG en CMYK.
- **Sí:** la línea guarda `archivoId` en cada cara en lugar de la `url` de KARSO. En el demo los archivos se sirven con verificación de dueño; con R2 se usará una URL firmada de lectura.
- **Sí:** al hacer el pedido, una copia por cara y línea en `pedidos/<folio>/<lineaId>_<cara>.<ext>`, como pide KARSO, aunque el mismo archivo se use en dos líneas.
- **Sí:** `orders.json` versión 3 y `archivos.json` versión 2, descartando los datos anteriores. Son datos de prueba.
- **No:** limpieza automática de `temporal/` en el demo. En producción es una regla de ciclo de vida de R2.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `sharp` es un binario nativo y puede fallar al instalar en otra máquina o en Vercel | Versión exacta. Next lo trata como paquete externo de servidor. `pnpm build` y los e2e lo prueban en local. |
| Leer un archivo de 40 MB con `sharp` usa mucha memoria | Los metadatos solo leen el encabezado. La miniatura se genera con `sequentialRead` y con un tamaño pequeño (400 px). |
| Las imágenes de prueba grandes (7874 × 5906) pesan en el repo | Son de un solo color: comprimidas pesan unos KB. Se regeneran con el script. |
| Un archivo con una extensión falsa (un PNG renombrado a .jpg) | Al confirmar, `sharp` reporta el formato real. Si no coincide con la extensión, se marca como ilegible, con advertencia. |
| Archivos `pendiente` que nunca se confirman o subidas abandonadas | Quedan en `temporal/` y en `archivos.json`. Está documentado; en producción los limpia la regla de 48 h de R2. |
| Que el cliente ignore las advertencias y el pedido se rechace después | La advertencia es visible en el editor, en el borrador y en el detalle, con lo que se esperaba. El rechazo y la corrección llegan en la SPEC 07. |
| Que la regla del reverso (calendario o texto) no se acuerde con el socio | Queda marcada como propuesta en este spec y en el README. Si el socio no la acepta, se quita sin tocar el resto. |
| El año del calendario cambia de un año a otro | Se calcula en America/Monterrey. Al recalcular, un año pasado marca `problema`. |

---

## Lo que **no** está en este spec

- R2 real y la limpieza de `temporal/`.
- `condicionesEspeciales`.
- Leer vectores por dentro.
- Diseño del calendario o del texto.
- Rechazo y corrección de archivos (SPEC 07).
- Folio `KAR-` (SPEC 06).

Cada uno de estos, si llega, va en su propio spec.
