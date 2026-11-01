import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LecturaSignos, TomaDelDia } from "@/lib/types";

const refresh = vi.fn();
const replace = vi.fn();
let consulta = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  useSearchParams: () => consulta,
}));

const marcarTomaAccion = vi.fn();
const enviarAlertaAccion = vi.fn();
vi.mock("@/lib/acciones/teleasistencia", () => ({
  marcarTomaAccion,
  enviarAlertaAccion,
  registrarLecturaAccion: vi.fn(),
  registrarMedicamentoAccion: vi.fn(),
  desactivarMedicamentoAccion: vi.fn(),
}));
vi.mock("@/lib/hooks/use-alarma-sonido", () => ({ useAlarmaSonido: vi.fn() }));
// Las gráficas no se dibujan en jsdom (sin tamaño): se sustituyen por un marcador.
vi.mock("recharts", () => ({
  Line: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="grafica">{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const { ListaMedicamentos } = await import("@/components/teleasistencia/lista-medicamentos");
const { BotonAlerta } = await import("@/components/teleasistencia/boton-alerta");
const { GraficaSignos } = await import("@/components/teleasistencia/grafica-signos");

const UUID_A = "01a19299-ec3b-7012-b94b-a8cebad258d4";
const toma = (extra: Partial<TomaDelDia> = {}): TomaDelDia => ({
  tomaId: UUID_A,
  medicamentoId: "m1",
  nombre: "Losartán",
  dosis: "50 mg",
  indicaciones: "",
  hora: "23:59",
  estado: "pendiente",
  ...extra,
});

beforeEach(() => {
  refresh.mockClear();
  replace.mockClear();
  marcarTomaAccion.mockReset();
  enviarAlertaAccion.mockReset();
  consulta = new URLSearchParams();
});

describe("ListaMedicamentos", () => {
  it("sin tomas hoy, lo dice y lleva a agregar un medicamento", () => {
    render(<ListaMedicamentos tomas={[]} />);

    expect(screen.getByText("Todavía no hay medicamentos para hoy.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agregar un medicamento" })).toHaveAttribute("href", "/app/teleasistencia/medicamentos");
  });

  it("marca una toma: responde de inmediato (mientras el servidor guarda) y manda el cambio con los ids reales", async () => {
    // El servidor «tarda»: la pantalla ya muestra la toma como tomada sin esperarlo (optimista).
    let terminar: (valor: { ok: true }) => void = () => undefined;
    marcarTomaAccion.mockImplementation(() => new Promise((resolver) => (terminar = resolver)));
    render(<ListaMedicamentos tomas={[toma({ hora: "08:00" }), toma({ tomaId: "t2", hora: "20:00" })]} />);
    expect(screen.getByText("0 de 2 tomadas hoy")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Marcar Losartán de las 20:00 como tomado/ }));

    expect(marcarTomaAccion).toHaveBeenCalledWith("m1", "t2", "tomada");
    expect(await screen.findByRole("button", { name: /Deshacer: Losartán de las 20:00/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 de 2 tomadas hoy")).toBeInTheDocument();
    terminar({ ok: true });
  });

  it("si el servidor no acepta el cambio (otra pantalla ya lo cambió), vuelve a como estaba, lo dice y se actualiza", async () => {
    marcarTomaAccion.mockResolvedValue({ ok: false, mensaje: "Esa toma ya cambió en otra pantalla." });
    render(<ListaMedicamentos tomas={[toma()]} />);

    await userEvent.click(screen.getByRole("button", { name: /Marcar Losartán/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa toma ya cambió en otra pantalla.");
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Marcar Losartán/ })).toHaveAttribute("aria-pressed", "false"));
  });

  it("deshacer una toma marcada manda «pendiente»", async () => {
    marcarTomaAccion.mockResolvedValue({ ok: true });
    render(<ListaMedicamentos tomas={[toma({ estado: "tomada" })]} />);

    await userEvent.click(screen.getByRole("button", { name: /Deshacer: Losartán/ }));

    expect(marcarTomaAccion).toHaveBeenCalledWith("m1", UUID_A, "pendiente");
  });

  it("una toma omitida se dice omitida y se puede registrar como tomada", async () => {
    marcarTomaAccion.mockResolvedValue({ ok: true });
    render(<ListaMedicamentos tomas={[toma({ estado: "omitida", hora: "08:00" })]} />);

    expect(screen.getByText(/Omitida/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Marcar Losartán/ }));
    expect(marcarTomaAccion).toHaveBeenCalledWith("m1", UUID_A, "tomada");
  });

  it("una toma pendiente cuya hora ya llegó se avisa como «hora del medicamento»", async () => {
    render(<ListaMedicamentos tomas={[toma({ hora: "00:00" })]} />);

    expect(await screen.findByText("¡Hora del medicamento!")).toBeInTheDocument();
  });

  it("una toma futura no dispara la alarma", async () => {
    render(<ListaMedicamentos tomas={[toma({ hora: "23:59" })]} />);

    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(screen.queryByText("¡Hora del medicamento!")).not.toBeInTheDocument();
  });
});

describe("BotonAlerta (pedir ayuda, H7)", () => {
  const abrir = () => render(<BotonAlerta nombreDeLaPersona="Doña Carmen" />);

  it("el botón no promete una «línea de emergencia»: avisa a la familia y al cuidador y ofrece llamar al 123", () => {
    abrir();

    expect(screen.getByRole("button", { name: "Pedir ayuda ahora" })).toBeInTheDocument();
    expect(screen.getByText(/Seniory no es un servicio de emergencias/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "123" })).toHaveAttribute("href", "tel:123");
    expect(document.body.textContent).not.toMatch(/línea de emergencia/i);
  });

  it("la cuenta regresiva se puede cancelar sin avisar a nadie", async () => {
    abrir();

    await userEvent.click(screen.getByRole("button", { name: "Pedir ayuda ahora" }));
    expect(await screen.findByText(/Pidiendo ayuda en/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText(/Pidiendo ayuda en/)).not.toBeInTheDocument();
    expect(enviarAlertaAccion).not.toHaveBeenCalled();
  });

  it("al terminar la cuenta envía la alerta y dice A QUIÉN se avisó, con el 123", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      enviarAlertaAccion.mockResolvedValue({ ok: true, alerta: { id: "al1", generadaEn: "x", avisadosA: ["Andrea", "Marta Elena"] } });
      abrir();

      await userEvent.click(screen.getByRole("button", { name: "Pedir ayuda ahora" }));
      await vi.advanceTimersByTimeAsync(5_200);

      expect(await screen.findByText("Alerta enviada")).toBeInTheDocument();
      expect(screen.getByText("Avisamos a Andrea y Marta Elena.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Llamar al 123/ })).toHaveAttribute("href", "tel:123");
      expect(enviarAlertaAccion).toHaveBeenCalledTimes(1);
      expect(enviarAlertaAccion.mock.calls[0]?.[0]).toBe("boton");
      expect(String(enviarAlertaAccion.mock.calls[0]?.[1])).toHaveLength(36);
    } finally {
      vi.useRealTimers();
    }
  });

  it("si no había a quién avisar, no finge: lo dice", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      enviarAlertaAccion.mockResolvedValue({ ok: true, alerta: { id: "al1", generadaEn: "x", avisadosA: [] } });
      abrir();

      await userEvent.click(screen.getByRole("button", { name: "Pedir ayuda ahora" }));
      await vi.advanceTimersByTimeAsync(5_200);

      expect(await screen.findByText(/no había a quién avisar en Seniory/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("si falla, dice que NO se avisó a nadie y reintentar usa la MISMA clave (no avisa dos veces)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      enviarAlertaAccion.mockResolvedValueOnce({ ok: false, mensaje: "No pudimos conectar con el servicio." });
      enviarAlertaAccion.mockResolvedValueOnce({ ok: true, alerta: { id: "al1", generadaEn: "x", avisadosA: ["Andrea"] } });
      abrir();

      await userEvent.click(screen.getByRole("button", { name: "Pedir ayuda ahora" }));
      await vi.advanceTimersByTimeAsync(5_200);
      expect(await screen.findByText("No pudimos enviar la alerta")).toBeInTheDocument();
      expect(screen.getByText(/No se avisó a nadie/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Llamar al 123/ })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      expect(await screen.findByText("Alerta enviada")).toBeInTheDocument();
      expect(enviarAlertaAccion.mock.calls[0]?.[1]).toBe(enviarAlertaAccion.mock.calls[1]?.[1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("el comando de voz abre la cuenta regresiva y el origen es «voz»", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      consulta = new URLSearchParams("alerta=1");
      enviarAlertaAccion.mockResolvedValue({ ok: true, alerta: { id: "al1", generadaEn: "x", avisadosA: ["Andrea"] } });
      abrir();

      expect(await screen.findByText(/Pidiendo ayuda en/)).toBeInTheDocument();
      expect(replace).toHaveBeenCalledWith("/app/teleasistencia");
      await vi.advanceTimersByTimeAsync(5_200);
      await screen.findByText("Alerta enviada");
      expect(enviarAlertaAccion.mock.calls[0]?.[0]).toBe("voz");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GraficaSignos", () => {
  const lectura = (extra: Partial<LecturaSignos> = {}): LecturaSignos => ({
    id: "l1", fecha: "2026-11-01T15:00:00.000Z", presionSistolica: 123, presionDiastolica: 77, frecuenciaCardiaca: 71, glucosa: 95, fueraDeRango: false, ...extra,
  });

  it("sin lecturas, lo dice (no es un error)", () => {
    render(<GraficaSignos lecturas={[]} />);

    expect(screen.getByText(/Todavía no hay lecturas/)).toBeInTheDocument();
  });

  it("muestra la última medida de cada tipo, aunque la lectura más reciente solo traiga una", () => {
    render(<GraficaSignos lecturas={[lectura(), lectura({ id: "l2", fecha: "2026-11-02T15:00:00.000Z", presionSistolica: null, presionDiastolica: null, frecuenciaCardiaca: null, glucosa: 110 })]} />);

    expect(screen.getByText("123/77")).toBeInTheDocument();
    expect(screen.getByText("71 lpm")).toBeInTheDocument();
    expect(screen.getByText("110 mg/dL")).toBeInTheDocument();
  });

  it("una medida que nunca se tomó se muestra como «—», no como 0", () => {
    render(<GraficaSignos lecturas={[lectura({ glucosa: null })]} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0 mg/dL")).not.toBeInTheDocument();
  });

  it("una última lectura fuera de rango se avisa con palabras y sin interpretar nada clínico", () => {
    render(<GraficaSignos lecturas={[lectura({ fueraDeRango: true })]} />);

    expect(screen.getByRole("note")).toHaveTextContent("fuera del rango esperado");
    expect(screen.getByRole("note")).toHaveTextContent("Consulta con su médico");
  });
});
