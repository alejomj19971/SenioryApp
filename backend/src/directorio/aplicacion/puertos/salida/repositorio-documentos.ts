import type { Documento } from '../../../dominio/documento.js';
import type { CuidadorId, DocumentoId } from '../../../dominio/ids.js';
import type { TipoDeDocumento } from '../../../dominio/valores-cerrados.js';

export interface DocumentoPublico {
  id: string;
  // Dónde está el archivo en el almacén; nunca se le muestra a la persona.
  claveDeAlmacenamiento: string;
  tipoMime: string;
  nombreOriginal: string;
}

export interface DatosDeHojaDeVida {
  id: string;
  cuidadorId: CuidadorId;
  claveDeAlmacenamiento: string;
  nombreOriginal: string;
  tipoMime: 'application/pdf';
  tamanoBytes: number;
  sha256: Uint8Array;
  subidoEn: Date;
}

export interface RepositorioDocumentos {
  // La hoja de vida que las familias pueden ver: aprobada y marcada como pública. Es un archivo
  // distinto de los documentos privados de verificación (cédula, antecedentes…), que nunca salen de aquí
  // (hallazgo H10).
  buscarHojaDeVidaPublica(
    cuidadorId: CuidadorId,
  ): Promise<DocumentoPublico | null>;

  // La carga inicial de cuidadores reales: una hoja de vida que un administrador ya revisó.
  guardarHojaDeVidaAprobada(datos: DatosDeHojaDeVida): Promise<void>;

  // Un documento que el cuidador acaba de subir (pendiente de revisión).
  guardar(documento: Documento): Promise<void>;

  // Guarda lo que cambia al revisarlo: su estado y si es público.
  actualizar(documento: Documento): Promise<void>;

  buscarPorId(id: DocumentoId): Promise<Documento | null>;
  // Bloquea la fila hasta que termine la transacción: dos revisores no deciden sobre el mismo archivo a la vez.
  buscarPorIdParaActualizar(id: DocumentoId): Promise<Documento | null>;

  // Los del cuidador, los más recientes primero.
  listarDeCuidador(cuidadorId: CuidadorId): Promise<Documento[]>;

  // Los pendientes de revisión de ese tipo, los más antiguos primero.
  listarPendientesDeTipo(
    tipo: TipoDeDocumento,
    limite: number,
  ): Promise<Documento[]>;

  // El más reciente de ese tipo, sea cual sea su estado.
  ultimoDeTipo(
    cuidadorId: CuidadorId,
    tipo: TipoDeDocumento,
  ): Promise<Documento | null>;

  // Cuántos ha subido de ese tipo (para ponerle tope).
  contarDeTipo(cuidadorId: CuidadorId, tipo: TipoDeDocumento): Promise<number>;
}

export const REPOSITORIO_DOCUMENTOS = Symbol('RepositorioDocumentos');
