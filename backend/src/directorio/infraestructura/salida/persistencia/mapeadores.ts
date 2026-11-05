import { Dinero } from '../../../../compartido/dominio/dinero.js';
import { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Id } from '../../../../compartido/dominio/id.js';
import {
  esJornada,
  type Jornada,
} from '../../../../compartido/dominio/jornada.js';
import { Cuidador } from '../../../dominio/cuidador.js';
import { Resena } from '../../../dominio/resena.js';
import {
  CONTROLES_DE_VERIFICACION,
  ESPECIALIDADES,
  ESTADOS_DE_CUIDADOR,
  ESTADOS_DE_VERIFICACION,
} from '../../../dominio/valores-cerrados.js';
import { Verificacion } from '../../../dominio/verificacion.js';
import type {
  cuidadores,
  resenas,
  verificaciones,
} from './directorio.esquema.js';

// Convierte filas de la base de datos en objetos de dominio. Lo que sale de la base ya pasó por el dominio
// al guardarse y por los CHECK de las tablas; si un valor no es válido es que la base está dañada, y se
// falla con un error claro en lugar de seguir con datos inconsistentes.

const id = <Marca extends string>(texto: string): Id<Marca> =>
  texto as Id<Marca>;

function exigir<T extends string>(
  valor: string,
  validos: readonly T[],
  campo: string,
): T {
  const encontrado = validos.find((v) => v === valor);
  if (encontrado === undefined) {
    throw new Error(
      `Valor inesperado en la base de datos: ${campo} = "${valor}"`,
    );
  }
  return encontrado;
}

export function verificacionDeFila(
  fila: typeof verificaciones.$inferSelect,
): Verificacion {
  return Verificacion.reconstruir({
    id: id(fila.id),
    cuidadorId: id(fila.cuidadorId),
    control: exigir(fila.control, CONTROLES_DE_VERIFICACION, 'control'),
    estado: exigir(fila.estado, ESTADOS_DE_VERIFICACION, 'estado'),
    revisadoPor: fila.revisadoPor,
    revisadoEn: fila.revisadoEn,
    motivoDeRechazo: fila.motivoRechazo,
    vigenteHasta:
      fila.vigenteHasta === null
        ? null
        : FechaCivil.desdeTexto(fila.vigenteHasta),
    creadoEn: fila.creadoEn,
  });
}

export function cuidadorDeFila(
  fila: typeof cuidadores.$inferSelect,
  verificacionesDelCuidador: readonly Verificacion[],
): Cuidador {
  return Cuidador.reconstruir({
    id: id(fila.id),
    usuarioId: fila.usuarioId,
    nombre: fila.nombre,
    fotoUrl: fila.fotoUrl,
    especialidad: exigir(fila.especialidad, ESPECIALIDADES, 'especialidad'),
    titulo: fila.titulo,
    aniosExperiencia: fila.aniosExperiencia,
    tarifaHora: Dinero.pesos(fila.tarifaHora),
    telefono: fila.telefono,
    zona: fila.zona,
    ubicacion:
      fila.latitud === null || fila.longitud === null
        ? null
        : { latitud: fila.latitud, longitud: fila.longitud },
    disponibilidad: fila.disponibilidad.map((jornada): Jornada => {
      if (!esJornada(jornada)) {
        throw new Error(
          `Valor inesperado en la base de datos: jornada = "${jornada}"`,
        );
      }
      return jornada;
    }),
    bio: fila.bio,
    aceptacionAutomatica: fila.aceptacionAutomatica,
    estado: exigir(fila.estado, ESTADOS_DE_CUIDADOR, 'estado'),
    visible: fila.visible,
    sumaCalificaciones: fila.sumaCalificaciones,
    cantidadResenas: fila.cantidadResenas,
    serviciosCompletados: fila.serviciosCompletados,
    version: fila.version,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
    verificaciones: verificacionesDelCuidador,
  });
}

export function resenaDeFila(fila: typeof resenas.$inferSelect): Resena {
  return Resena.reconstruir({
    id: id(fila.id),
    cuidadorId: id(fila.cuidadorId),
    servicioId: fila.servicioId,
    autorVisible: fila.autorVisible,
    calificacion: fila.calificacion,
    comentario: fila.comentario,
    oculta: fila.oculta,
    creadaEn: fila.creadaEn,
  });
}
