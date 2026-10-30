// Sustituto mínimo del cookie store de next/headers para tests de route handlers.
// Uso: vi.mock("next/headers", () => import("@/test/next-headers-mock"));

export const jar = new Map<string, { value: string; options: Record<string, unknown> }>();

export async function cookies() {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) =>
      jar.set(name, { value, options }),
  };
}
