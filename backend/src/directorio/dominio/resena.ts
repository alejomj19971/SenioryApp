import { ErrorDeValidacion } from '../../compartido/dominio/errores.js';
import type { CuidadorId, ResenaId } from './ids.js';

export const LARGO_MAXIMO_DEL_COMENTARIO = 500;

export interface DatosDeResena {
  id: ResenaId;
  cuidadorId: CuidadorId;
  // El servicio (en `reservas`) que se calificó: una reseña por servicio.
  servicioId: string;
  // Nombre abreviado para no exponer a quien la escribió, por ejemplo «Andrea G.».
  autorVisible: string;
  calificacion: number;
  comentario: string | null;
  // Un administrador puede ocultarla (por ejemplo, si insulta o revela datos).
  oculta: boolean;
  creadaEn: Date;
}

export interface DatosParaCrearResena {
  id: ResenaId;
  cuidadorId: CuidadorId;
  servicioId: string;
  nombreDelAutor: string;
  calificacion: number;
  comentario?: string | null;
  ahora: Date;
}

// Lo que dice una familia de un servicio ya terminado: de 1 a 5 y, si quiere, un comentario corto.
export class Resena {
  private constructor(private readonly datos: DatosDeResena) {}

  static crear(datos: DatosParaCrearResena): Resena {
    if (
      !Number.isInteger(datos.calificacion) ||
      datos.calificacion < 1 ||
      datos.calificacion > 5
    ) {
      throw new ErrorDeValidacion(
        'La calificación debe ser un número entero de 1 a 5',
        'resena.calificacion_invalida',
      );
    }
    const comentario = limpiarComentario(datos.comentario);
    return new Resena({
      id: datos.id,
      cuidadorId: datos.cuidadorId,
      servicioId: datos.servicioId,
      autorVisible: abreviarAutor(datos.nombreDelAutor),
      calificacion: datos.calificacion,
      comentario,
      oculta: false,
      creadaEn: datos.ahora,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeResena): Resena {
    return new Resena({ ...datos });
  }

  get id(): ResenaId {
    return this.datos.id;
  }
  get cuidadorId(): CuidadorId {
    return this.datos.cuidadorId;
  }
  get servicioId(): string {
    return this.datos.servicioId;
  }
  get autorVisible(): string {
    return this.datos.autorVisible;
  }
  get calificacion(): number {
    return this.datos.calificacion;
  }
  get comentario(): string | null {
    return this.datos.comentario;
  }
  get oculta(): boolean {
    return this.datos.oculta;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
}

function limpiarComentario(texto: string | null | undefined): string | null {
  if (texto === undefined || texto === null) return null;
  const limpio = texto.normalize('NFC').trim();
  if (limpio === '') return null;
  if (Array.from(limpio).length > LARGO_MAXIMO_DEL_COMENTARIO) {
    throw new ErrorDeValidacion(
      `El comentario no puede pasar de ${LARGO_MAXIMO_DEL_COMENTARIO} caracteres`,
      'resena.comentario_muy_largo',
    );
  }
  return limpio;
}

// «Andrea Gómez» → «Andrea G.»; «María Fernanda Gómez Pérez» → «María P.»; «Andrea» → «Andrea».
// Solo el primer nombre y la inicial del último apellido: lo justo para que la reseña se sienta de una
// persona real sin dejar que se la identifique.
export function abreviarAutor(nombreCompleto: string): string {
  const partes = nombreCompleto.normalize('NFC').trim().split(/\s+/u);
  const primero = partes[0] ?? '';
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : undefined;
  if (primero === '') return 'Una familia';
  if (ultimo === undefined) return primero;
  const inicial = Array.from(ultimo)[0]?.toLocaleUpperCase('es-CO') ?? '';
  return `${primero} ${inicial}.`;
}
