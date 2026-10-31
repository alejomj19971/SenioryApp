import { FechaCivil } from '../../src/compartido/dominio/fecha-civil.js';
import type { Jornada } from '../../src/compartido/dominio/jornada.js';
import {
  Servicio,
  type DatosParaSolicitar,
} from '../../src/reservas/dominio/servicio.js';
import type { EstadoDeServicio } from '../../src/reservas/dominio/valores-cerrados.js';
import { idDePrueba } from './identidad.js';

// Datos de prueba de Reservas: sin base de datos ni red.
//
// «Ahora» es el miércoles 21 de octubre de 2026 a las 10:00 en Bogotá (15:00 UTC). Colombia no tiene horario
// de verano, así que Bogotá siempre es UTC−5.

export const ZONA = 'America/Bogota';
export const AHORA_RESERVAS = new Date('2026-10-21T15:00:00.000Z');
export const HOY_RESERVAS = FechaCivil.desdeTexto('2026-10-21');
export const FAMILIAR_ID = '0198aaaa-0000-7000-8000-0000000000f1';
export const CUIDADOR_USUARIO_ID = '0198aaaa-0000-7000-8000-0000000000c1';
export const CUIDADOR_ID = '0198aaaa-0000-7000-8000-0000000000c2';
export const ADULTO_MAYOR_ID = '0198aaaa-0000-7000-8000-0000000000a1';

export function datosParaSolicitar(
  cambios: Partial<DatosParaSolicitar> = {},
): DatosParaSolicitar {
  return {
    id: idDePrueba<'Servicio'>(),
    familiarId: FAMILIAR_ID,
    adultoMayorId: ADULTO_MAYOR_ID,
    cuidadorId: CUIDADOR_ID,
    fecha: HOY_RESERVAS.sumarDias(1),
    jornada: 'manana',
    horas: 2,
    medioDePago: 'pasarela',
    aceptacionAutomatica: false,
    tarifaHora: 20_000,
    subtotal: 40_000,
    cargoFamilia: 3_200,
    totalFamilia: 43_200,
    pagoProfesional: 36_000,
    politicaVersion: 1,
    claveDeIdempotencia: `clave-${idDePrueba<'Clave'>()}`,
    hoy: HOY_RESERVAS,
    ahora: AHORA_RESERVAS,
    zonaHoraria: ZONA,
    ...cambios,
  };
}

// Un servicio nuevo en estado «solicitado» (o «aceptado», si el cuidador tiene la aceptación automática).
export function servicioSolicitado(
  cambios: Partial<DatosParaSolicitar> = {},
): Servicio {
  return Servicio.solicitar(datosParaSolicitar(cambios));
}

// Un servicio llevado a `estado` por el camino válido más corto, como si ya estuviera guardado.
export function servicioEn(
  estado: EstadoDeServicio,
  cambios: Partial<DatosParaSolicitar> = {},
  momento: Date = AHORA_RESERVAS,
): Servicio {
  // Para iniciar hay que estar dentro de la franja: por defecto, la mañana de hoy (son las 10:00).
  const enLaFranja: Partial<DatosParaSolicitar> =
    estado === 'en_curso' || estado === 'finalizado'
      ? { fecha: HOY_RESERVAS, jornada: 'manana' }
      : {};
  const servicio = servicioSolicitado({
    aceptacionAutomatica: false,
    ...enLaFranja,
    ...cambios,
  });
  if (estado === 'solicitado') return servicio;
  if (estado === 'cancelado') {
    servicio.cancelar(FAMILIAR_ID, momento);
    return servicio;
  }
  servicio.aceptar(CUIDADOR_USUARIO_ID, momento);
  if (estado === 'aceptado') return servicio;
  servicio.iniciar(CUIDADOR_USUARIO_ID, momento, ZONA);
  if (estado === 'en_curso') return servicio;
  servicio.finalizar(CUIDADOR_USUARIO_ID, momento);
  return servicio;
}

export const JORNADAS_DE_PRUEBA: readonly Jornada[] = [
  'manana',
  'tarde',
  'noche',
];
