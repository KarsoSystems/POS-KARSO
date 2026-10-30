# Portal de clientes — imprenta

Portal donde los clientes mayoristas de la imprenta mandan sus archivos a imprimir, presupuestan, pagan y reciben el pedido por envío, sin ir al local.

Este repositorio es el **demo**: la app Next.js guarda todo en archivos JSON locales. En preproducción y producción esta app será solo el front y hablará con un backend propio (MongoDB + storage tipo S3) por HTTP. El cambio es de URL base, no de código del front.

El trabajo se define con specs en [`specs/`](specs/). Lo implementado hoy es el [SPEC 01](specs/01-base-y-autenticacion-demo.md): registro, login (correo o Google simulado), verificación de WhatsApp simulada y el esqueleto del panel.

## Arrancar el demo

Requisitos: Node 20+ y pnpm (`corepack enable pnpm`).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Abre <http://localhost:3000>. Te redirige a `/login`.

### Probar el flujo

1. **Regístrate** en `/registro`. Todos los campos son obligatorios y el WhatsApp debe tener 10 dígitos de México.
2. **Verifica el WhatsApp.** No se envían mensajes reales. El código de 6 dígitos aparece en el aviso amarillo de la pantalla y en la consola del servidor, con el prefijo `[DEMO WHATSAPP]`.
3. Llegas al **panel**, que muestra tu número de cliente (`CLI-000001`, …).

**"Continuar con Google"** es una simulación: un modal pide nombre y correo, sin OAuth. Si el correo ya tiene cuenta, entra a esa misma cuenta. Si no, crea una y pide completar apellidos y WhatsApp.

## Variables de entorno

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `AUTH_SECRET` | Sí | Firma el JWT de la cookie de sesión. Mínimo 32 caracteres; si falta o es más corta, **el servidor no arranca**. Genera una con `openssl rand -base64 48`. |
| `NEXT_PUBLIC_API_BASE_URL` | No | URL base del backend. Vacía = mismo origen (los route handlers de Next del demo). En preproducción apunta al backend real. |
| `DATA_DIR` | No | Carpeta de los datos del demo. Por defecto `./data`. Los tests e2e usan una carpeta temporal. |

## Datos del demo

Todo vive en `data/`, que git ignora y que se crea sola al arrancar:

| Archivo | Contenido |
| --- | --- |
| `data/users.json` | Usuarios. La contraseña se guarda hasheada con bcrypt, nunca en texto plano. |
| `data/counters.json` | Consecutivo del `idCliente`. |
| `data/verifications.json` | Códigos de WhatsApp vigentes. |

**Para reiniciar los datos**, detén el servidor y borra la carpeta `data/`. Si el navegador conserva una cookie de sesión de un usuario que ya no existe, la app la limpia y te manda a `/login`.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Servidor de desarrollo en el puerto 3000. |
| `pnpm build` / `pnpm start` | Build y servidor de producción. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Tests de unidad y de route handlers (Vitest). |
| `pnpm test:e2e` | Tests end-to-end (Playwright). Levantan su propio servidor en el puerto 3100 con datos temporales. La primera vez: `pnpm exec playwright install chromium`. |

## Estructura

```
src/
├── app/                 # páginas y route handlers (/api/auth/*)
├── components/          # UI (shadcn/ui en components/ui)
├── lib/                 # código del front: cliente HTTP, validación (zod), utilidades
├── server/              # solo servidor: dominio, sesión, repositorios, almacén JSON
└── middleware.ts        # redirecciones según el estado de la cuenta
e2e/                     # tests de Playwright
desktop/                 # shell de escritorio con Tauri 2 (ver desktop/README.md)
specs/                   # specs del proyecto
```

Regla del proyecto: **los componentes no importan nada de `src/server`**. El front solo habla con el backend a través de `src/lib/api-client.ts`. Así, pasar del demo al backend real no toca la UI.

## App de escritorio

`desktop/` contiene un shell de Tauri 2 que abre esta app en una ventana nativa. Los prerrequisitos y el uso están en [`desktop/README.md`](desktop/README.md).

## Specs

| Spec | Contenido | Estado |
| --- | --- | --- |
| [01](specs/01-base-y-autenticacion-demo.md) | Base del proyecto, registro, login, Google simulado, verificación de WhatsApp, esqueleto del panel, shell Tauri | En verificación |
| 02 | Perfil: editar datos, direcciones e información de pago | Pendiente |
| 03 | Pedidos y subpedidos: imagen, tamaño, cantidad, presupuesto y estados | Pendiente |
| 04 | Previsualización a escala sobre el tabloide/mesa de impresión | Pendiente |
| 05 | Cerrar pedido, pago (simulado) y envío | Pendiente |

Fuera del demo por ahora: recuperar contraseña, verificación de correo, envío real de códigos, OAuth real de Google, backend real (MongoDB + S3) e instaladores de escritorio.
