import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { ServicioId } from './ids.js';

export const LARGO_MAXIMO_DEL_COMENTARIO = 500;

export interface DatosDeCalificacion {
  servicioId: ServicioId;
  // Quien calificó: el familiar que contrató.
  familiarId: string;
  calificacion: number;
  comentario: string | null;
  creadaEn: Date;
}

// Lo que dice la familia de un servicio terminado: de 1 a 5 y, si quiere, un comentario corto. Una por servicio.
// Que el servicio esté finalizado y que quien califica sea quien contrató lo comprueba el caso de uso.
export class Calificacion {
  private constructor(private readonly datos: DatosDeCalificacion) {}

  static crear(datos: DatosDeCalificacion): Calificacion {
    if (
      !Number.isInteger(datos.calificacion) ||
      datos.calificacion < 1 ||
      datos.calificacion > 5
    ) {
      throw new ErrorDeValidacion(
        'La calificación debe ser un número entero de 1 a 5',
        'calificacion.valor_invalido',
      );
    }
    return new Calificacion({
      ...datos,
      comentario: limpiarComentario(datos.comentario),
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeCalificacion): Calificacion {
    return new Calificacion({ ...datos });
  }

  get servicioId(): ServicioId {
    return this.datos.servicioId;
  }
  get familiarId(): string {
    return this.datos.familiarId;
  }
  get calificacion(): number {
    return this.datos.calificacion;
  }
  get comentario(): string | null {
    return this.datos.comentario;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
}

function limpiarComentario(texto: string | null): string | null {
  if (texto === null) return null;
  const limpio = texto.normalize('NFC').trim();
  if (limpio === '') return null;
  if (Array.from(limpio).length > LARGO_MAXIMO_DEL_COMENTARIO) {
    throw new ErrorDeValidacion(
      `El comentario no puede pasar de ${LARGO_MAXIMO_DEL_COMENTARIO} caracteres`,
      'calificacion.comentario_muy_largo',
    );
  }
  return limpio;
}
