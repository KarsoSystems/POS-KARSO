# KARSO – Prompt de arranque del sistema

> **Cómo usar este documento:** es el contexto base para cualquier persona del equipo que trabaje en el sistema con Claude. Pégalo completo al iniciar (o guárdalo como `CLAUDE.md` en la raíz del repositorio) y después indica qué módulo vas a construir. Todas las reglas, nombres de campos y estructuras de este documento son obligatorias para que las partes del sistema encajen entre sí. Si algo no está definido aquí, **no lo inventes: pregunta** y, una vez decidido, agrégalo a este documento.

---

## 1. Contexto del negocio

KARSO es una imprenta de offset con **3 sucursales propias**. Vende:
- **Por millar**: tarjetas, volantes, folders, adhesivos, etc. Nunca menos de 1 millar.
- **Por unidad o paquete**: credenciales PVC, imanes (paquetes de 100), servicios.
- **Por medida**: lonas por m²; imán en rollo y DTF por metro lineal.
- **Por cotización**: trabajos como grabado sand blast, cuyo precio depende del diseño.

El catálogo inicial está en la sección 5.13.

El sistema tiene tres partes:
1. **Tienda en línea** (pública): los clientes se registran, cotizan, suben sus archivos, pagan con Mercado Pago y recogen en sucursal con un QR.
2. **Panel de administración** (interno, solo accesible desde las sucursales): catálogo, precios, banners, promociones, empleados, sucursales, pedidos de mostrador, producción (descarga para armado).
3. **Backend + base de datos** común a las dos anteriores.

No hay entrega a domicilio.

---

## 2. Stack

| Parte | Tecnología | Estado |
|---|---|---|
| Panel de administración | React + TypeScript + Vite, desplegado en Vercel | **Decidido** |
| Tienda en línea | Next.js + TypeScript, desplegado en Vercel | **Decidido** |
| Backend | NestJS + TypeScript, desplegado en Railway | **Decidido** (Railway probable) |
| Base de datos | MongoDB Atlas con Mongoose | **Decidido** |
| Autenticación | JWT firmados con llaves asimétricas (ver sección 2.1) | **Decidido** |
| Almacenamiento de archivos | Cloudflare R2 (API compatible con S3, sin costo por descarga) | **Decidido** |
| Pagos en línea | Mercado Pago | **Decidido** |
| Validación de imágenes | `sharp` (lee espacio de color, dpi, píxeles; soporta TIFF y JPG CMYK) | *Propuesto* |

### Consideraciones técnicas obligatorias
- **Subida de archivos**: los archivos pesan hasta 40 MB. Se suben **directo a Cloudflare R2 con URL firmada** (no a través de Vercel ni del backend). Después el backend lee el archivo desde R2 y lo valida.
- **Buckets de R2**: `karso-pedidos` (**privado**: archivos de clientes; solo se accede con URLs firmadas de corta duración, ej. 15 min) y `karso-publico` (imágenes de catálogo y banners, servido por dominio público o CDN).
- **Ruta de archivos de pedidos**: `pedidos/<folio>/<lineaId>_<cara>.<ext>`. Los archivos subidos que no terminan en un pedido se borran automáticamente (regla de ciclo de vida, ej. 48 h, sobre el prefijo `temporal/`).
- **MongoDB Atlas**: limitar el acceso de red a las IPs de salida de Railway; usuario de base de datos con permisos mínimos; respaldos automáticos activos.
- **Toda validación y todo cálculo de precio se hacen en el backend.** El front puede mostrar una vista previa, pero el total que se cobra siempre lo calcula el servidor.
- **Montos**: guardar en MongoDB como `Decimal128` (o enteros en centavos) y redondear a 2 decimales en cada línea. En los ejemplos se muestran en pesos.
- **Zona horaria**: todas las reglas de horario (corte de las 4 pm, sábado, etc.) se calculan en **America/Monterrey** (UTC-6). Las fechas se guardan en UTC.
- **Acceso al panel restringido a las sucursales**: el panel y las rutas del backend que usa el panel solo deben responder desde la red de las sucursales (lista de IPs permitidas en el firewall de Vercel para el front y un guard de NestJS para las rutas `/admin` del backend, o VPN si las IPs no son fijas — *pendiente*). Además, cada empleado inicia sesión con su usuario y contraseña.
- **Estructura del backend**: un módulo de NestJS por dominio (`auth`, `usuarios`, `empleados`, `sucursales`, `productos`, `pedidos`, `pagos`, `promociones`, `lotes`, `banners`, `configuracion`, `archivos`, `cifrado`). Las rutas del panel van bajo `/admin` y las de la tienda bajo `/tienda`.

### 2.1 Seguridad: tokens y llaves asimétricas

**Toda comunicación es por HTTPS.** Encima de eso:

**a) Tokens de sesión (JWT firmados con llave asimétrica)**
- Los tokens se firman con **llave privada** (algoritmo `RS256` o `EdDSA`) que solo tiene el backend. Cualquier servicio puede verificarlos con la **llave pública**, publicada en `/.well-known/jwks.json`.
- Cada llave tiene un identificador (`kid`) para poder **rotarlas** sin cerrar sesiones de golpe.
- **Token de acceso** de corta duración (15 min) + **token de renovación** (7 días) que se rota en cada uso y se puede revocar.
- Audiencias separadas: `tienda` (clientes) y `admin` (empleados). Un token de cliente nunca sirve en el panel. El token de empleado incluye `rol` y `sucursalId`.
- En la tienda (Next.js) el token de renovación va en cookie `httpOnly`, `secure`, `sameSite`.
- Las contraseñas se guardan con **hash** (argon2 o bcrypt), nunca cifradas.

**b) Cifrado de información sensible en la base de datos**
- Se cifran **por campo** los datos personales y fiscales de clientes y socios:
  - `usuarios`: teléfono, dirección, datosFiscales (RFC, razón social, régimen, código postal, uso CFDI, correo de factura).
  - `pedidos`: usuario.telefono, usuario.correo, clienteMostrador (nombre, teléfono, correo), datosFiscales.
- Esquema de **cifrado de sobre**: cada valor se cifra con **AES-256-GCM** usando una llave de datos; la llave de datos se guarda cifrada con la **llave pública RSA** de KARSO, y solo el módulo `cifrado` del backend, que tiene la **llave privada**, puede descifrarla.
- Los campos que se necesitan **buscar** (correo para iniciar sesión, teléfono para contar usos de promociones en mostrador) se guardan además como **índice ciego**: un HMAC-SHA256 del valor normalizado, para buscar sin descifrar.
- Formato de un campo cifrado en MongoDB:

```json
{
  "telefono": {
    "cifrado": "<base64>",
    "iv": "<base64>",
    "tag": "<base64>",
    "kid": "datos-2026-01"
  },
  "telefonoHash": "<hmac-sha256>"
}
```

- En los ejemplos de colecciones de este documento los campos sensibles se muestran **en claro** para que sean legibles; en la base real van cifrados con este formato.
- Las llaves privadas **nunca** van en el repositorio: se cargan como variables de entorno o secretos de Railway (idealmente desde un gestor de secretos o KMS).
- Los datos de tarjeta **nunca** pasan por el sistema: los maneja Mercado Pago, y en mostrador la terminal física.

**c) API para socios (a futuro)**
- Cada socio registra su **llave pública** en KARSO. Para hacer peticiones firma un JWT con **su llave privada**; KARSO lo verifica con la llave pública registrada. Así KARSO nunca guarda secretos del socio.

### Convenciones
- Nombres de colecciones, campos y valores **en español, camelCase**, sin acentos en los nombres de campo (`descripcion`, no `descripción`).
- Valores de enumeraciones en minúsculas con guion bajo: `en_proceso`, `por_volumen`.
- Referencias entre colecciones con `ObjectId` y nombre `<entidad>Id` (ej. `productoId`, `sucursalId`).
- Todos los documentos llevan `creadoEn` y `actualizadoEn`.

---

## 3. Alcance del MVP

### Entra
- Tienda en línea: registro, inicio de sesión, perfil, catálogo, cotización, carga y validación de archivos, pago con Mercado Pago, QR, seguimiento de pedidos, corrección de archivos rechazados.
- Panel: banners, productos y precios, promociones, empleados, sucursales, configuración general, pedidos (consulta, cambio de estatus, pagos), pedidos de mostrador, descarga para armado con lotes.
- Opción "Requiero factura" que suma IVA y captura datos fiscales (solo se guardan; **no se timbra**).

### No entra (pero el diseño debe permitirlo después)
- **Módulo de facturación** (timbrado CFDI, cancelaciones, factura global). Los campos `requiereFactura`, `datosFiscales` y `factura` ya existen en el pedido.
- **Socios comerciales vía API**: clientes de alto volumen que revenden fuera del estado y que en el futuro enviarán sus pedidos directamente al sistema (hoy mandan un correo con toda su producción). Por eso el pedido tiene `canal` (`en_linea`, `mostrador` y en el futuro `socio`).
- Imposición automática de planillas.
- Corte de caja y reportes (*pendiente confirmar*).
- Entrega a domicilio.

---

## 4. Roles del panel

| Acción | Admin | Mostrador | Armado |
|---|:-:|:-:|:-:|
| Banners, productos, precios, promociones | ✅ | – | – |
| Empleados, sucursales, configuración | ✅ | – | – |
| Ver pedidos | ✅ | ✅ | ✅ |
| Crear pedido de mostrador y registrar pagos | ✅ | ✅ | ✅ |
| Pasar pedido a **Recibido** (validar) | ✅ | ✅ | – |
| Pasar a **En proceso** productos que **no** requieren armado (lonas, viniles) | ✅ | ✅ | – |
| Descargar pedidos / crear lotes (pasa a **En proceso** productos con armado) | ✅ | – | ✅ |
| Pasar a **Listo** productos con armado | ✅ | – | ✅ |
| Pasar a **Listo** productos sin armado | ✅ | ✅ | – |
| Marcar **Rechazado** | ✅ | ✅ | ✅ |
| Marcar **Entregado** (escaneando el QR) | ✅ | ✅ | – |
| **Cancelar** pedido y registrar reembolso | ✅ | – | – |

Cada empleado tiene una sucursal asignada, pero **todos los roles (admin, mostrador y armado) ven y operan los pedidos de todas las sucursales**, para entregas y cambios de estatus. La sucursal del empleado se usa como filtro predeterminado en la lista de pedidos (se puede cambiar a "Todas"), como sucursal de entrega sugerida al crear pedidos de mostrador y para registrar en el historial y los pagos desde qué sucursal se hizo cada acción.

---

## 5. Reglas de negocio

### 5.1 Clientes en línea
- **Ocasional**: nombres, apellido paterno, apellido materno, teléfono, correo y contraseña (obligatorios); dirección opcional.
- **Socio**: lo mismo, más dirección y nombre del negocio (obligatorios).
- En el perfil puede editar: teléfono, dirección, nombre del negocio (socios), datos fiscales y contraseña. Nombre y correo no se editan.

### 5.2 Productos y variantes
- Un **producto** es una familia (ej. "Volante", "Tarjeta", "Lona 13 oz.", "Imán"). A nivel producto se definen: categoría, descripción, imagen, sucursales, especificaciones (acabados), reglas de archivo, si requiere armado y si está activo.
- Cada producto tiene una o más **variantes**: la combinación concreta que el cliente compra. Ej. Volante → "Carta · Real · Couché 128 g 4x4". Cada variante tiene su propio **SKU, atributos, medida, volumen, precioPor, precio, cobro mínimo, días de entrega, caras, canales** y si está activa. Puede sobrescribir las reglas de archivo del producto.
- **atributos**: lo que el cliente escoge (ej. `tamano`, `ajuste`, `papel`, `copias`, `presentacion`). La tienda arma los selectores a partir de los atributos de las variantes activas, y solo ofrece combinaciones que existen. Ej. el tríptico solo existe en ajuste "Real".
- **Medida fija** (tarjetas, volantes): la medida viene en la variante. Ancho y alto tienen `min` = `max`.
- **Medida variable** (lonas): el cliente captura ancho y alto dentro del rango `min`–`max`. Puede elegir una **medida rápida** predefinida (ej. Banner 1.60 × 0.60 m).
- **Metro lineal** (imán en rollo, DTF): el ancho es fijo (`min` = `max`, ej. 0.56 m) y el cliente captura el largo (`alto`) en metros.
- **Volumen** = unidad de venta y lo que cuenta la `cantidad`:
  - `millar`: cantidad 2 = 2 millares (2,000 piezas). Mínimo 1.
  - `unidad`: cantidad 2 = 2 piezas iguales.
  - `paquete`: cantidad 2 = 2 paquetes de `piezasPorPaquete` (ej. imán 100 piezas).
- **precioPor** = cómo se calcula el precio:
  - `volumen`: precio × cada unidad de volumen.
  - `m2`: precio de cada pieza = ancho × alto × precio.
  - `metro_lineal`: precio de cada pieza = largo × precio.
  - `cotizacion`: sin precio de catálogo. **Solo en mostrador**: el empleado captura el precio acordado al crear el pedido.
  - En `m2` y `metro_lineal`, si el resultado es menor al `cobroMinimo`, se cobra el mínimo.
- **No hay precios por escala**: cuando el precio cambia con la cantidad (ej. imán 100 pzs $600, 1,000 pzs $2,200), cada cantidad es una variante.
- **canales** (por variante): `en_linea`, `mostrador` o ambos. Ej. la lona urgente solo se vende en mostrador.
- **requiereArmado** (por producto): `true` para productos que van en planilla (tarjetas, volantes); `false` para lonas, imán en rollo y gran formato.
- **diasEntrega** (por variante): días hábiles de entrega. `0` = mismo día (ver 5.9).
- **caras.reverso**: `obligatorio`, `opcional` (ej. tarjeta couché 4x1 o 4x0) o `no_aplica` (ej. volante bond 4x0, lona).
- **sucursales**: sucursales donde está disponible el producto.
- **categoria**: tipo de producto (ej. `Tarjetas`, `Volantes`, `Lonas`). Organiza el catálogo de la tienda.
- **Cada variante tiene su propio SKU.** Ej. tarjeta couché, tarjeta laminada y tarjeta sulfatada son tres SKU distintos.
- **grupoArmado** (por variante, solo si el producto requiere armado): nombre del grupo de variantes que **pueden ir en la misma planilla** (mismo papel/material y proceso). Ej. `Tarjetas Couché`, `Tarjetas Laminadas`, `Tarjetas Sulfatadas`, `Volantes Couché 128 g`, `Volantes Bond 90 g`. Variantes con distinto material **nunca** comparten grupo. Lo define el admin al crear la variante. Organiza la descarga del armado (ver 5.10).

### 5.3 Especificaciones (acabados)
Cada producto tiene sus especificaciones disponibles, cada una con precio y tipo de cobro:

| tipoCobro | Cálculo por unidad de volumen | Ejemplo |
|---|---|---|
| `fijo` | precio | Empalme $30 |
| `por_volumen` | precio | Suaje $40 por millar |
| `por_m2` | precio × área de la pieza | Laminado |
| `por_metro_lineal` | precio × perímetro de la pieza | Dobladillo 7 m × $10 = $70 |
| `por_pieza` | precio × piezas calculadas | Ojillos cada 0.50 m del perímetro: 14 × $3 = $42 |

Una especificación puede limitarse a ciertas variantes con `variantes: [varianteId, ...]`. Si no lo trae, aplica a todas las variantes del producto.

### 5.4 Cálculo del pedido
Por cada línea de producto:
1. `importeBaseUnitario` según `precioPor` de la variante:
   - `volumen`: precio.
   - `m2`: max(ancho × alto × precio, cobroMinimo).
   - `metro_lineal`: max(largo × precio, cobroMinimo).
   - `cotizacion`: precio capturado por el empleado (`precioCotizado`), con comentario obligatorio.
2. `importeEspecificacionesUnitario` = suma de las especificaciones elegidas.
3. `importeUnitario` = 1 + 2.
4. `subtotal` = importeUnitario × cantidad.

Para el pedido:
1. `subtotal` = suma de subtotales de las líneas.
2. `descuento` = según promociones (ver 5.5).
3. `baseIva` = subtotal − descuento.
4. `iva` = baseIva × tasaIva **solo si** `requiereFactura = true` (si no, 0).
5. `total` = baseIva + iva.

Los precios del catálogo son **sin IVA**. Al crear el pedido se **copian** nombre, variante, atributos, precios y especificaciones del producto, para que cambios posteriores del catálogo no afecten pedidos ya hechos.

### 5.5 Promociones
- Siempre por **porcentaje**.
- Cada promoción tiene: código, porcentaje, vigencia (inicio y fin), usos totales máximos (opcional), usos máximos por cliente (opcional), canales donde aplica (en línea, mostrador o ambos), activa/inactiva.
- **Configuración general** (en el panel):
  - `maxCodigosPorPedido`: cuántos códigos se aceptan en un mismo pedido.
  - `modoCombinacion`: `suma` (10% + 5% = 15%) o `cascada` (10% y luego 5% sobre el resultado).
  - `descuentoMaximoPorcentaje`: tope del descuento total.
- El descuento se aplica sobre el subtotal del pedido, antes de IVA.
- Usos por cliente: en línea se identifica por `usuarioId`; en mostrador por teléfono o correo del cliente.

### 5.6 Pagos
- **En línea**: Mercado Pago, pago completo del total. El pedido se crea en `pago_pendiente` y pasa a `enviado` cuando Mercado Pago confirma (webhook). *Supuesto*: si no se paga en `horasExpiracionPagoPendiente` (configurable, ej. 24 h), se cancela automáticamente.
- **Mostrador**: efectivo o tarjeta (terminal física; se registra el número de autorización). **Anticipo mínimo del 50%** del total (configurable) para crear el pedido. Se pueden registrar varios pagos (anticipo y liquidación).
- **No se puede marcar Entregado si el saldo es mayor a $0.** Al escanear el QR, el sistema muestra el saldo pendiente.

### 5.7 Archivos
Las reglas se definen en el producto (`archivo`) y una variante puede sobrescribirlas:
- `requiereArchivo`: si el producto lleva archivo (ej. un servicio de planchado no lleva).
- `formatos`: formatos permitidos.
  - Imagen: **.jpg, .jpeg, .tiff**. PNG no, porque no soporta CMYK.
  - Vector (para corte de vinil y textil): **.pdf, .ai, .eps, .svg**.
- `colorRequerido`: `CMYK` (impresión offset y gran formato), `RGB` o `cualquiera`.
- `resolucionMinima` y `pesoMaximoMB`: ej. tarjetas 300 dpi, lonas 100 dpi, máximo 40 MB.
- `validarMedida`: si el archivo debe corresponder a la medida del producto.

Validación de imágenes:
- **Medida fija**: los píxeles deben corresponder a (medida + rebase × 2) a la resolución mínima, con la tolerancia del producto. Ej. tarjeta 8.7 × 5 cm + 0.3 cm de rebase por lado = 9.3 × 5.6 cm a 300 dpi = **1098 × 661 px**. Si `permiteGirar`, se acepta también 661 × 1098.
- **Medida variable o metro lineal**: la proporción del archivo debe coincidir con las medidas capturadas (tolerancia del producto) y tener al menos la resolución mínima a tamaño real. Ej. 2.00 × 1.50 m a 100 dpi = **7874 × 5906 px** mínimo.
- Archivos vectoriales: se valida formato y peso; no aplica resolución.

Reglas generales:
- El reverso se pide según `caras.reverso` de la variante (`obligatorio`, `opcional`, `no_aplica`).
- Validar también `condicionesEspeciales` del producto (ej. `requiere_revision_manual`).
- Los pedidos de mostrador usan **las mismas validaciones**: el empleado corrige el archivo en tienda antes de subirlo.
- El sistema debe dar mensajes claros al cliente cuando un archivo no pasa (qué falló y qué se esperaba).

### 5.8 Estatus

| Valor | Nombre visible | Significado |
|---|---|---|
| `pago_pendiente` | Pago pendiente | Pedido en línea esperando confirmación de Mercado Pago |
| `enviado` | Enviado | Pedido pagado, en espera de validación en mostrador |
| `recibido` | Recibido | Mostrador validó archivos y datos |
| `en_proceso` | En proceso | Productos con armado: ya están en una planilla (lote). Productos sin armado: mostrador lo recibió y pasó a impresión |
| `listo` | Listo | Listo para recoger |
| `entregado` | Entregado | El cliente lo recogió |
| `rechazado` | Rechazado | El pedido tiene un defecto |
| `cancelado` | Cancelado | El pedido no continúa |

**Flujo en línea:** pago_pendiente → enviado → recibido → en_proceso → listo → entregado.
**Flujo de mostrador:** el pedido **nace en `recibido`** (el empleado ya validó al crearlo) → en_proceso → listo → entregado.

**Estatus por línea y por pedido:** un pedido puede mezclar productos con y sin armado (ej. tarjetas y una lona). Por eso cada línea de producto tiene su propio `estatus` de producción (`recibido`, `en_proceso`, `listo`), y el estatus del pedido se **calcula** así:
- Si todas las líneas están en `listo` → pedido `listo`.
- Si al menos una línea está en `en_proceso` o `listo` → pedido `en_proceso`.
- `pago_pendiente`, `enviado`, `recibido`, `rechazado`, `entregado` y `cancelado` se manejan a nivel pedido.

**Rechazado:**
- Requiere **motivo** (de un catálogo: archivo en RGB, resolución insuficiente, medida incorrecta, texto fuera de área segura, otro) y comentario.
- Se notifica al cliente por correo con el motivo.
- El cliente tiene **5 días** (configurable, *supuesto: naturales*) para subir el archivo corregido desde su cuenta. Al subirlo, el pedido regresa a `enviado` y se vuelve a validar.
- Si no corrige en el plazo, pasa automáticamente a `cancelado`.
- Puede rechazarse en mostrador (al validar) o en armado (si se detecta un defecto).

**Cancelado:** solo admin. Registra motivo y, si aplica, reembolso (monto, método, fecha).

**Notificaciones mínimas al cliente (correo):** pedido confirmado, rechazado (con motivo) y listo.

Cada cambio de estatus se registra en `historialEstatus` con fecha, empleado (o "sistema") y comentario.

### 5.9 Fecha de entrega
- Cada variante tiene `diasEntrega` (días hábiles). `0` = **mismo día**: si se recibe antes del corte se entrega ese mismo día; después del corte, el siguiente día hábil (ej. lona urgente en mostrador).
- **Días hábiles**: lunes a sábado, excepto los días festivos configurados.
- **El conteo empieza cuando el pedido pasa a `recibido`** (aunque solo tenga anticipo). Si fue rechazado, el conteo empieza **cuando el cliente vuelve a subir el archivo**.
- **Día de recepción**:
  - Lunes a viernes antes de las **4:00 pm** → ese mismo día.
  - Sábado antes de las **12:00 pm** → ese mismo día.
  - Después del corte, domingo o día festivo → siguiente día hábil.
- **Fecha de entrega de la línea** = día de recepción + `diasEntrega` días hábiles.
- **Fecha de entrega del pedido** = la más tardía de sus líneas.
- Horarios, días y festivos son configurables desde el panel.

Ejemplos (5 días hábiles):

| Pasa a Recibido | Día de recepción | Entrega |
|---|---|---|
| Lunes 2 nov, 10:00 am | Lunes 2 | Sábado 7 nov |
| Lunes 2 nov, 5:00 pm | Martes 3 | Lunes 9 nov |
| Sábado 7 nov, 1:00 pm | Lunes 9 | Sábado 14 nov |
| Martes 10 nov, 10:00 am | Martes 10 | Martes 17 nov (lunes 16 festivo) |

### 5.10 Producción y descarga para armado
El sistema **no arma** la planilla: el armador lo hace en CorelDRAW con su criterio (espacios para guillotina, plastas de color, textos finos). El sistema le entrega los archivos organizados.

- Solo aparecen líneas con `requiereArmado = true` en estatus `recibido`.
- El armador selecciona pedidos/líneas y crea un **lote**. Las líneas del lote pasan a `en_proceso` y no vuelven a aparecer como pendientes.
- **Estructura de la descarga**: **una carpeta por `grupoArmado`** (ej. Tarjetas Couché, Tarjetas Laminadas, Tarjetas Sulfatadas), con todos los archivos de ese grupo juntos, **sin subcarpetas** por acabados ni por frente/reverso. Así cada carpeta contiene solo diseños que sí pueden ir en la misma planilla. El armador trabaja con la vista previa de miniaturas del explorador: necesita ver todos los diseños del mismo grupo a la vez para decidir cuáles van juntos por color.

```
KARSO_2026-11-02_LOTE-001/
├── Tarjetas Couché/
│   ├── KAR-2026-001001_x2_Juan-Perez_SUAJE_FRENTE.tiff
│   ├── KAR-2026-001001_x2_Juan-Perez_SUAJE_REVERSO.tiff
│   ├── KAR-2026-001004_x1_Maria-Gonzalez_FRENTE.jpg
│   └── KAR-2026-001004_x1_Maria-Gonzalez_REVERSO.jpg
├── Tarjetas Laminadas/
│   └── ...
├── Tarjetas Sulfatadas/
│   └── ...
├── Volantes Couché 128 g/
│   └── ...
└── RESUMEN_LOTE-001.pdf
```

- Nombre de archivo (**confirmado con el armador**): `folio_xCantidad_Cliente_ACABADOS_CARA.ext`. Ej. `KAR-2026-001001_x2_Juan-Perez_SUAJE_FRENTE.tiff`.
  - `folio`: folio del pedido (ej. `KAR-2026-001001`).
  - `xCantidad`: cantidad **en millares**, que es también cuántos espacios ocupa el diseño en la planilla (ej. `x2` = 2 millares = 2 espacios).
  - `Cliente`: nombre y primer apellido del cliente, sin acentos y con guion (ej. `Juan-Perez`).
  - `ACABADOS`: los acabados de la línea en mayúsculas separados por guion (ej. `SUAJE-FOLIADO`); se omite si no lleva.
  - `CARA`: `FRENTE` o `REVERSO`. Al compartir el mismo nombre base, frente y reverso quedan uno junto al otro.
- `RESUMEN` en PDF: por grupo de armado, total de espacios, folios, cliente, producto/variante (SKU), acabados y notas del cliente.
- **Forma de descarga**: en Chrome/Edge, botón "Descargar a carpeta" (File System Access API) que escribe la estructura directamente en la carpeta de trabajo que elija el armador, lista para arrastrar a CorelDRAW. En otros navegadores, ZIP con la misma estructura.
- *Mejora futura*: ordenar los archivos de claro a oscuro según la luminosidad promedio.

Los productos **sin armado** (lonas, viniles) no pasan por la descarga: mostrador los pasa a `en_proceso` cuando los recibe y a `listo` cuando están terminados.

### 5.11 Pedidos de mostrador
- El empleado captura: nombre, teléfono y correo del cliente; productos, medidas, especificaciones, archivos (con las mismas validaciones), promociones, sucursal de entrega, factura (opcional) y pago (anticipo mínimo 50%).
- Usan **el mismo objeto de pedido** que los pedidos en línea, con `canal = "mostrador"`, `usuarioId = null` y los datos en `clienteMostrador`.
- Se genera el mismo QR y folio.

### 5.12 Vista pública editable desde el panel
- **Banners**: imagen, título, liga (opcional), orden, vigencia (opcional), activo.
- **Lista de productos y precios**: desde el módulo de productos (activo/inactivo, orden, variantes, precios, especificaciones).

### 5.13 Catálogo inicial
Tomado de la lista de precios de KARSO. **Los precios pueden estar desactualizados**: sirven para cargar datos iniciales y de prueba; el admin los actualiza desde el panel. Precios sin IVA.

**Volantes** (por millar, con armado). Couché 128 g 4x4 (reverso opcional), grupo de armado `Volantes Couché 128 g`; bond 90 g 4x0 (sin reverso), grupo `Volantes Bond 90 g`. El ajustado es un poco más chico que el real.

| Tamaño | Ajustado (couché) | $ | Real (couché) | $ | Real (bond) |
|---|---|---|---|---|---|
| 1/4 carta | 9.9 × 14 cm | 160 | 10.5 × 14 cm | 320 | – |
| 1/2 carta | 19.8 × 14 cm | 320 | 14 × 21 cm | 640 | – |
| Carta | 19.8 × 28 cm | 640 | 21 × 28 cm | 1,280 | 1,600 |
| Oficio | 19.8 × 35 cm | 960 | 21 × 35 cm | 1,920 | 2,200 |
| Tabloide | 28 × 39.6 cm | 1,280 | 28 × 42 cm | 2,560 | – |
| Tríptico | – (no existe ajustado) | – | 21 × 28 cm | 1,280 | – |
| 4 cartas | 56 × 42 cm | 2,400 | – | – | 2,560 |
| 8 cartas | 56 × 87 cm | 5,000 | – | – | 5,500 |
| 4 oficios | 70 × 47 cm | 4,800 | – | – | – |
| 8 oficios | 70 × 95 cm | 7,000 | – | – | – |

**Tarjetas** (couché 300 g; barniz UV 4x1 / 4x0; laminado mate 4x4). Con armado. Cada fila es una variante con su propio SKU; el grupo de armado indica qué puede ir en la misma planilla.

| Variante | Medida | $ | Volumen | Grupo de armado (propuesto) |
|---|---|---|---|---|
| Couché | 8.7 × 5 cm | 115 | millar | Tarjetas Couché |
| Postal chica | 8.7 × 15 cm | 345 | millar | Tarjetas Couché |
| Postal grande | 10 × 17.4 cm | 460 | millar | Tarjetas Couché |
| Laminada | 8.7 × 5 cm | 180 | millar | Tarjetas Laminadas |
| Postal laminada chica | 8.7 × 15 cm | 540 | millar | Tarjetas Laminadas |
| Postal laminada grande | 10 × 17.4 cm | 720 | millar | Tarjetas Laminadas |
| Laminada barniz a registro | 8.7 × 5 cm | 400 | millar | Tarjetas Laminadas Barniz Registro |
| Sulfatada | 8.7 × 5 cm | *por definir* | millar | Tarjetas Sulfatadas |
| Credencial PVC | 8.5 × 5.4 cm | 15 | unidad | Credenciales PVC |

**Folder** (por millar): carta couché barniz UV $8,500; carta laminado mate $10,500.

**Imán**: 100 piezas 9 × 5 cm $600 (paquete); 1,000 piezas 9 × 5 cm $2,200 (millar); metro lineal, ancho 56 cm, $500. Solo esas presentaciones.

**Notas 1 tinta**:

| Tamaño | Original | 1 copia | 2 copias |
|---|---|---|---|
| 1/4 carta | 320 | 750 | 1,050 |
| 1/2 carta | 400 | 950 | 1,250 |
| Carta | 600 | 1,350 | 2,300 |
| 1/2 oficio | 600 | 1,350 | 2,300 |
| Oficio | 1,000 | 1,800 | 2,700 |
| Membretada | 1,600 | – | – |
| Talonario 1/3 | 650 | 800 | – |

**Adhesivo** (por millar): carta 21 × 28 cm $2,200; tabloide 28 × 42 cm $4,400; 4 cartas 56 × 42 cm $8,400.

**Lona 13 oz.** (por m², sin armado):

| Variante | $ por m² | Canales | Entrega |
|---|---|---|---|
| Lona 720 dpi | 55 | en línea y mostrador | por definir |
| Lona urgente 720 dpi | 75 | **solo mostrador** | **mismo día** |
| Lona alta resolución 1200 dpi | 180 | en línea y mostrador | por definir |

**Corte de vinil** (formas básicas sin detalle; archivo vectorial): solo corte $45; depilado y transfer $180; corte textil $80; textil corte y depilado $300.

**DTF**: metro lineal 58 cm de ancho, $300. **Planchado**: $10 por bajada (servicio, sin archivo).

**Grabado sand blast**: por cotización (solo mostrador).

**Sublimación** (taza blanca $30, taza mágica $85, gorra $65, playera $180): **sin definir**, no entra en el MVP.

---

## 6. Base de datos (MongoDB) – 10 colecciones

| # | Colección | Contenido | Notas |
|---|---|---|---|
| 1 | `usuarios` | Clientes de la tienda en línea (ocasional y socio) | Incluye datos fiscales guardados |
| 2 | `empleados` | Usuarios del panel (admin, mostrador, armado) | Separado de clientes |
| 3 | `sucursales` | Las 3 sucursales | |
| 4 | `productos` | Catálogo, con variantes y especificaciones embebidas | |
| 5 | `pedidos` | Pedidos en línea y de mostrador | Líneas, pagos, historial, rechazos embebidos |
| 6 | `promociones` | Códigos de descuento | |
| 7 | `lotes` | Lotes de producción del armador | |
| 8 | `banners` | Banners de la tienda | |
| 9 | `configuracion` | Un solo documento con reglas generales | Promociones, entregas, IVA, anticipo, festivos |
| 10 | `contadores` | Secuencias para folios | `KAR-2026-000001`, `LOTE-2026-001` |

**A futuro:** `socios` (integración por API), `facturas` (módulo de facturación), `cortesCaja`.

**Índices mínimos:**
- `usuarios.correo` (único), `empleados.correo` (único)
- `productos.variantes.sku` (único), `productos.activo + productos.orden`, `productos.categoria`
- `pedidos.folio` (único), `pedidos.usuarioId`, `pedidos.estatus`, `pedidos.sucursalEntregaId`, `pedidos.creadoEn`, `pedidos.clienteMostrador.telefono`
- `promociones.codigo` (único)

Los ejemplos usan `ObjectId` como cadena para que sean legibles.

### 6.1 `usuarios`

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60001",
  "tipo": "socio",
  "nombres": "Juan",
  "apellidoPaterno": "Pérez",
  "apellidoMaterno": "López",
  "telefono": "8112345678",
  "correo": "juan@elaguila.com",
  "correoVerificado": true,
  "passwordHash": "<hash>",
  "direccion": {
    "calle": "Av. Juárez 123",
    "colonia": "Centro",
    "ciudad": "Monterrey",
    "estado": "Nuevo León",
    "codigoPostal": "64000"
  },
  "nombreNegocio": "Imprenta El Águila",
  "datosFiscales": {
    "rfc": "PELJ800101ABC",
    "razonSocial": "JUAN PEREZ LOPEZ",
    "regimenFiscal": "612",
    "codigoPostal": "64000",
    "usoCfdi": "G03",
    "correoFactura": "facturas@elaguila.com"
  },
  "activo": true,
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

Ocasional: `tipo: "ocasional"`, `nombreNegocio: null`, `direccion` opcional.

### 6.2 `empleados`

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60007",
  "nombres": "Luis",
  "apellidoPaterno": "Martínez",
  "apellidoMaterno": "Ruiz",
  "correo": "luis@karso.com",
  "telefono": "8187654321",
  "passwordHash": "<hash>",
  "rol": "mostrador",
  "sucursalId": "6720a1f0c1a2b3c4d5e60100",
  "activo": true,
  "ultimoAcceso": "2026-11-02T16:00:00Z",
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

`rol`: `admin` | `mostrador` | `armado`.

### 6.3 `sucursales`

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60100",
  "clave": 0,
  "nombre": "KARSO Centro",
  "direccion": {
    "calle": "Calle Morelos 456",
    "colonia": "Centro",
    "ciudad": "Monterrey",
    "estado": "Nuevo León",
    "codigoPostal": "64000"
  },
  "telefono": "8180001111",
  "horario": "Lunes a viernes 9:00–19:00, sábado 9:00–14:00",
  "activa": true,
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

### 6.4 `productos`

Las variantes van **embebidas** en el producto. Los SKU de los ejemplos son ilustrativos.

**Tarjeta** (medida fija, con armado; se muestran 3 de sus variantes):

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60201",
  "nombre": "Tarjeta",
  "categoria": "Tarjetas",
  "descripcion": "Tarjetas de presentación en couché 300 g",
  "imagen": "https://publico.karso.com/catalogo/tarjeta.jpg",
  "idSocio": 0,
  "sucursales": ["6720a1f0c1a2b3c4d5e60100"],
  "activo": true,
  "orden": 1,
  "requiereArmado": true,

  "archivo": {
    "requiereArchivo": true,
    "formatos": ["jpg", "jpeg", "tiff"],
    "colorRequerido": "CMYK",
    "resolucionMinima": 300,
    "pesoMaximoMB": 40,
    "validarMedida": true
  },

  "variantes": [
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60211",
      "sku": "70000177",
      "nombre": "Couché 8.7 x 5 cm",
      "grupoArmado": "Tarjetas Couché",
      "atributos": { "presentacion": "Couché", "acabadoBase": "Barniz UV" },
      "medida": {
        "tipo": "fija",
        "unidad": "cm",
        "ancho": { "min": 8.7, "max": 8.7 },
        "alto":  { "min": 5.0, "max": 5.0 },
        "rebase": 0.3,
        "tolerancia": 0.1,
        "permiteGirar": true,
        "medidasRapidas": []
      },
      "volumen": "millar",
      "piezasPorPaquete": null,
      "cantidadMinima": 1,
      "precioPor": "volumen",
      "precio": 115.00,
      "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "opcional" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60212",
      "sku": "70000180",
      "nombre": "Laminada 8.7 x 5 cm",
      "grupoArmado": "Tarjetas Laminadas",
      "atributos": { "presentacion": "Laminada", "acabadoBase": "Laminado mate 4x4" },
      "medida": {
        "tipo": "fija",
        "unidad": "cm",
        "ancho": { "min": 8.7, "max": 8.7 },
        "alto":  { "min": 5.0, "max": 5.0 },
        "rebase": 0.3,
        "tolerancia": 0.1,
        "permiteGirar": true,
        "medidasRapidas": []
      },
      "volumen": "millar",
      "piezasPorPaquete": null,
      "cantidadMinima": 1,
      "precioPor": "volumen",
      "precio": 180.00,
      "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "obligatorio" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60218",
      "sku": "70000184",
      "nombre": "Credencial PVC 8.5 x 5.4 cm",
      "grupoArmado": "Credenciales PVC",
      "atributos": { "presentacion": "Credencial PVC" },
      "medida": {
        "tipo": "fija",
        "unidad": "cm",
        "ancho": { "min": 8.5, "max": 8.5 },
        "alto":  { "min": 5.4, "max": 5.4 },
        "rebase": 0.3,
        "tolerancia": 0.1,
        "permiteGirar": true,
        "medidasRapidas": []
      },
      "volumen": "unidad",
      "piezasPorPaquete": null,
      "cantidadMinima": 1,
      "precioPor": "volumen",
      "precio": 15.00,
      "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "opcional" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    }
  ],

  "especificaciones": [
    { "id": 1, "nombre": "Despunte", "tipoCobro": "por_volumen", "precio": 15.00, "precioTexto": "+$15.00 por millar", "variantes": null, "activa": true },
    { "id": 2, "nombre": "Suaje",    "tipoCobro": "por_volumen", "precio": 40.00, "precioTexto": "+$40.00 por millar", "variantes": null, "activa": true },
    { "id": 3, "nombre": "Foliado",  "tipoCobro": "por_volumen", "precio": 80.00, "precioTexto": "+$80.00 por millar", "variantes": null, "activa": true }
  ],

  "condicionesEspeciales": [],
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

**Volante** (atributos tamaño, ajuste y papel; se muestran 3 de sus variantes):

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60203",
  "nombre": "Volante",
  "categoria": "Volantes",
  "descripcion": "Volantes en couché 128 g 4x4 o bond 90 g 4x0",
  "imagen": "https://publico.karso.com/catalogo/volante.jpg",
  "idSocio": 0,
  "sucursales": ["6720a1f0c1a2b3c4d5e60100"],
  "activo": true,
  "orden": 2,
  "requiereArmado": true,

  "archivo": {
    "requiereArchivo": true,
    "formatos": ["jpg", "jpeg", "tiff"],
    "colorRequerido": "CMYK",
    "resolucionMinima": 300,
    "pesoMaximoMB": 40,
    "validarMedida": true
  },

  "variantes": [
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60231",
      "sku": "70000201",
      "nombre": "Carta · Ajustado · Couché 128 g",
      "grupoArmado": "Volantes Couché 128 g",
      "atributos": { "tamano": "Carta", "ajuste": "Ajustado", "papel": "Couché 128 g 4x4" },
      "medida": {
        "tipo": "fija", "unidad": "cm",
        "ancho": { "min": 19.8, "max": 19.8 }, "alto": { "min": 28, "max": 28 },
        "rebase": 0.3, "tolerancia": 0.1, "permiteGirar": true, "medidasRapidas": []
      },
      "volumen": "millar", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "volumen", "precio": 640.00, "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "opcional" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60232",
      "sku": "70000202",
      "nombre": "Carta · Real · Couché 128 g",
      "grupoArmado": "Volantes Couché 128 g",
      "atributos": { "tamano": "Carta", "ajuste": "Real", "papel": "Couché 128 g 4x4" },
      "medida": {
        "tipo": "fija", "unidad": "cm",
        "ancho": { "min": 21, "max": 21 }, "alto": { "min": 28, "max": 28 },
        "rebase": 0.3, "tolerancia": 0.1, "permiteGirar": true, "medidasRapidas": []
      },
      "volumen": "millar", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "volumen", "precio": 1280.00, "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "opcional" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60233",
      "sku": "70000203",
      "nombre": "Carta · Real · Bond 90 g",
      "grupoArmado": "Volantes Bond 90 g",
      "atributos": { "tamano": "Carta", "ajuste": "Real", "papel": "Bond 90 g 4x0" },
      "medida": {
        "tipo": "fija", "unidad": "cm",
        "ancho": { "min": 21, "max": 21 }, "alto": { "min": 28, "max": 28 },
        "rebase": 0.3, "tolerancia": 0.1, "permiteGirar": true, "medidasRapidas": []
      },
      "volumen": "millar", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "volumen", "precio": 1600.00, "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "no_aplica" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    }
  ],

  "especificaciones": [],
  "condicionesEspeciales": [],
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

**Lona 13 oz.** (medida variable por m², sin armado; la urgente solo en mostrador y el mismo día):

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60202",
  "nombre": "Lona 13 oz.",
  "categoria": "Lonas",
  "descripcion": "Lona de 13 onzas impresa en gran formato",
  "imagen": "https://publico.karso.com/catalogo/lona.jpg",
  "idSocio": 0,
  "sucursales": ["6720a1f0c1a2b3c4d5e60100"],
  "activo": true,
  "orden": 3,
  "requiereArmado": false,

  "archivo": {
    "requiereArchivo": true,
    "formatos": ["jpg", "jpeg", "tiff"],
    "colorRequerido": "CMYK",
    "resolucionMinima": 100,
    "pesoMaximoMB": 40,
    "validarMedida": true
  },

  "variantes": [
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60221",
      "sku": "70000178",
      "nombre": "Lona 720 dpi",
      "grupoArmado": null,
      "atributos": { "calidad": "720 dpi", "entrega": "Normal" },
      "medida": {
        "tipo": "variable", "unidad": "m",
        "ancho": { "min": 0.50, "max": 5.00 }, "alto": { "min": 0.50, "max": 10.00 },
        "rebase": 0, "tolerancia": 0.02, "permiteGirar": true,
        "medidasRapidas": [ { "nombre": "Banner", "ancho": 1.60, "alto": 0.60 } ]
      },
      "volumen": "unidad", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "m2", "precio": 55.00, "cobroMinimo": 100.00,
      "diasEntrega": 2,
      "caras": { "frente": "obligatorio", "reverso": "no_aplica" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60222",
      "sku": "70000179",
      "nombre": "Lona urgente 720 dpi",
      "grupoArmado": null,
      "atributos": { "calidad": "720 dpi", "entrega": "Urgente (mismo día)" },
      "medida": {
        "tipo": "variable", "unidad": "m",
        "ancho": { "min": 0.50, "max": 5.00 }, "alto": { "min": 0.50, "max": 10.00 },
        "rebase": 0, "tolerancia": 0.02, "permiteGirar": true,
        "medidasRapidas": [ { "nombre": "Banner", "ancho": 1.60, "alto": 0.60 } ]
      },
      "volumen": "unidad", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "m2", "precio": 75.00, "cobroMinimo": 100.00,
      "diasEntrega": 0,
      "caras": { "frente": "obligatorio", "reverso": "no_aplica" },
      "canales": ["mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60223",
      "sku": "70000181",
      "nombre": "Lona alta resolución 1200 dpi",
      "grupoArmado": null,
      "atributos": { "calidad": "1200 dpi", "entrega": "Normal" },
      "medida": {
        "tipo": "variable", "unidad": "m",
        "ancho": { "min": 0.50, "max": 5.00 }, "alto": { "min": 0.50, "max": 10.00 },
        "rebase": 0, "tolerancia": 0.02, "permiteGirar": true,
        "medidasRapidas": []
      },
      "volumen": "unidad", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "m2", "precio": 180.00, "cobroMinimo": 200.00,
      "diasEntrega": 2,
      "caras": { "frente": "obligatorio", "reverso": "no_aplica" },
      "canales": ["en_linea", "mostrador"],
      "activa": true,
      "archivo": { "resolucionMinima": 150 }
    }
  ],

  "especificaciones": [
    { "id": 5, "nombre": "Ojillos",    "tipoCobro": "por_pieza",        "precio": 3.00,  "cadaMetros": 0.50, "precioTexto": "+$3.00 por ojillo (cada 50 cm)", "variantes": null, "activa": true },
    { "id": 6, "nombre": "Dobladillo", "tipoCobro": "por_metro_lineal", "precio": 10.00, "precioTexto": "+$10.00 por metro lineal", "variantes": null, "activa": true },
    { "id": 7, "nombre": "Empalme",    "tipoCobro": "fijo",             "precio": 30.00, "precioTexto": "+$30.00 por pieza", "variantes": null, "activa": true }
  ],

  "condicionesEspeciales": [],
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

> La resolución mínima de 150 dpi para la lona de alta resolución es un supuesto; ver pendientes.

**Imán** (paquete, millar y metro lineal; solo esas presentaciones):

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60204",
  "nombre": "Imán",
  "categoria": "Imanes",
  "descripcion": "Imán impreso",
  "imagen": "https://publico.karso.com/catalogo/iman.jpg",
  "idSocio": 0,
  "sucursales": ["6720a1f0c1a2b3c4d5e60100"],
  "activo": true,
  "orden": 4,
  "requiereArmado": false,

  "archivo": {
    "requiereArchivo": true,
    "formatos": ["jpg", "jpeg", "tiff"],
    "colorRequerido": "CMYK",
    "resolucionMinima": 300,
    "pesoMaximoMB": 40,
    "validarMedida": true
  },

  "variantes": [
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60241",
      "sku": "70000301",
      "nombre": "100 piezas 9 x 5 cm",
      "grupoArmado": null,
      "atributos": { "presentacion": "100 piezas" },
      "medida": {
        "tipo": "fija", "unidad": "cm",
        "ancho": { "min": 9, "max": 9 }, "alto": { "min": 5, "max": 5 },
        "rebase": 0.3, "tolerancia": 0.1, "permiteGirar": true, "medidasRapidas": []
      },
      "volumen": "paquete", "piezasPorPaquete": 100, "cantidadMinima": 1,
      "precioPor": "volumen", "precio": 600.00, "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "no_aplica" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60242",
      "sku": "70000302",
      "nombre": "1,000 piezas 9 x 5 cm",
      "grupoArmado": null,
      "atributos": { "presentacion": "1,000 piezas" },
      "medida": {
        "tipo": "fija", "unidad": "cm",
        "ancho": { "min": 9, "max": 9 }, "alto": { "min": 5, "max": 5 },
        "rebase": 0.3, "tolerancia": 0.1, "permiteGirar": true, "medidasRapidas": []
      },
      "volumen": "millar", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "volumen", "precio": 2200.00, "cobroMinimo": 0,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "no_aplica" },
      "canales": ["en_linea", "mostrador"],
      "activa": true
    },
    {
      "varianteId": "6720a1f0c1a2b3c4d5e60243",
      "sku": "70000303",
      "nombre": "Metro lineal (ancho 56 cm)",
      "grupoArmado": null,
      "atributos": { "presentacion": "Metro lineal" },
      "medida": {
        "tipo": "variable", "unidad": "m",
        "ancho": { "min": 0.56, "max": 0.56 }, "alto": { "min": 1.00, "max": 20.00 },
        "rebase": 0, "tolerancia": 0.02, "permiteGirar": false, "medidasRapidas": []
      },
      "volumen": "unidad", "piezasPorPaquete": null, "cantidadMinima": 1,
      "precioPor": "metro_lineal", "precio": 500.00, "cobroMinimo": 500.00,
      "diasEntrega": 5,
      "caras": { "frente": "obligatorio", "reverso": "no_aplica" },
      "canales": ["en_linea", "mostrador"],
      "activa": true,
      "archivo": { "resolucionMinima": 150 }
    }
  ],

  "especificaciones": [],
  "condicionesEspeciales": [],
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

> `idSocio: 0` = producto para público general (reservado para la futura integración con socios). Precios de especificaciones, rebase, tolerancias, rangos, cobros mínimos y días de entrega son valores de ejemplo.

### 6.5 `pedidos`

**Pedido en línea** (tarjetas + lona, con factura y un código de promoción):

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60301",
  "folio": "KAR-2026-001001",
  "canal": "en_linea",

  "usuarioId": "6720a1f0c1a2b3c4d5e60001",
  "usuario": {
    "nombre": "Juan Pérez López",
    "tipo": "socio",
    "telefono": "8112345678",
    "correo": "juan@elaguila.com"
  },
  "clienteMostrador": null,
  "origen": "Imprenta El Águila",
  "creadoPor": null,

  "sucursalEntregaId": "6720a1f0c1a2b3c4d5e60100",

  "estatus": "en_proceso",
  "historialEstatus": [
    { "estatus": "pago_pendiente", "fecha": "2026-11-02T21:10:00Z", "por": "sistema", "comentario": "" },
    { "estatus": "enviado",        "fecha": "2026-11-02T21:12:00Z", "por": "sistema", "comentario": "Pago aprobado por Mercado Pago" },
    { "estatus": "recibido",       "fecha": "2026-11-02T21:40:00Z", "por": "6720a1f0c1a2b3c4d5e60007", "comentario": "Archivos correctos" },
    { "estatus": "en_proceso",     "fecha": "2026-11-02T22:00:00Z", "por": "6720a1f0c1a2b3c4d5e60007", "comentario": "Lona enviada a impresión" }
  ],

  "fechaInicioConteo": "2026-11-02T21:40:00Z",
  "fechaEntregaEstimada": "2026-11-07",

  "productos": [
    {
      "lineaId": "6720a1f0c1a2b3c4d5e60401",
      "productoId": "6720a1f0c1a2b3c4d5e60201",
      "varianteId": "6720a1f0c1a2b3c4d5e60211",
      "sku": "70000177",
      "nombre": "Tarjeta",
      "variante": "Couché 8.7 x 5 cm",
      "atributos": { "presentacion": "Couché", "acabadoBase": "Barniz UV" },
      "categoria": "Tarjetas",
      "grupoArmado": "Tarjetas Couché",
      "volumen": "millar",
      "piezasPorPaquete": null,
      "precioPor": "volumen",
      "precioBase": 115.00,
      "precioCotizado": null,
      "cantidad": 2,
      "requiereArmado": true,
      "diasEntrega": 5,
      "fechaEntregaEstimada": "2026-11-07",

      "estatus": "en_proceso",
      "loteId": "6720a1f0c1a2b3c4d5e60501",

      "medida": {
        "tipo": "fija",
        "unidad": "cm",
        "ancho": 8.7,
        "alto": 5.0,
        "area": null
      },

      "archivos": {
        "frente": {
          "url": "https://archivos.karso.com/pedidos/KAR-2026-001001/6720a1f0c1a2b3c4d5e60401_frente.tiff",
          "nombreOriginal": "tarjeta-frente.tiff",
          "formato": "tiff",
          "color": "CMYK",
          "resolucion": 300,
          "anchoPx": 1098,
          "altoPx": 661,
          "pesoMB": 3.2,
          "validado": true,
          "subidoEn": "2026-11-02T21:05:00Z"
        },
        "reverso": {
          "url": "https://archivos.karso.com/pedidos/KAR-2026-001001/6720a1f0c1a2b3c4d5e60401_reverso.jpg",
          "nombreOriginal": "tarjeta-reverso.jpg",
          "formato": "jpg",
          "color": "CMYK",
          "resolucion": 300,
          "anchoPx": 1098,
          "altoPx": 661,
          "pesoMB": 1.1,
          "validado": true,
          "subidoEn": "2026-11-02T21:06:00Z"
        }
      },

      "especificaciones": [
        { "id": 2, "nombre": "Suaje", "tipoCobro": "por_volumen", "precio": 40.00, "unidades": 1, "importeUnitario": 40.00 }
      ],

      "descripcion": "Esquinas redondeadas en el suaje, por favor",

      "importeBaseUnitario": 115.00,
      "importeEspecificacionesUnitario": 40.00,
      "importeUnitario": 155.00,
      "subtotal": 310.00
    },
    {
      "lineaId": "6720a1f0c1a2b3c4d5e60402",
      "productoId": "6720a1f0c1a2b3c4d5e60202",
      "varianteId": "6720a1f0c1a2b3c4d5e60221",
      "sku": "70000178",
      "nombre": "Lona 13 oz.",
      "variante": "Lona 720 dpi",
      "atributos": { "calidad": "720 dpi", "entrega": "Normal" },
      "categoria": "Lonas",
      "grupoArmado": null,
      "volumen": "unidad",
      "piezasPorPaquete": null,
      "precioPor": "m2",
      "precioBase": 55.00,
      "precioCotizado": null,
      "cantidad": 2,
      "requiereArmado": false,
      "diasEntrega": 2,
      "fechaEntregaEstimada": "2026-11-04",

      "estatus": "en_proceso",
      "loteId": null,

      "medida": {
        "tipo": "variable",
        "unidad": "m",
        "ancho": 2.00,
        "alto": 1.50,
        "area": 3.00
      },

      "archivos": {
        "frente": {
          "url": "https://archivos.karso.com/pedidos/KAR-2026-001001/6720a1f0c1a2b3c4d5e60402_frente.jpg",
          "nombreOriginal": "lona-evento.jpg",
          "formato": "jpg",
          "color": "CMYK",
          "resolucion": 100,
          "anchoPx": 7874,
          "altoPx": 5906,
          "pesoMB": 28.4,
          "validado": true,
          "subidoEn": "2026-11-02T21:07:00Z"
        },
        "reverso": null
      },

      "especificaciones": [
        { "id": 5, "nombre": "Ojillos", "tipoCobro": "por_pieza", "precio": 3.00, "unidades": 14, "importeUnitario": 42.00 }
      ],

      "descripcion": "",

      "importeBaseUnitario": 165.00,
      "importeEspecificacionesUnitario": 42.00,
      "importeUnitario": 207.00,
      "subtotal": 414.00
    }
  ],

  "promociones": [
    { "promocionId": "6720a1f0c1a2b3c4d5e60601", "codigo": "BUENFIN10", "porcentaje": 10, "descuento": 72.40 }
  ],

  "requiereFactura": true,
  "datosFiscales": {
    "rfc": "PELJ800101ABC",
    "razonSocial": "JUAN PEREZ LOPEZ",
    "regimenFiscal": "612",
    "codigoPostal": "64000",
    "usoCfdi": "G03",
    "correoFactura": "facturas@elaguila.com"
  },

  "subtotal": 724.00,
  "descuento": 72.40,
  "baseIva": 651.60,
  "tasaIva": 0.16,
  "iva": 104.26,
  "total": 755.86,

  "pagos": [
    {
      "tipo": "total",
      "metodo": "mercadopago",
      "monto": 755.86,
      "referencia": "1234567890",
      "estatus": "aprobado",
      "fecha": "2026-11-02T21:12:00Z",
      "recibidoPor": null
    }
  ],
  "pagado": 755.86,
  "saldo": 0.00,

  "rechazos": [],
  "cancelacion": null,

  "factura": {
    "estatus": "pendiente",
    "uuid": null,
    "pdf": null,
    "xml": null,
    "fechaEmision": null
  },

  "qr": "KAR-2026-001001",
  "creadoEn": "2026-11-02T21:10:00Z",
  "actualizadoEn": "2026-11-02T22:00:00Z"
}
```

Cálculo del ejemplo:

| | Tarjeta | Lona |
|---|---|---|
| Base unitaria | $115.00 por millar | 3 m² × $55 = $165.00 por pieza |
| Especificaciones unitarias | Suaje $40.00 | 14 ojillos × $3 = $42.00 |
| Importe unitario | $155.00 | $207.00 |
| Subtotal | × 2 millares = **$310.00** | × 2 piezas = **$414.00** |

Subtotal $724.00 − descuento 10% $72.40 = base $651.60 + IVA 16% $104.26 = **total $755.86**. Sin factura: `tasaIva` 0, `iva` 0, `datosFiscales` y `factura` null, total **$651.60**.

Fecha: recibido lunes 2 nov a las 3:40 pm (antes del corte) → tarjeta 5 días hábiles = sábado 7 nov; lona 2 días = miércoles 4 nov; pedido = **sábado 7 nov**.

**Pedido de mostrador** (solo los campos que cambian respecto al de en línea):

```json
{
  "folio": "KAR-2026-001002",
  "canal": "mostrador",
  "usuarioId": null,
  "usuario": null,
  "clienteMostrador": {
    "nombre": "María González",
    "telefono": "8119998888",
    "correo": "maria@correo.com"
  },
  "origen": "",
  "creadoPor": {
    "empleadoId": "6720a1f0c1a2b3c4d5e60007",
    "nombre": "Luis Martínez",
    "rol": "mostrador",
    "sucursalId": "6720a1f0c1a2b3c4d5e60100"
  },
  "estatus": "recibido",
  "requiereFactura": false,
  "datosFiscales": null,
  "subtotal": 724.00,
  "descuento": 0,
  "baseIva": 724.00,
  "tasaIva": 0,
  "iva": 0,
  "total": 724.00,
  "pagos": [
    { "tipo": "anticipo", "metodo": "efectivo", "monto": 362.00, "referencia": null, "estatus": "aprobado", "fecha": "2026-11-02T22:00:00Z", "recibidoPor": "6720a1f0c1a2b3c4d5e60007" },
    { "tipo": "liquidacion", "metodo": "tarjeta", "monto": 362.00, "referencia": "AUT-558812", "estatus": "aprobado", "fecha": "2026-11-07T17:30:00Z", "recibidoPor": "6720a1f0c1a2b3c4d5e60007" }
  ],
  "pagado": 724.00,
  "saldo": 0.00,
  "factura": null
}
```

**Rechazo** (elemento de `rechazos`):

```json
{
  "fecha": "2026-11-02T21:40:00Z",
  "por": "6720a1f0c1a2b3c4d5e60007",
  "lineaId": "6720a1f0c1a2b3c4d5e60401",
  "motivo": "resolucion_insuficiente",
  "comentario": "El frente está a 150 dpi, se requieren 300",
  "fechaLimiteCorreccion": "2026-11-07T21:40:00Z",
  "corregidoEn": null
}
```

**Cancelación**:

```json
{
  "fecha": "2026-11-08T18:00:00Z",
  "por": "6720a1f0c1a2b3c4d5e60009",
  "motivo": "No corrigió el archivo en el plazo",
  "reembolso": { "monto": 362.00, "metodo": "efectivo", "fecha": "2026-11-08T18:00:00Z" }
}
```

Valores:
- `canal`: `en_linea` | `mostrador` (futuro: `socio`)
- `estatus` del pedido: `pago_pendiente` | `enviado` | `recibido` | `en_proceso` | `listo` | `entregado` | `rechazado` | `cancelado`
- `estatus` de línea: `recibido` | `en_proceso` | `listo`
- `pagos.tipo`: `total` | `anticipo` | `liquidacion`
- `pagos.metodo`: `mercadopago` | `efectivo` | `tarjeta`
- `precioCotizado`: solo para variantes con `precioPor = cotizacion` (mostrador); en las demás es `null`.

### 6.6 `promociones`

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60601",
  "codigo": "BUENFIN10",
  "descripcion": "Buen Fin 2026",
  "porcentaje": 10,
  "vigencia": {
    "inicio": "2026-11-13T06:00:00Z",
    "fin": "2026-11-17T05:59:59Z"
  },
  "usosMaximos": 100,
  "usosPorCliente": 1,
  "usosActuales": 37,
  "canales": ["en_linea", "mostrador"],
  "activa": true,
  "creadoPor": "6720a1f0c1a2b3c4d5e60009",
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

`usosMaximos` y `usosPorCliente` en `null` = sin límite. `usosActuales` se incrementa de forma atómica al confirmar el pedido.

### 6.7 `lotes`

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60501",
  "folio": "LOTE-2026-001",
  "fecha": "2026-11-02T22:00:00Z",
  "creadoPor": "6720a1f0c1a2b3c4d5e60008",
  "sucursalId": "6720a1f0c1a2b3c4d5e60100",
  "grupos": [
    {
      "grupoArmado": "Tarjetas Couché",
      "espacios": 2,
      "lineas": [
        {
          "pedidoId": "6720a1f0c1a2b3c4d5e60301",
          "folio": "KAR-2026-001001",
          "lineaId": "6720a1f0c1a2b3c4d5e60401",
          "cliente": "Juan Pérez López",
          "producto": "Tarjeta · Couché 8.7 x 5 cm",
          "acabados": ["Suaje"],
          "cantidad": 2,
          "descripcion": "Esquinas redondeadas en el suaje, por favor",
          "archivos": [
            "KAR-2026-001001_x2_Juan-Perez_SUAJE_FRENTE.tiff",
            "KAR-2026-001001_x2_Juan-Perez_SUAJE_REVERSO.tiff"
          ]
        }
      ]
    }
  ],
  "totalLineas": 1,
  "descargas": [
    { "fecha": "2026-11-02T22:01:00Z", "por": "6720a1f0c1a2b3c4d5e60008", "forma": "carpeta" }
  ],
  "creadoEn": "2026-11-02T22:00:00Z",
  "actualizadoEn": "2026-11-02T22:01:00Z"
}
```

### 6.8 `banners`

```json
{
  "_id": "6720a1f0c1a2b3c4d5e60701",
  "titulo": "Buen Fin: 10% en tarjetas",
  "imagen": "https://archivos.karso.com/banners/buenfin.jpg",
  "imagenMovil": "https://archivos.karso.com/banners/buenfin-movil.jpg",
  "liga": "/productos/tarjeta-4x1",
  "orden": 1,
  "vigencia": { "inicio": "2026-11-13T06:00:00Z", "fin": "2026-11-17T05:59:59Z" },
  "activo": true,
  "creadoEn": "2026-11-01T18:00:00Z",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

### 6.9 `configuracion` (un solo documento)

```json
{
  "_id": "general",
  "zonaHoraria": "America/Monterrey",

  "iva": { "tasa": 0.16 },

  "promociones": {
    "maxCodigosPorPedido": 2,
    "modoCombinacion": "suma",
    "descuentoMaximoPorcentaje": 30
  },

  "mostrador": {
    "anticipoMinimoPorcentaje": 50,
    "metodosPago": ["efectivo", "tarjeta"]
  },

  "pedidos": {
    "diasParaCorregir": 5,
    "horasExpiracionPagoPendiente": 24,
    "motivosRechazo": [
      { "clave": "color_rgb", "nombre": "El archivo está en RGB" },
      { "clave": "resolucion_insuficiente", "nombre": "Resolución insuficiente" },
      { "clave": "medida_incorrecta", "nombre": "La medida no corresponde" },
      { "clave": "fuera_area_segura", "nombre": "Texto o elementos fuera del área segura" },
      { "clave": "otro", "nombre": "Otro" }
    ]
  },

  "entregas": {
    "diasHabiles": [
      { "dia": "lunes",     "corte": "16:00" },
      { "dia": "martes",    "corte": "16:00" },
      { "dia": "miercoles", "corte": "16:00" },
      { "dia": "jueves",    "corte": "16:00" },
      { "dia": "viernes",   "corte": "16:00" },
      { "dia": "sabado",    "corte": "12:00", "cierre": "14:00" }
    ],
    "festivos": ["2026-11-16", "2026-12-25", "2027-01-01"]
  },

  "actualizadoPor": "6720a1f0c1a2b3c4d5e60009",
  "actualizadoEn": "2026-11-01T18:00:00Z"
}
```

### 6.10 `contadores`

```json
{ "_id": "pedidos-2026", "secuencia": 1002 }
{ "_id": "lotes-2026", "secuencia": 1 }
```

Se incrementan con `findOneAndUpdate` + `$inc` (atómico) para generar folios sin duplicados.

---

## 7. Módulos del panel de administración

1. **Inicio de sesión** de empleados (correo y contraseña) y menú según rol.
2. **Pedidos**: lista con filtros (estatus, canal, sucursal, fecha, folio, cliente), detalle con archivos, especificaciones, pagos, historial; acciones según rol (validar, rechazar, cambiar estatus de líneas sin armado, registrar pago, entregar con QR y bloqueo por saldo, cancelar).
3. **Nuevo pedido (mostrador)**: mismo flujo de cotización y validación que la tienda; captura de cliente, promociones, factura opcional y anticipo mínimo.
4. **Producción / Armado**: líneas pendientes con armado, agrupadas por grupo de armado; creación de lotes; descarga a carpeta o ZIP con la estructura y el resumen PDF; historial de lotes; marcar líneas como listas.
5. **Productos**: alta, edición, categoría, variantes (atributos, medida, precio, canales, días de entrega), especificaciones, activar/desactivar, orden.
6. **Promociones**: alta, edición, vigencia, porcentaje, límites de uso, canales.
7. **Banners**: alta, edición, orden, vigencia.
8. **Empleados**: alta, edición, rol, sucursal, activar/desactivar, restablecer contraseña.
9. **Sucursales**: alta y edición.
10. **Configuración**: IVA, reglas de promociones, anticipo, días para corregir, días hábiles, cortes y festivos.

---

## 8. Pendientes por definir

- Confirmar si, además de HTTPS y el cifrado en base de datos, se requiere cifrar el contenido de las peticiones del navegador al backend (aporta poco: la llave tendría que estar en el navegador).
- IPs de las 3 sucursales (fijas o no) para restringir el acceso al panel.
- Si los 5 días para corregir son naturales o hábiles.
- Si el tipo de cliente "socio" de la tienda en línea tiene algún beneficio en el MVP o solo guarda el nombre del negocio.
- Corte de caja y reportes: si entran en el MVP.
- Tamaño de planilla y si se pueden mezclar productos distintos en una planilla (para la mejora futura de producción).
- Proveedor de timbrado para el futuro módulo de facturación.
- Precios reales de especificaciones, rebases, tolerancias, cobros mínimos y días de entrega (los de la lista de precios pueden estar desactualizados).
- Qué categorías entran en la tienda en línea desde el MVP y cuáles solo en mostrador.
- Notas: unidad de venta (millar o block) y si llevan armado.
- Tarjeta sulfatada: precio y medidas. Confirmar los grupos de armado propuestos en el catálogo (ej. si couché 8.7 × 5 y postales couché pueden ir en la misma planilla).
- Folder: medida extendida.
- Corte de vinil: unidad de cobro (pieza, metro) y si se vende en línea.
- Resolución mínima de archivo para lona de alta resolución y para imán en rollo.
- Si se acepta **transferencia/depósito** como método de pago en mostrador (la lista de precios muestra cuentas bancarias).
- Sublimación (tazas, gorras, playeras), DTF y planchado: sin definir; no entran en el MVP.
