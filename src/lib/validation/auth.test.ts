import { describe, expect, it } from "vitest";
import {
  completarPerfilSchema,
  correoSchema,
  googleMockSchema,
  loginSchema,
  nombreSchema,
  passwordSchema,
  registroSchema,
  verificarWhatsappSchema,
  whatsappSchema,
} from "./auth";

const primerError = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues[0]?.message;

const registroValido = {
  nombre: "Ana",
  apellidoPaterno: "López",
  apellidoMaterno: "García",
  whatsapp: "5512345678",
  correo: "ana@ejemplo.com",
  password: "secreto123",
};

describe("nombre y apellidos", () => {
  it("recorta espacios", () => {
    expect(nombreSchema.parse("  Ana  ")).toBe("Ana");
  });

  it("es obligatorio (vacío o solo espacios)", () => {
    expect(primerError(nombreSchema.safeParse(""))).toBe("El nombre es obligatorio");
    expect(primerError(nombreSchema.safeParse("   "))).toBe("El nombre es obligatorio");
  });

  it("acepta 60 caracteres y rechaza 61", () => {
    expect(nombreSchema.safeParse("a".repeat(60)).success).toBe(true);
    expect(nombreSchema.safeParse("a".repeat(61)).success).toBe(false);
  });
});

describe("whatsapp", () => {
  it("guarda 10 dígitos como +52XXXXXXXXXX", () => {
    expect(whatsappSchema.parse("5512345678")).toBe("+525512345678");
  });

  it("acepta espacios, guiones, paréntesis y el prefijo +52", () => {
    expect(whatsappSchema.parse("(55) 1234-5678")).toBe("+525512345678");
    expect(whatsappSchema.parse("+52 55 1234 5678")).toBe("+525512345678");
  });

  it("rechaza menos o más de 10 dígitos", () => {
    expect(primerError(whatsappSchema.safeParse("551234567"))).toBe("El WhatsApp debe tener 10 dígitos");
    expect(primerError(whatsappSchema.safeParse("55123456789"))).toBe("El WhatsApp debe tener 10 dígitos");
  });

  it("rechaza letras", () => {
    expect(whatsappSchema.safeParse("55abc45678").success).toBe(false);
  });

  it("es obligatorio", () => {
    expect(primerError(whatsappSchema.safeParse(""))).toBe("El WhatsApp es obligatorio");
  });
});

describe("correo", () => {
  it("se normaliza a minúsculas y sin espacios", () => {
    expect(correoSchema.parse("  Ana@Ejemplo.COM ")).toBe("ana@ejemplo.com");
  });

  it("rechaza formatos inválidos", () => {
    expect(primerError(correoSchema.safeParse("ana@"))).toBe("Ingresa un correo válido");
  });

  it("es obligatorio", () => {
    expect(primerError(correoSchema.safeParse(""))).toBe("El correo es obligatorio");
  });
});

describe("password", () => {
  it("acepta 8+ caracteres con letra y número", () => {
    expect(passwordSchema.safeParse("abcdefg1").success).toBe(true);
  });

  it("rechaza menos de 8 caracteres", () => {
    expect(primerError(passwordSchema.safeParse("abc1"))).toBe(
      "La contraseña debe tener al menos 8 caracteres",
    );
  });

  it("exige al menos un número", () => {
    expect(primerError(passwordSchema.safeParse("abcdefgh"))).toBe(
      "La contraseña debe incluir al menos un número",
    );
  });

  it("exige al menos una letra", () => {
    expect(primerError(passwordSchema.safeParse("12345678"))).toBe(
      "La contraseña debe incluir al menos una letra",
    );
  });
});

describe("registroSchema", () => {
  it("normaliza un registro válido", () => {
    expect(registroSchema.parse({ ...registroValido, correo: "ANA@ejemplo.com" })).toEqual({
      ...registroValido,
      whatsapp: "+525512345678",
      correo: "ana@ejemplo.com",
    });
  });

  it("todos los campos son obligatorios", () => {
    for (const campo of Object.keys(registroValido)) {
      const datos = { ...registroValido, [campo]: "" };
      expect(registroSchema.safeParse(datos).success, campo).toBe(false);
    }
  });
});

describe("loginSchema", () => {
  it("no aplica reglas de fuerza a la contraseña", () => {
    expect(loginSchema.safeParse({ correo: "ana@ejemplo.com", password: "x" }).success).toBe(true);
  });

  it("exige contraseña", () => {
    expect(primerError(loginSchema.safeParse({ correo: "ana@ejemplo.com", password: "" }))).toBe(
      "La contraseña es obligatoria",
    );
  });
});

describe("googleMockSchema", () => {
  it("pide nombre y correo", () => {
    expect(googleMockSchema.parse({ nombre: "Ana", correo: "Ana@Gmail.com" })).toEqual({
      nombre: "Ana",
      correo: "ana@gmail.com",
    });
    expect(googleMockSchema.safeParse({ nombre: "", correo: "ana@gmail.com" }).success).toBe(false);
  });
});

describe("completarPerfilSchema", () => {
  it("exige apellidos y WhatsApp", () => {
    const { nombre, apellidoPaterno, apellidoMaterno, whatsapp } = registroValido;
    expect(
      completarPerfilSchema.parse({ nombre, apellidoPaterno, apellidoMaterno, whatsapp }).whatsapp,
    ).toBe("+525512345678");
    expect(
      completarPerfilSchema.safeParse({ nombre, apellidoPaterno: "", apellidoMaterno, whatsapp }).success,
    ).toBe(false);
  });
});

describe("verificarWhatsappSchema", () => {
  it("acepta exactamente 6 dígitos", () => {
    expect(verificarWhatsappSchema.safeParse({ codigo: "123456" }).success).toBe(true);
    expect(verificarWhatsappSchema.safeParse({ codigo: "12345" }).success).toBe(false);
    expect(verificarWhatsappSchema.safeParse({ codigo: "12345a" }).success).toBe(false);
  });
});
