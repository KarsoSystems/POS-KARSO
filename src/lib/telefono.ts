/** "+525512345678" → "+52 55 1234 5678" (el WhatsApp guardado, para mostrarlo). */
export function formatearWhatsapp(whatsapp: string | null): string {
  const m = whatsapp?.match(/^\+52(\d{2})(\d{4})(\d{4})$/);
  return m ? `+52 ${m[1]} ${m[2]} ${m[3]}` : (whatsapp ?? "");
}
