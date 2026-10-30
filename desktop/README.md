# Shell de escritorio (Tauri 2)

Ventana de escritorio que carga el portal de clientes desde una URL. No tiene front propio ni comandos IPC: toda la app sigue siendo la web de Next.js de la raíz del repo (SPEC 01).

## Prerrequisitos

- **Node 20+ y pnpm** (`corepack enable pnpm`).
- **Rust** estable (`rustup`): <https://www.rust-lang.org/tools/install>.
- **Toolchain del sistema operativo:**
  - macOS: Xcode Command Line Tools (`xcode-select --install`).
  - Windows: Microsoft C++ Build Tools y WebView2 (viene con Windows 10/11 actualizados).
  - Linux: `webkit2gtk-4.1` y sus dependencias; ver <https://v2.tauri.app/start/prerequisites/>.

## Uso

1. En la raíz del repo, levanta la app web:

   ```bash
   cp .env.example .env.local   # solo la primera vez
   pnpm dev                     # http://localhost:3000
   ```

2. En otra terminal, abre el shell:

   ```bash
   cd desktop
   pnpm install                 # solo la primera vez
   pnpm tauri dev
   ```

La primera compilación de Rust tarda unos minutos; las siguientes son incrementales.

## Configurar la URL

La ventana carga `APP_URL` (por defecto `http://localhost:3000`). Se lee al arrancar, así que no hace falta recompilar:

```bash
APP_URL=https://preprod.ejemplo.com pnpm tauri dev
```

Una URL inválida detiene el arranque con el mensaje `APP_URL inválida (...)`.

## Estructura

```
desktop/
├── package.json           # @tauri-apps/cli
├── placeholder/index.html # Tauri exige un frontendDist; nunca se muestra
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json    # sin ventanas declaradas; bundle desactivado
    ├── icons/             # generados con `pnpm tauri icon <png de 1024 px>`
    └── src/lib.rs         # crea la ventana "main" apuntando a APP_URL
```

## Fuera de alcance (SPEC 01)

- Instaladores firmados (`.dmg`, `.msi`) y auto-update: `bundle.active` está en `false`.
- Comandos nativos o acceso al sistema de archivos desde la web.
