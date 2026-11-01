import type { ConversacionId } from './ids.js';
import type { RolDeAutor } from './mensaje.js';

export interface DatosDeConversacion {
  id: ConversacionId;
  // La cuenta de la familia y el cuidador en `directorio`. Una conversación es de UNA pareja, para siempre: sus
  // servicios van y vienen, y el chat sigue.
  familiarId: string;
  cuidadorId: string;
  creadaEn: Date;
  // Cuándo se escribió por última vez; null mientras nadie ha escrito.
  ultimoMensajeEn: Date | null;
}

// La conversación entre una familia y un cuidador.
export class Conversacion {
  private constructor(private readonly datos: DatosDeConversacion) {}

  static abrir(entrada: {
    id: ConversacionId;
    familiarId: string;
    cuidadorId: string;
    ahora: Date;
  }): Conversacion {
    return new Conversacion({
      id: entrada.id,
      familiarId: entrada.familiarId,
      cuidadorId: entrada.cuidadorId,
      creadaEn: entrada.ahora,
      ultimoMensajeEn: null,
    });
  }

  static reconstruir(datos: DatosDeConversacion): Conversacion {
    return new Conversacion({ ...datos });
  }

  get id(): ConversacionId {
    return this.datos.id;
  }
  get familiarId(): string {
    return this.datos.familiarId;
  }
  get cuidadorId(): string {
    return this.datos.cuidadorId;
  }
  get creadaEn(): Date {
    return this.datos.creadaEn;
  }
  get ultimoMensajeEn(): Date | null {
    return this.datos.ultimoMensajeEn;
  }

  // ¿Es esta persona parte de la conversación, en esa calidad? `participanteId` es la cuenta de la familia, o el id
  // del cuidador en el directorio.
  esDe(rol: RolDeAutor, participanteId: string): boolean {
    return rol === 'familiar'
      ? this.datos.familiarId === participanteId
      : this.datos.cuidadorId === participanteId;
  }
}
