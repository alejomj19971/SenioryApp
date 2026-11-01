import type { DatosDeLectura, DatosDeMedicamento } from "@/lib/services/teleasistencia";

// Validaciones de los formularios de teleasistencia: responden rápido y sin ir al servidor. El backend aplica las
// reglas de verdad (rangos plausibles, el día de la toma) y tiene siempre la última palabra. Sin `server-only`:
// funciones puras, también las usan las pruebas.

export const HORARIOS_MAXIMOS = 8;
const FORMATO_DE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATO_DE_ENTERO = /^\d{1,4}$/;

type Errores = Record<string, string>;

export function validarMedicamento(entrada: { nombre: string; dosis: string; indicaciones: string; horarios: string[] }):
  | { datos: DatosDeMedicamento; valores: Record<string, string> }
  | { errores: Errores; valores: Record<string, string> } {
  const nombre = entrada.nombre.trim();
  const dosis = entrada.dosis.trim();
  const indicaciones = entrada.indicaciones.trim();
  const horarios = entrada.horarios.map((hora) => hora.trim()).filter((hora) => hora !== "");
  const valores = { nombre, dosis, indicaciones, horarios: horarios.join(",") };

  const errores: Errores = {};
  if (nombre === "") errores.nombre = "Escribe el nombre del medicamento.";
  else if (nombre.length > 400) errores.nombre = "El nombre es demasiado largo.";
  if (dosis === "") errores.dosis = "Escribe la dosis, por ejemplo «50 mg» o «1 tableta».";
  else if (dosis.length > 400) errores.dosis = "La dosis es demasiado larga.";
  if (indicaciones.length > 2000) errores.indicaciones = "Las indicaciones son demasiado largas.";

  if (horarios.length === 0) errores.horarios = "Indica a qué hora se toma.";
  else if (horarios.length > HORARIOS_MAXIMOS) errores.horarios = `Máximo ${HORARIOS_MAXIMOS} horas al día.`;
  else if (horarios.some((hora) => !FORMATO_DE_HORA.test(hora))) errores.horarios = "Revisa las horas: deben ser como 08:00.";
  else if (new Set(horarios).size !== horarios.length) errores.horarios = "Hay horas repetidas.";

  if (Object.keys(errores).length > 0) return { errores, valores };
  return { datos: { nombre, dosis, indicaciones, horarios: [...horarios].sort() }, valores };
}

function entero(texto: string): number | "mal" | undefined {
  const limpio = texto.trim();
  if (limpio === "") return undefined;
  return FORMATO_DE_ENTERO.test(limpio) ? Number(limpio) : "mal";
}

export function validarLectura(entrada: { presionSistolica: string; presionDiastolica: string; frecuenciaCardiaca: string; glucosa: string }):
  | { datos: DatosDeLectura; valores: Record<string, string> }
  | { errores: Errores; valores: Record<string, string> } {
  const valores = {
    presionSistolica: entrada.presionSistolica.trim(),
    presionDiastolica: entrada.presionDiastolica.trim(),
    frecuenciaCardiaca: entrada.frecuenciaCardiaca.trim(),
    glucosa: entrada.glucosa.trim(),
  };
  const sistolica = entero(valores.presionSistolica);
  const diastolica = entero(valores.presionDiastolica);
  const pulso = entero(valores.frecuenciaCardiaca);
  const glucosa = entero(valores.glucosa);

  const errores: Errores = {};
  const MENSAJE_DE_NUMERO = "Escribe solo el número, sin decimales ni letras.";
  if (sistolica === "mal") errores.presionSistolica = MENSAJE_DE_NUMERO;
  if (diastolica === "mal") errores.presionDiastolica = MENSAJE_DE_NUMERO;
  if (pulso === "mal") errores.frecuenciaCardiaca = MENSAJE_DE_NUMERO;
  if (glucosa === "mal") errores.glucosa = MENSAJE_DE_NUMERO;

  // La presión va completa o no va (alta y baja juntas).
  if ((sistolica === undefined) !== (diastolica === undefined)) {
    errores[sistolica === undefined ? "presionSistolica" : "presionDiastolica"] = "La presión se registra completa: escribe la alta y la baja.";
  }
  if (Object.keys(errores).length === 0 && [sistolica, diastolica, pulso, glucosa].every((valor) => valor === undefined)) {
    errores.medidas = "Escribe al menos una medida.";
  }
  if (Object.keys(errores).length > 0) return { errores, valores };

  return {
    datos: {
      ...(typeof sistolica === "number" ? { presionSistolica: sistolica } : {}),
      ...(typeof diastolica === "number" ? { presionDiastolica: diastolica } : {}),
      ...(typeof pulso === "number" ? { frecuenciaCardiaca: pulso } : {}),
      ...(typeof glucosa === "number" ? { glucosa } : {}),
    },
    valores,
  };
}
