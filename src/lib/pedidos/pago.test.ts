import { describe, expect, it } from "vitest";
import { ZONA_HORARIA_TIENDA } from "@/lib/configuracion/schema";
import { anioEn, formatFolio, resumenPagos, venceElPago, vencimientoPago } from "./pago";

describe("formatFolio", () => {
  it("KAR-AAAA-NNNNNN con 6 dígitos", () => {
    expect(formatFolio(2026, 1)).toBe("KAR-2026-000001");
    expect(formatFolio(2026, 1001)).toBe("KAR-2026-001001");
    expect(formatFolio(2027, 123456)).toBe("KAR-2027-123456");
  });
});

describe("anioEn", () => {
  it("en el cambio de año manda la hora de la Ciudad de México, no la UTC", () => {
    expect(anioEn(new Date("2026-12-31T23:30:00-06:00"), ZONA_HORARIA_TIENDA)).toBe(2026);
    expect(anioEn(new Date("2027-01-01T05:30:00Z"), ZONA_HORARIA_TIENDA)).toBe(2026); // 23:30 del 31 en CDMX
    expect(anioEn(new Date("2027-01-01T06:30:00Z"), ZONA_HORARIA_TIENDA)).toBe(2027);
  });
});

describe("vencimientoPago y venceElPago", () => {
  const confirmadoAt = "2026-11-07T19:38:00.000Z";
  const pendiente = { estatus: "pago_pendiente", vencimientoPago: vencimientoPago(confirmadoAt, 24) };

  it("24 h después de confirmar", () => {
    expect(pendiente.vencimientoPago).toBe("2026-11-08T19:38:00.000Z");
    expect(vencimientoPago(confirmadoAt, 1)).toBe("2026-11-07T20:38:00.000Z");
  });

  it("vence justo a la hora límite; un minuto antes todavía no", () => {
    expect(venceElPago(pendiente, new Date("2026-11-08T19:37:00.000Z"))).toBe(false);
    expect(venceElPago(pendiente, new Date("2026-11-08T19:38:00.000Z"))).toBe(true);
  });

  it("solo en pago_pendiente", () => {
    const tarde = new Date("2026-12-01T00:00:00.000Z");
    for (const estatus of ["enviado", "cancelado", "borrador"]) {
      expect(venceElPago({ ...pendiente, estatus }, tarde)).toBe(false);
    }
    expect(venceElPago({ estatus: "pago_pendiente", vencimientoPago: null }, tarde)).toBe(false);
  });
});

describe("resumenPagos", () => {
  it("solo cuentan los pagos aprobados", () => {
    expect(resumenPagos([], 323.64)).toEqual({ pagado: 0, saldo: 323.64 });
    expect(
      resumenPagos(
        [
          { monto: 323.64, estatus: "rechazado" },
          { monto: 323.64, estatus: "pendiente" },
          { monto: 323.64, estatus: "aprobado" },
        ],
        323.64,
      ),
    ).toEqual({ pagado: 323.64, saldo: 0 });
  });

  it("suma en centavos: 0.1 + 0.2 no deja saldo de 0.0000001", () => {
    const pagos = [
      { monto: 0.1, estatus: "aprobado" as const },
      { monto: 0.2, estatus: "aprobado" as const },
    ];
    expect(resumenPagos(pagos, 0.3)).toEqual({ pagado: 0.3, saldo: 0 });
  });
});
