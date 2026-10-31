import type { CuidadorId } from '../../../dominio/ids.js';

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
}

export const REPOSITORIO_DOCUMENTOS = Symbol('RepositorioDocumentos');
