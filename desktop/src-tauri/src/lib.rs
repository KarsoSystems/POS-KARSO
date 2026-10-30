use tauri::{Url, WebviewUrl, WebviewWindowBuilder};

/// URL por defecto: el `pnpm dev` de la app Next en la raíz del repo.
const DEFAULT_APP_URL: &str = "http://localhost:3000";

/// La ventana carga la app web desde `APP_URL` (o la URL por defecto).
/// No hay front propio ni comandos IPC: el shell solo envuelve la web.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let raw = std::env::var("APP_URL").unwrap_or_else(|_| DEFAULT_APP_URL.to_string());
            let url: Url = raw
                .parse()
                .map_err(|e| format!("APP_URL inválida ({raw}): {e}"))?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Portal de clientes")
                .inner_size(1200.0, 800.0)
                .min_inner_size(375.0, 600.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar la app de escritorio");
}
