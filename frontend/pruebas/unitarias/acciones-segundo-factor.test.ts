import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi } from "@/lib/api/error-de-api";

const exigirRol = vi.fn();
vi.mock("@/lib/sesion", () => ({ exigirRol, verificarSesion: vi.fn() }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const iniciarConfiguracionDeSegundoFactor = vi.fn();
const confirmarSegundoFactor = vi.fn();
const desactivarSegundoFactor = vi.fn();
vi.mock("@/lib/services/segundo-factor", () => ({
  iniciarConfiguracionDeSegundoFactor,
  confirmarSegundoFactor,
  desactivarSegundoFactor,
}));

const acciones = await import("@/lib/acciones/segundo-factor");

const formulario = (campos: Record<string, string>) => {
  const datos = new FormData();
  for (const [nombre, valor] of Object.entries(campos)) datos.set(nombre, valor);
  return datos;
};

const errorDeApi = (estado: number, codigo: string, mensaje: string) => new ErrorDeApi({ estado, codigo, mensaje });

beforeEach(() => {
  for (const doble of [exigirRol, revalidatePath, iniciarConfiguracionDeSegundoFactor, confirmarSegundoFactor, desactivarSegundoFactor]) {
    doble.mockReset();
  }
  exigirRol.mockResolvedValue({ usuario: { rol: "administrador" } });
});

describe("iniciarSegundoFactorAccion", () => {
  it("exige el rol de administrador antes de llamar al backend", async () => {
    exigirRol.mockRejectedValue(new Error("REDIRECT"));

    await expect(acciones.iniciarSegundoFactorAccion()).rejects.toThrow("REDIRECT");

    expect(iniciarConfiguracionDeSegundoFactor).not.toHaveBeenCalled();
  });

  it("devuelve la URI y el secreto cuando el backend los entrega", async () => {
    iniciarConfiguracionDeSegundoFactor.mockResolvedValue({
      ok: true,
      datos: { uriDeInscripcion: "otpauth://totp/Seniory:a@b.co", secretoManual: "ABCD1234" },
    });

    const estado = await acciones.iniciarSegundoFactorAccion();

    expect(estado).toEqual({
      uriDeInscripcion: "otpauth://totp/Seniory:a@b.co",
      secretoManual: "ABCD1234",
    });
  });

  it("si el backend falla, lo dice en `mensaje`", async () => {
    iniciarConfiguracionDeSegundoFactor.mockResolvedValue({ ok: false, error: errorDeApi(503, "x", "No disponible.") });

    const estado = await acciones.iniciarSegundoFactorAccion();

    expect(estado.mensaje).toBe("No disponible.");
    expect(estado.uriDeInscripcion).toBeUndefined();
  });
});

describe("confirmarSegundoFactorAccion", () => {
  it("pide el código sin ir al backend", async () => {
    const estado = await acciones.confirmarSegundoFactorAccion({}, formulario({ codigo: "" }));

    expect(confirmarSegundoFactor).not.toHaveBeenCalled();
    expect(estado.errores?.codigo).toBeDefined();
  });

  it("con un código correcto, confirma y refresca la pantalla", async () => {
    confirmarSegundoFactor.mockResolvedValue({ ok: true, datos: undefined });

    const estado = await acciones.confirmarSegundoFactorAccion({}, formulario({ codigo: "123456" }));

    expect(confirmarSegundoFactor).toHaveBeenCalledWith("123456");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/seguridad");
    expect(estado).toEqual({ listo: true });
  });

  it("un código incorrecto no refresca y muestra el error del backend", async () => {
    confirmarSegundoFactor.mockResolvedValue({ ok: false, error: errorDeApi(400, "segundo_factor.codigo_invalido", "El código no es correcto.") });

    const estado = await acciones.confirmarSegundoFactorAccion({}, formulario({ codigo: "000000" }));

    expect(revalidatePath).not.toHaveBeenCalled();
    expect(estado.mensaje).toBe("El código no es correcto.");
  });

  it("demasiados intentos (429)", async () => {
    confirmarSegundoFactor.mockResolvedValue({ ok: false, error: errorDeApi(429, "demasiadas_peticiones", "x") });

    const estado = await acciones.confirmarSegundoFactorAccion({}, formulario({ codigo: "123456" }));

    expect(estado.mensaje).toContain("demasiadas solicitudes");
  });
});

describe("desactivarSegundoFactorAccion", () => {
  it("desactiva y refresca la pantalla", async () => {
    desactivarSegundoFactor.mockResolvedValue({ ok: true, datos: undefined });

    await acciones.desactivarSegundoFactorAccion();

    expect(desactivarSegundoFactor).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/seguridad");
  });

  it("si el backend falla, lanza el error (lo atrapa el límite de error del panel)", async () => {
    const error = errorDeApi(500, "x", "Algo salió mal.");
    desactivarSegundoFactor.mockResolvedValue({ ok: false, error });

    await expect(acciones.desactivarSegundoFactorAccion()).rejects.toBe(error);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
