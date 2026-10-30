// El código de verificación simulado viaja del registro a /registro/verificar
// en sessionStorage. Si el almacenamiento no está disponible, el aviso de demo
// simplemente no muestra el código (sigue estando en la consola del servidor).

const KEY = "demo:codigo-whatsapp";

export function guardarDemoCodigo(codigo: string | undefined): void {
  try {
    if (codigo) sessionStorage.setItem(KEY, codigo);
    else sessionStorage.removeItem(KEY);
  } catch {
    // sin almacenamiento: se ignora
  }
}

export function leerDemoCodigo(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
