import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversacion, MensajeDeChat } from "@/lib/types";

const enviarMensajeAccion = vi.fn();
const cargarMensajesAccion = vi.fn();
const abrirConversacionAccion = vi.fn();
vi.mock("@/lib/acciones/mensajeria", () => ({ enviarMensajeAccion, cargarMensajesAccion, abrirConversacionAccion }));

// El navegador de las pruebas no trae EventSource: este controla lo que «llega por la red».
class FuenteFalsa {
  static ultima: FuenteFalsa | null = null;
  static readonly CLOSED = 2;
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  escuchas = new Map<string, (e: { data: string; lastEventId: string }) => void>();
  constructor(readonly url: string) {
    FuenteFalsa.ultima = this;
  }
  addEventListener(tipo: string, escucha: (e: { data: string; lastEventId: string }) => void) {
    this.escuchas.set(tipo, escucha);
  }
  close() {
    this.readyState = FuenteFalsa.CLOSED;
  }
  emitir(datos: object, id = "c1") {
    this.escuchas.get("mensaje")?.({ data: JSON.stringify(datos), lastEventId: id });
  }
}
vi.stubGlobal("EventSource", FuenteFalsa);
// jsdom no implementa el scroll.
Element.prototype.scrollIntoView = vi.fn();

const { Chat } = await import("@/components/mensajeria/chat");
const { ListaDeConversaciones } = await import("@/components/mensajeria/lista-de-conversaciones");
const { BotonEscribir } = await import("@/components/mensajeria/boton-escribir");

const CONVERSACION_ID = "01a19299-ec3b-7012-b94b-a8cebad258d3";
const conversacion = (extra: Partial<Conversacion> = {}): Conversacion => ({
  id: CONVERSACION_ID,
  otraParte: { nombre: "Marta Gómez", foto: "" },
  ultimoMensajeEn: null,
  puedeEscribir: true,
  ...extra,
});
const mensaje = (id: string, texto: string, extra: Partial<MensajeDeChat> = {}): MensajeDeChat => ({
  id,
  autor: "otro",
  texto,
  enviadoEn: "2026-11-01T15:00:00.000Z",
  estado: "enviado",
  ...extra,
});

beforeEach(() => {
  enviarMensajeAccion.mockReset();
  cargarMensajesAccion.mockReset();
  abrirConversacionAccion.mockReset();
  FuenteFalsa.ultima = null;
});

describe("Chat", () => {
  it("muestra los mensajes con la hora de Colombia y NO inventa «en línea» ni «escribiendo»", () => {
    render(<Chat conversacion={conversacion()} inicial={[mensaje("m1", "Buenos días")]} anteriores={null} base="/app" />);

    expect(screen.getByText("Buenos días")).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
    expect(screen.queryByText(/en línea|escribiendo/i)).not.toBeInTheDocument();
  });

  it("un mensaje que llega en vivo aparece, y si llega dos veces no se repite", async () => {
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);
    const nuevo = { id: "m2", conversacionId: CONVERSACION_ID, autor: "otro", texto: "Ya voy para allá", enviadoEn: "2026-11-01T15:05:00.000Z" };

    act(() => FuenteFalsa.ultima?.emitir(nuevo));
    act(() => FuenteFalsa.ultima?.emitir(nuevo));

    expect(await screen.findAllByText("Ya voy para allá")).toHaveLength(1);
  });

  it("ignora los mensajes de otras conversaciones", () => {
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);

    act(() => FuenteFalsa.ultima?.emitir({ id: "m9", conversacionId: "otra", autor: "otro", texto: "No es para ti", enviadoEn: "2026-11-01T15:05:00.000Z" }));

    expect(screen.queryByText("No es para ti")).not.toBeInTheDocument();
  });

  it("al enviar aparece de inmediato y, con la respuesta, queda una sola vez", async () => {
    let resolver: (valor: unknown) => void = () => undefined;
    enviarMensajeAccion.mockReturnValue(new Promise((r) => (resolver = r)));
    const usuario = userEvent.setup();
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);

    await usuario.type(screen.getByLabelText(/Mensaje para Marta Gómez/), "Hola Marta");
    await usuario.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(screen.getByText("Hola Marta")).toBeInTheDocument();
    expect(screen.getByText("Enviando…")).toBeInTheDocument();
    const [, , idDeCliente] = enviarMensajeAccion.mock.calls[0] as [string, string, string];
    expect(enviarMensajeAccion).toHaveBeenCalledWith(CONVERSACION_ID, "Hola Marta", idDeCliente);

    await act(async () => resolver({ ok: true, mensaje: mensaje("m1", "Hola Marta", { autor: "yo", idDeCliente }) }));

    expect(screen.getAllByText("Hola Marta")).toHaveLength(1);
    expect(screen.queryByText("Enviando…")).not.toBeInTheDocument();
  });

  it("si el flujo trae el mismo mensaje antes que la respuesta, tampoco se duplica", async () => {
    let resolver: (valor: unknown) => void = () => undefined;
    enviarMensajeAccion.mockReturnValue(new Promise((r) => (resolver = r)));
    const usuario = userEvent.setup();
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);
    await usuario.type(screen.getByLabelText(/Mensaje para/), "Una vez");
    await usuario.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    const [, , idDeCliente] = enviarMensajeAccion.mock.calls[0] as [string, string, string];
    const delServidor = { id: "m1", conversacionId: CONVERSACION_ID, autor: "yo", texto: "Una vez", enviadoEn: "2026-11-01T15:00:00.000Z", idDeCliente };

    act(() => FuenteFalsa.ultima?.emitir(delServidor));
    await act(async () => resolver({ ok: true, mensaje: mensaje("m1", "Una vez", { autor: "yo", idDeCliente }) }));

    expect(screen.getAllByText("Una vez")).toHaveLength(1);
  });

  it("si no se pudo enviar, lo dice y se reintenta con el MISMO idDeCliente", async () => {
    enviarMensajeAccion.mockResolvedValueOnce({ ok: false, mensaje: "No pudimos conectar con el servicio." });
    const usuario = userEvent.setup();
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);
    await usuario.type(screen.getByLabelText(/Mensaje para/), "Reintento");
    await usuario.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText("No se envió")).toBeInTheDocument();
    expect(screen.getByText("No pudimos conectar con el servicio.")).toBeInTheDocument();
    const [, , primero] = enviarMensajeAccion.mock.calls[0] as [string, string, string];

    enviarMensajeAccion.mockResolvedValueOnce({ ok: true, mensaje: mensaje("m1", "Reintento", { autor: "yo", idDeCliente: primero }) });
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(screen.queryByText("No se envió")).not.toBeInTheDocument());
    expect(enviarMensajeAccion.mock.calls[1]?.[2]).toBe(primero);
    expect(screen.getAllByText("Reintento")).toHaveLength(1);
  });

  it("descartar un mensaje que no se envió lo quita", async () => {
    enviarMensajeAccion.mockResolvedValue({ ok: false, mensaje: "Falló." });
    const usuario = userEvent.setup();
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);
    await usuario.type(screen.getByLabelText(/Mensaje para/), "Borrar");
    await usuario.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    await usuario.click(await screen.findByRole("button", { name: "Descartar" }));

    expect(screen.queryByText("Borrar")).not.toBeInTheDocument();
  });

  it("no deja enviar vacío ni pasar de 1000 caracteres, y avisa al acercarse", async () => {
    const usuario = userEvent.setup();
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);
    const enviar = screen.getByRole("button", { name: "Enviar mensaje" });
    const campo = screen.getByLabelText(/Mensaje para/);

    expect(enviar).toBeDisabled();
    await usuario.type(campo, "   ");
    expect(enviar).toBeDisabled();
    await usuario.clear(campo);
    await usuario.click(campo);
    await usuario.paste("x".repeat(950));
    expect(screen.getByText("950/1000 caracteres")).toBeInTheDocument();
    expect(enviar).toBeEnabled();
    await usuario.paste("x".repeat(60));
    expect(screen.getByText("1010/1000 caracteres")).toBeInTheDocument();
    expect(enviar).toBeDisabled();
  });

  it("sin servicio vivo: se puede leer pero no hay dónde escribir", () => {
    render(<Chat conversacion={conversacion({ puedeEscribir: false })} inicial={[mensaje("m1", "Gracias por todo")]} anteriores={null} base="/app" />);

    expect(screen.getByText("Gracias por todo")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mensaje para/)).not.toBeInTheDocument();
    expect(screen.getByText(/ya no se puede escribir/i)).toBeInTheDocument();
  });

  it("si el servicio termina mientras se escribe, pasa a solo lectura", async () => {
    enviarMensajeAccion.mockResolvedValue({ ok: false, mensaje: "Ya no se puede escribir: el servicio terminó." });
    const usuario = userEvent.setup();
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);
    await usuario.type(screen.getByLabelText(/Mensaje para/), "Tarde");
    await usuario.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(await screen.findByText(/ya no se puede escribir en esta conversación/i)).toBeInTheDocument();
  });

  it("«Ver mensajes anteriores» los trae y los pone antes, hasta que no haya más", async () => {
    cargarMensajesAccion.mockResolvedValue({
      ok: true,
      pagina: { mensajes: [mensaje("m0", "Muy antiguo", { enviadoEn: "2026-10-30T15:00:00.000Z" })], anteriores: null },
    });
    const usuario = userEvent.setup();
    render(<Chat conversacion={conversacion()} inicial={[mensaje("m1", "Reciente")]} anteriores="cursor_1" base="/app" />);

    await usuario.click(screen.getByRole("button", { name: "Ver mensajes anteriores" }));

    expect(await screen.findByText("Muy antiguo")).toBeInTheDocument();
    expect(cargarMensajesAccion).toHaveBeenCalledWith(CONVERSACION_ID, "cursor_1");
    const textos = screen.getAllByText(/Muy antiguo|Reciente/).map((e) => e.textContent);
    expect(textos).toEqual(["Muy antiguo", "Reciente"]);
    expect(screen.queryByRole("button", { name: "Ver mensajes anteriores" })).not.toBeInTheDocument();
  });

  it("si la conexión en vivo se pierde lo dice, y vuelve a decir nada al reconectar", () => {
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);

    act(() => FuenteFalsa.ultima?.onerror?.());
    expect(screen.getByRole("status")).toHaveTextContent("Reconectando…");

    act(() => FuenteFalsa.ultima?.onopen?.());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("vuelve a la lista de la persona que lo abrió", () => {
    const { unmount } = render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/app" />);
    expect(screen.getByRole("link", { name: /Mensajes/ })).toHaveAttribute("href", "/app/mensajes");
    unmount();
    render(<Chat conversacion={conversacion()} inicial={[]} anteriores={null} base="/cuidador" />);
    expect(screen.getByRole("link", { name: /Mensajes/ })).toHaveAttribute("href", "/cuidador/mensajes");
  });
});

describe("ListaDeConversaciones", () => {
  it("sin conversaciones explica cómo empezar, distinto para cada rol", () => {
    const { unmount } = render(<ListaDeConversaciones conversaciones={[]} base="/app" />);
    expect(screen.getByText(/desde el detalle del servicio/)).toBeInTheDocument();
    unmount();
    render(<ListaDeConversaciones conversaciones={[]} base="/cuidador" />);
    expect(screen.getByText(/Cuando una familia te escriba/)).toBeInTheDocument();
  });

  it("cada conversación lleva a su chat y marca las de solo lectura", () => {
    render(
      <ListaDeConversaciones
        base="/cuidador"
        conversaciones={[conversacion({ ultimoMensajeEn: "2026-11-01T15:00:00.000Z" }), conversacion({ id: "c2", puedeEscribir: false, otraParte: { nombre: "Luis Pérez", foto: "" } })]}
      />,
    );

    expect(screen.getByRole("link", { name: /Marta Gómez/ })).toHaveAttribute("href", `/cuidador/mensajes/${CONVERSACION_ID}`);
    expect(screen.getByRole("link", { name: /Luis Pérez/ })).toHaveTextContent("Solo lectura");
    expect(screen.getByRole("link", { name: /Luis Pérez/ })).toHaveTextContent("Sin mensajes todavía");
  });
});

describe("BotonEscribir", () => {
  it("usa el primer nombre y muestra por qué no se pudo abrir", async () => {
    abrirConversacionAccion.mockResolvedValue({ mensaje: "Solo puedes escribirle mientras tengas un servicio pedido con esa persona." });
    const usuario = userEvent.setup();
    render(<BotonEscribir cuidadorId={CONVERSACION_ID} nombre="Marta Gómez" />);

    await usuario.click(screen.getByRole("button", { name: "Escribir a Marta" }));

    expect(await screen.findByText(/servicio pedido con esa persona/)).toBeInTheDocument();
    expect(abrirConversacionAccion).toHaveBeenCalled();
  });
});
