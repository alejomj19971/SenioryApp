import {
  ConflictoDeEstado,
  SinPermiso,
} from '../../compartido/dominio/errores.js';
import type {
  AccionDeServicio,
  ActorDeServicio,
  EstadoDeServicio,
} from './valores-cerrados.js';

// La máquina de estados del servicio (E9). Es una función pura sobre una tabla: la única fuente de verdad de
// qué se puede hacer, quién puede hacerlo y a dónde lleva.
//
//   (nuevo) ── solicitar ─────────────▶ solicitado   (o aceptado, si el cuidador activó la aceptación automática)
//   solicitado ── aceptar / rechazar / expirar / cancelar ──▶ aceptado / cancelado / cancelado / cancelado
//   aceptado ── iniciar ──▶ en_curso        aceptado ── cancelar ──▶ cancelado
//   en_curso ── finalizar ──▶ finalizado
//
// `finalizado` y `cancelado` son finales: ya no admiten ninguna acción.

interface Regla {
  actores: readonly ActorDeServicio[];
  // Estado de partida; `null` es «todavía no existe».
  desde: readonly (EstadoDeServicio | null)[];
  hacia: EstadoDeServicio;
}

const REGLAS: Readonly<Record<AccionDeServicio, Regla>> = {
  solicitar: { actores: ['familiar'], desde: [null], hacia: 'solicitado' },
  // Solo el cuidador acepta. La aceptación automática no pasa por aquí: nace en `solicitar`.
  aceptar: { actores: ['cuidador'], desde: ['solicitado'], hacia: 'aceptado' },
  rechazar: {
    actores: ['cuidador'],
    desde: ['solicitado'],
    hacia: 'cancelado',
  },
  expirar: { actores: ['sistema'], desde: ['solicitado'], hacia: 'cancelado' },
  cancelar: {
    actores: ['familiar'],
    desde: ['solicitado', 'aceptado'],
    hacia: 'cancelado',
  },
  // El cuidador marca que inició (check-in). Si se decide el inicio automático, se agrega `sistema` aquí.
  iniciar: { actores: ['cuidador'], desde: ['aceptado'], hacia: 'en_curso' },
  finalizar: {
    actores: ['cuidador'],
    desde: ['en_curso'],
    hacia: 'finalizado',
  },
};

export interface ContextoDeTransicion {
  // Solo para `solicitar`: si el cuidador activó la aceptación automática, el servicio nace aceptado.
  aceptacionAutomatica?: boolean;
}

const ESTADO_EN_TEXTO: Record<EstadoDeServicio, string> = {
  solicitado: 'solicitado',
  aceptado: 'aceptado',
  en_curso: 'en curso',
  finalizado: 'finalizado',
  cancelado: 'cancelado',
};

// Devuelve el estado al que lleva la acción, o lanza un error de dominio:
// - SinPermiso (403) si ese actor no puede hacer esa acción;
// - ConflictoDeEstado (409) si el estado actual no la admite.
export function transicionar(
  estado: EstadoDeServicio | null,
  accion: AccionDeServicio,
  actor: ActorDeServicio,
  contexto: ContextoDeTransicion = {},
): EstadoDeServicio {
  const regla = REGLAS[accion];
  if (!regla.actores.includes(actor)) {
    throw new SinPermiso(
      'Esa persona no puede hacer esta acción sobre el servicio',
      'servicio.actor_no_permitido',
    );
  }
  if (!regla.desde.includes(estado)) {
    throw new ConflictoDeEstado(
      estado === null
        ? 'El servicio ya existe'
        : `Un servicio ${ESTADO_EN_TEXTO[estado]} no admite esta acción`,
      'servicio.transicion_invalida',
    );
  }
  if (accion === 'solicitar' && contexto.aceptacionAutomatica === true) {
    return 'aceptado';
  }
  return regla.hacia;
}

// Para las pruebas y la documentación: todas las aristas permitidas.
export function transicionesPermitidas(): {
  accion: AccionDeServicio;
  actor: ActorDeServicio;
  desde: EstadoDeServicio | null;
  hacia: EstadoDeServicio;
}[] {
  return (Object.entries(REGLAS) as [AccionDeServicio, Regla][]).flatMap(
    ([accion, regla]) =>
      regla.actores.flatMap((actor) =>
        regla.desde.map((desde) => ({
          accion,
          actor,
          desde,
          hacia: regla.hacia,
        })),
      ),
  );
}
