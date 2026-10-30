export interface WhatsappVerification {
  userId: string;
  codigo: string; // 6 dígitos
  expiresAt: string; // creación + 10 min
  intentos: number; // máx. 5; al llegar a 5 el código se invalida
  ultimoEnvio: string; // para el cooldown de reenvío de 60 s
}
