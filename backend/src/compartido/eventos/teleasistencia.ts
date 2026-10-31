import type { EventoDeIntegracion } from './evento-de-integracion.js';

// Contratos de los eventos que publica Teleasistencia. Solo IDs y valores cerrados: NUNCA un dato clínico (ni una
// lectura, ni el nombre de un medicamento). Quien necesite saber más consulta a Teleasistencia, que verifica el
// acceso y deja la auditoría.

export const ORIGENES_DE_ALERTA = [
  'boton',
  'voz',
  'signos',
  'medicamento',
] as const;
export type OrigenDeAlerta = (typeof ORIGENES_DE_ALERTA)[number];

// Alguien pidió ayuda. Los destinatarios ya vienen resueltos: los familiares vinculados y el cuidador en turno,
// como cuentas de `identidad`. Notificaciones los avisa por todos los canales a la vez (E11).
export type AlertaGenerada = EventoDeIntegracion<
  'teleasistencia.alerta_generada',
  {
    alertaId: string;
    adultoMayorId: string;
    origen: OrigenDeAlerta;
    generadaPor: string;
    destinatarios: string[];
  }
>;

// Alguien atendió la alerta.
export type AlertaAtendida = EventoDeIntegracion<
  'teleasistencia.alerta_atendida',
  { alertaId: string; adultoMayorId: string; atendidaPor: string }
>;

// Pasó la tolerancia y la toma sigue sin registrarse.
export type MedicamentoOmitido = EventoDeIntegracion<
  'teleasistencia.medicamento_omitido',
  { tomaId: string; medicamentoId: string; adultoMayorId: string }
>;

// Una lectura salió de los rangos de referencia. El evento no dice cuál ni cuánto: solo que hay que mirar.
export type LecturaFueraDeRango = EventoDeIntegracion<
  'teleasistencia.lectura_fuera_de_rango',
  { lecturaId: string; adultoMayorId: string }
>;

export type EventoDeTeleasistencia =
  AlertaGenerada | AlertaAtendida | MedicamentoOmitido | LecturaFueraDeRango;
