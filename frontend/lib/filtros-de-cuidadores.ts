import type { Especialidad, FiltrosCuidador, Jornada } from "@/lib/types";

// Los filtros de la búsqueda de cuidadores viven en la URL (`/app/cuidadores?especialidad=enfermeria&zona=Laureles`):
// así se pueden compartir, el botón «atrás» funciona y el servidor busca con ellos. Sin `server-only`: los usan la
// página (servidor) y el buscador (cliente). Todo lo que llega de la URL o de una acción es entrada de cualquiera:
// se limpia aquí, y el backend vuelve a validarlo.

export const ESPECIALIDADES: readonly Especialidad[] = ["auxiliar", "enfermeria", "fisioterapia", "acompanamiento"];
export const JORNADAS: readonly Jornada[] = ["manana", "tarde", "noche"];

const LARGO_MAXIMO_DE_TEXTO = 200;
const TARIFA_MAXIMA_ADMITIDA = 10_000_000;

type Consulta = Record<string, string | string[] | undefined>;

function unico(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return typeof texto === "string" ? texto : undefined;
}

function textoLimpio(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpio = valor.trim();
  return limpio === "" || limpio.length > LARGO_MAXIMO_DE_TEXTO ? undefined : limpio;
}

// Deja solo filtros válidos; lo que no lo sea se descarta en silencio (una URL vieja o a mano no debe romper la página).
export function sanearFiltros(entrada: unknown): FiltrosCuidador {
  if (typeof entrada !== "object" || entrada === null) return {};
  const bruto = entrada as Record<string, unknown>;
  const filtros: FiltrosCuidador = {};

  const busqueda = textoLimpio(bruto.busqueda);
  if (busqueda !== undefined) filtros.busqueda = busqueda;

  const zona = textoLimpio(bruto.zona);
  if (zona !== undefined) filtros.zona = zona;

  if (typeof bruto.especialidad === "string" && (ESPECIALIDADES as readonly string[]).includes(bruto.especialidad)) {
    filtros.especialidad = bruto.especialidad as Especialidad;
  }
  if (typeof bruto.jornada === "string" && (JORNADAS as readonly string[]).includes(bruto.jornada)) {
    filtros.jornada = bruto.jornada as Jornada;
  }

  const tarifa = typeof bruto.tarifaMaxima === "string" ? Number(bruto.tarifaMaxima) : bruto.tarifaMaxima;
  if (typeof tarifa === "number" && Number.isInteger(tarifa) && tarifa > 0 && tarifa <= TARIFA_MAXIMA_ADMITIDA) {
    filtros.tarifaMaxima = tarifa;
  }
  return filtros;
}

export function filtrosDeConsulta(consulta: Consulta): FiltrosCuidador {
  return sanearFiltros({
    busqueda: unico(consulta.busqueda),
    especialidad: unico(consulta.especialidad),
    zona: unico(consulta.zona),
    jornada: unico(consulta.jornada),
    tarifaMaxima: unico(consulta.tarifaMaxima),
  });
}

// La parte de la URL después de «?» (vacía si no hay filtros). Siempre en el mismo orden.
export function consultaDeFiltros(filtros: FiltrosCuidador): string {
  const consulta = new URLSearchParams();
  for (const campo of ["busqueda", "especialidad", "zona", "jornada", "tarifaMaxima"] as const) {
    const valor = filtros[campo];
    if (valor !== undefined) consulta.set(campo, String(valor));
  }
  return consulta.toString();
}
