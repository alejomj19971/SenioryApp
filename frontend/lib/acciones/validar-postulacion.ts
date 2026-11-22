import { normalizarTelefono, soloErrores } from "@/lib/acciones/validar-cuenta";
import type { Especialidad, RangoLibre } from "@/lib/types";

// Validaciones del perfil del cuidador (F9). Replican las reglas del dominio de Directorio para responder rápido; el
// backend tiene siempre la última palabra. Sin `server-only`: las usan las acciones, el formulario y las pruebas.

export const LARGO_MAXIMO_DE_TITULO = 150;
export const LARGO_MAXIMO_DE_ZONA = 100;
export const LARGO_MAXIMO_DE_BIO = 1000;
export const ANIOS_MAXIMOS_DE_EXPERIENCIA = 60;
export const TARIFA_MAXIMA = 10_000_000;

export const ESPECIALIDADES: { valor: Especialidad; etiqueta: string }[] = [
  { valor: "auxiliar", etiqueta: "Auxiliar de enfermería" },
  { valor: "enfermeria", etiqueta: "Enfermería profesional" },
  { valor: "fisioterapia", etiqueta: "Fisioterapia" },
  { valor: "acompanamiento", etiqueta: "Acompañamiento" },
];
export const NOMBRE_DEL_DIA: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

const FORMATO_DE_TELEFONO = /^\+[1-9]\d{7,14}$/;
const FORMATO_DE_ENTERO = /^\d{1,9}$/;
const PASO_DE_MINUTOS = 30;
const MINUTOS_POR_DIA = 1_440;

export interface DatosDePerfil {
  especialidad: Especialidad;
  titulo: string;
  aniosExperiencia: number;
  tarifaHora: number;
  telefono: string;
  zona: string;
  horariosLibres: RangoLibre[];
  bio: string;
}

export interface EntradaDePerfil {
  especialidad: string;
  titulo: string;
  aniosExperiencia: string;
  tarifaHora: string;
  telefono: string;
  zona: string;
  // JSON de un RangoLibre[] (lo arma `EditorDeHorario` en un campo oculto).
  horariosLibres: string;
  bio: string;
}

function esRangoLibreValido(valor: unknown): valor is RangoLibre {
  if (typeof valor !== "object" || valor === null) return false;
  const r = valor as RangoLibre;
  return (
    Number.isInteger(r.diaSemana) &&
    r.diaSemana >= 1 &&
    r.diaSemana <= 7 &&
    Number.isInteger(r.horaInicio) &&
    r.horaInicio >= 0 &&
    r.horaInicio % PASO_DE_MINUTOS === 0 &&
    Number.isInteger(r.horaFin) &&
    r.horaFin % PASO_DE_MINUTOS === 0 &&
    r.horaFin <= MINUTOS_POR_DIA &&
    r.horaInicio < r.horaFin
  );
}

// Null si el texto no es un JSON de rangos de horario válidos (cualquier manipulación del campo oculto).
export function horariosLibresDeTexto(texto: string): RangoLibre[] | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!Array.isArray(crudo) || !crudo.every(esRangoLibreValido)) return null;
  return crudo;
}

export type ResultadoDeValidacion<T> = { datos: T; valores: Record<string, string> } | { errores: Record<string, string>; valores: Record<string, string> };

const cuentaCaracteres = (texto: string) => [...texto].length;

// `congelado`: un perfil ya activo no puede cambiar la especialidad ni el título (respaldan un título aprobado); esos
// campos no vienen del formulario y no se envían.
export function validarPerfil(entrada: EntradaDePerfil, { congelado = false }: { congelado?: boolean } = {}): ResultadoDeValidacion<Partial<DatosDePerfil>> {
  const titulo = entrada.titulo.trim();
  const zona = entrada.zona.trim();
  const bio = entrada.bio.trim();
  const telefono = normalizarTelefono(entrada.telefono.trim());
  const valores: Record<string, string> = {
    especialidad: entrada.especialidad,
    titulo,
    aniosExperiencia: entrada.aniosExperiencia.trim(),
    tarifaHora: entrada.tarifaHora.trim(),
    telefono: entrada.telefono.trim(),
    zona,
    bio,
    horariosLibres: entrada.horariosLibres,
  };

  const anios = FORMATO_DE_ENTERO.test(valores.aniosExperiencia as string) ? Number(valores.aniosExperiencia) : Number.NaN;
  const tarifa = FORMATO_DE_ENTERO.test((valores.tarifaHora as string).replace(/[.\s]/g, "")) ? Number((valores.tarifaHora as string).replace(/[.\s]/g, "")) : Number.NaN;
  const horariosLibres = horariosLibresDeTexto(entrada.horariosLibres) ?? [];

  const errores = soloErrores({
    especialidad: congelado || ESPECIALIDADES.some((e) => e.valor === entrada.especialidad) ? undefined : "Elige tu especialidad.",
    titulo: congelado ? undefined : titulo === "" ? "Escribe tu título o formación." : cuentaCaracteres(titulo) > LARGO_MAXIMO_DE_TITULO ? `Debe tener ${LARGO_MAXIMO_DE_TITULO} caracteres o menos.` : undefined,
    aniosExperiencia: Number.isInteger(anios) && anios >= 0 && anios <= ANIOS_MAXIMOS_DE_EXPERIENCIA ? undefined : `Escribe los años de experiencia (de 0 a ${ANIOS_MAXIMOS_DE_EXPERIENCIA}).`,
    tarifaHora: Number.isInteger(tarifa) && tarifa >= 1 && tarifa <= TARIFA_MAXIMA ? undefined : "Escribe cuánto cobras por hora, en pesos (solo números).",
    telefono: FORMATO_DE_TELEFONO.test(telefono) ? undefined : "Escribe un celular válido, por ejemplo 300 123 4567.",
    zona: zona === "" ? "Escribe la zona donde atiendes." : cuentaCaracteres(zona) > LARGO_MAXIMO_DE_ZONA ? `Debe tener ${LARGO_MAXIMO_DE_ZONA} caracteres o menos.` : undefined,
    horariosLibres: horariosLibres.length > 0 ? undefined : "Agrega al menos un rango de horario en el que atiendas.",
    bio: bio === "" ? "Cuéntales a las familias quién eres." : cuentaCaracteres(bio) > LARGO_MAXIMO_DE_BIO ? `Debe tener ${LARGO_MAXIMO_DE_BIO} caracteres o menos.` : undefined,
  });
  if (Object.keys(errores).length > 0) return { errores, valores };

  return {
    datos: {
      ...(congelado ? {} : { especialidad: entrada.especialidad as Especialidad, titulo }),
      aniosExperiencia: anios,
      tarifaHora: tarifa,
      telefono,
      zona,
      horariosLibres,
      bio,
    },
    valores,
  };
}

// La vigencia que el revisor le da a un control al aprobarlo: AAAA-MM-DD en el futuro, hasta 5 años. Vacío = no vence
// (solo los títulos pueden no vencer; el backend lo vuelve a exigir).
export function validarVigencia(texto: string, hoy: string): string | undefined {
  if (texto === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || Number.isNaN(new Date(`${texto}T00:00:00Z`).getTime())) return "Escribe una fecha válida.";
  if (texto <= hoy) return "La vigencia debe ser una fecha futura.";
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCFullYear(limite.getUTCFullYear() + 5);
  if (texto > limite.toISOString().slice(0, 10)) return "La vigencia no puede pasar de 5 años.";
  return undefined;
}
