import type { Jornada } from '../../compartido/dominio/jornada.js';
import type { Cuidador } from '../dominio/cuidador.js';
import type { Resena } from '../dominio/resena.js';
import {
  CONTROLES_DE_VERIFICACION,
  type ControlDeVerificacion,
  type Especialidad,
} from '../dominio/valores-cerrados.js';

// Lo que ve una familia. Es una lista blanca: el teléfono, la cuenta, el estado interno y los documentos de
// verificación NO están aquí, y por eso no pueden filtrarse por descuido. Una prueba de instantánea
// vigila que el conjunto de campos no crezca sin que se note.

export interface VistaDeResena {
  id: string;
  // Nombre abreviado («Andrea G.»).
  autor: string;
  calificacion: number;
  comentario: string | null;
  fecha: string;
}

export interface VistaDeCuidador {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  especialidad: Especialidad;
  titulo: string;
  aniosExperiencia: number;
  // Pesos colombianos enteros por hora.
  tarifaHora: number;
  zona: string;
  disponibilidad: Jornada[];
  bio: string;
  // Promedio con un decimal; null si todavía no tiene reseñas.
  calificacion: number | null;
  cantidadResenas: number;
  serviciosCompletados: number;
  aceptacionAutomatica: boolean;
  // Los controles que superó. Para quien se muestra siempre son los tres.
  controlesVerificados: ControlDeVerificacion[];
}

export interface VistaDeCuidadorConResenas extends VistaDeCuidador {
  resenas: VistaDeResena[];
}

export function vistaDeCuidador(cuidador: Cuidador): VistaDeCuidador {
  return {
    id: cuidador.id,
    nombre: cuidador.nombre,
    fotoUrl: cuidador.fotoUrl,
    especialidad: cuidador.especialidad,
    titulo: cuidador.titulo,
    aniosExperiencia: cuidador.aniosExperiencia,
    tarifaHora: cuidador.tarifaHora.valor,
    zona: cuidador.zona,
    disponibilidad: [...cuidador.disponibilidad],
    bio: cuidador.bio,
    calificacion: cuidador.calificacion(),
    cantidadResenas: cuidador.cantidadResenas,
    serviciosCompletados: cuidador.serviciosCompletados,
    aceptacionAutomatica: cuidador.aceptacionAutomatica,
    // Siempre en el mismo orden (el de la base de datos no está garantizado).
    controlesVerificados: CONTROLES_DE_VERIFICACION.filter((control) =>
      cuidador.verificaciones.some(
        (verificacion) =>
          verificacion.control === control &&
          verificacion.estado === 'aprobada',
      ),
    ),
  };
}

export function vistaDeResena(resena: Resena): VistaDeResena {
  return {
    id: resena.id,
    autor: resena.autorVisible,
    calificacion: resena.calificacion,
    comentario: resena.comentario,
    fecha: resena.creadaEn.toISOString(),
  };
}
