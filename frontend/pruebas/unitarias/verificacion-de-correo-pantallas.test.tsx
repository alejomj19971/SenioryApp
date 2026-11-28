import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmarCorreo = vi.fn();
const reenviarVerificacionDeCorreo = vi.fn();
vi.mock("@/lib/acciones/cuenta", () => ({ confirmarCorreo, reenviarVerificacionDeCorreo }));

const { FormularioConfirmarCorreo } = await import("@/components/cuenta/formulario-confirmar-correo");
const { AvisoDeCorreoSinVerificar } = await import("@/components/cuenta/aviso-de-correo-sin-verificar");

beforeEach(() => {
  confirmarCorreo.mockReset();
  reenviarVerificacionDeCorreo.mockReset();
});

describe("FormularioConfirmarCorreo", () => {
  it("no confirma nada al abrirse: hace falta pulsar el botón (un antivirus que abre el enlace no lo gasta)", () => {
    render(<FormularioConfirmarCorreo token={"t".repeat(43)} />);

    expect(screen.getByRole("button", { name: "Confirmar mi correo" })).toBeInTheDocument();
    expect(confirmarCorreo).not.toHaveBeenCalled();
  });

  it("al pulsar, manda el token del enlace y muestra que quedó confirmado", async () => {
    confirmarCorreo.mockResolvedValue({ listo: true });
    const usuario = userEvent.setup();
    render(<FormularioConfirmarCorreo token={"t".repeat(43)} />);

    await usuario.click(screen.getByRole("button", { name: "Confirmar mi correo" }));

    expect(await screen.findByText("Tu correo quedó confirmado")).toBeInTheDocument();
    const datos = confirmarCorreo.mock.calls[0]?.[1] as FormData;
    expect(datos.get("token")).toBe("t".repeat(43));
    expect(screen.getByRole("link", { name: "Ir a mi cuenta" })).toHaveAttribute("href", "/app");
  });

  it("si el enlace ya no sirve, lo explica y ofrece ir a la cuenta a pedir otro", async () => {
    confirmarCorreo.mockResolvedValue({ mensaje: "Este enlace ya no es válido o venció." });
    const usuario = userEvent.setup();
    render(<FormularioConfirmarCorreo token={"t".repeat(43)} />);

    await usuario.click(screen.getByRole("button", { name: "Confirmar mi correo" }));

    expect(await screen.findByText(/ya no es válido o venció/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pedir un enlace nuevo/i })).toBeInTheDocument();
    expect(screen.queryByText("Tu correo quedó confirmado")).not.toBeInTheDocument();
  });
});

describe("AvisoDeCorreoSinVerificar", () => {
  it("explica que sin confirmar no hay avisos por correo y a qué dirección se envió el enlace", () => {
    render(<AvisoDeCorreoSinVerificar correo="andrea@ejemplo.co" />);

    expect(screen.getByRole("heading", { name: "Confirma tu correo" })).toBeInTheDocument();
    expect(screen.getByText("andrea@ejemplo.co")).toBeInTheDocument();
    expect(screen.getByText(/sin confirmarlo no podemos avisarte por correo/i)).toBeInTheDocument();
  });

  it("«Reenviar el enlace» pide otro y muestra lo que respondió el servidor", async () => {
    reenviarVerificacionDeCorreo.mockResolvedValue({ ok: true, mensaje: "Listo: te enviamos un enlace nuevo." });
    const usuario = userEvent.setup();
    render(<AvisoDeCorreoSinVerificar correo="andrea@ejemplo.co" />);

    await usuario.click(screen.getByRole("button", { name: "Reenviar el enlace" }));

    await waitFor(() => expect(reenviarVerificacionDeCorreo).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent("te enviamos un enlace nuevo");
  });

  it("si no se pudo enviar, el mensaje se anuncia como alerta", async () => {
    reenviarVerificacionDeCorreo.mockResolvedValue({ ok: false, mensaje: "No pudimos enviar el enlace." });
    const usuario = userEvent.setup();
    render(<AvisoDeCorreoSinVerificar correo="andrea@ejemplo.co" />);

    await usuario.click(screen.getByRole("button", { name: "Reenviar el enlace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos enviar el enlace.");
  });
});
