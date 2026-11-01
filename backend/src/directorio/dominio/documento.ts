import {
  ConflictoDeEstado,
  ErrorDeValidacion,
} from '../../compartido/dominio/errores.js';
import type { CuidadorId, DocumentoId } from './ids.js';
import type { EstadoDeDocumento, TipoDeDocumento } from './valores-cerrados.js';

export const TAMANO_MAXIMO_DE_DOCUMENTO = 5 * 1024 * 1024;

export const TIPOS_MIME_DE_DOCUMENTO = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;
export type TipoMimeDeDocumento = (typeof TIPOS_MIME_DE_DOCUMENTO)[number];

export const EXTENSION_DE_TIPO_MIME: Record<TipoMimeDeDocumento, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const LARGO_MAXIMO_DEL_NOMBRE = 120;

// Qué tipo de archivo es DE VERDAD, mirando los primeros bytes. El tipo que dice el cliente (el encabezado
// `Content-Type`, la extensión) no se cree: lo que cuenta es el contenido. Null si no es PDF, JPEG ni PNG.
export function tipoMimeDeContenido(
  contenido: Uint8Array,
): TipoMimeDeDocumento | null {
  const empieza = (...bytes: number[]) =>
    contenido.byteLength >= bytes.length &&
    bytes.every((byte, i) => contenido[i] === byte);
  if (empieza(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  if (empieza(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png';
  }
  return null;
}

// El nombre con el que el cuidador subió el archivo, solo para mostrárselo a él y al revisor. Nunca se usa para
// guardarlo (la clave la genera el servidor): sin rutas, sin caracteres de control y de largo acotado.
export function nombreDeArchivoSeguro(nombre: string): string {
  const sinRuta = nombre.split(/[\\/]/).pop() ?? '';
  const limpio = Array.from(sinRuta.normalize('NFC'))
    .filter((c) => {
      const codigo = c.codePointAt(0) ?? 0;
      return (
        codigo >= 0x20 &&
        codigo !== 0x7f &&
        !(codigo >= 0x202a && codigo <= 0x202e)
      );
    })
    .join('')
    .trim()
    .slice(0, LARGO_MAXIMO_DEL_NOMBRE);
  return limpio === '' || limpio === '.' || limpio === '..'
    ? 'archivo'
    : limpio;
}

export interface DatosDeDocumento {
  id: DocumentoId;
  cuidadorId: CuidadorId;
  tipo: TipoDeDocumento;
  claveDeAlmacenamiento: string;
  nombreOriginal: string;
  tipoMime: TipoMimeDeDocumento;
  tamanoBytes: number;
  sha256: Uint8Array;
  estado: EstadoDeDocumento;
  esPublico: boolean;
  subidoEn: Date;
}

// Un archivo que el cuidador subió: su cédula, sus antecedentes, su título, su psicotécnica o su hoja de vida.
// Los privados solo los ven el propio cuidador y un revisor. La hoja de vida, una vez aprobada, se muestra a las
// familias (y solo ella: H10).
export class Documento {
  private constructor(private readonly datos: DatosDeDocumento) {}

  static subir(entrada: {
    id: DocumentoId;
    cuidadorId: CuidadorId;
    tipo: TipoDeDocumento;
    nombreOriginal: string;
    contenido: Uint8Array;
    sha256: Uint8Array;
    ahora: Date;
  }): Documento {
    if (
      entrada.contenido.byteLength < 1 ||
      entrada.contenido.byteLength > TAMANO_MAXIMO_DE_DOCUMENTO
    ) {
      throw new ErrorDeValidacion(
        'El archivo debe pesar entre 1 byte y 5 MB',
        'documento.tamano_invalido',
      );
    }
    const tipoMime = tipoMimeDeContenido(entrada.contenido);
    if (tipoMime === null) {
      throw new ErrorDeValidacion(
        'El archivo debe ser un PDF, una imagen JPEG o una imagen PNG',
        'documento.formato_invalido',
      );
    }
    // La hoja de vida se muestra a las familias: solo PDF.
    if (entrada.tipo === 'hoja_de_vida' && tipoMime !== 'application/pdf') {
      throw new ErrorDeValidacion(
        'La hoja de vida debe ser un archivo PDF',
        'documento.hoja_de_vida_no_es_pdf',
      );
    }
    return new Documento({
      id: entrada.id,
      cuidadorId: entrada.cuidadorId,
      tipo: entrada.tipo,
      claveDeAlmacenamiento: `documentos/${entrada.id}.${EXTENSION_DE_TIPO_MIME[tipoMime]}`,
      nombreOriginal: nombreDeArchivoSeguro(entrada.nombreOriginal),
      tipoMime,
      tamanoBytes: entrada.contenido.byteLength,
      sha256: entrada.sha256,
      estado: 'pendiente',
      esPublico: false,
      subidoEn: entrada.ahora,
    });
  }

  static reconstruir(datos: DatosDeDocumento): Documento {
    return new Documento({ ...datos });
  }

  get id(): DocumentoId {
    return this.datos.id;
  }
  get cuidadorId(): CuidadorId {
    return this.datos.cuidadorId;
  }
  get tipo(): TipoDeDocumento {
    return this.datos.tipo;
  }
  get claveDeAlmacenamiento(): string {
    return this.datos.claveDeAlmacenamiento;
  }
  get nombreOriginal(): string {
    return this.datos.nombreOriginal;
  }
  get tipoMime(): TipoMimeDeDocumento {
    return this.datos.tipoMime;
  }
  get tamanoBytes(): number {
    return this.datos.tamanoBytes;
  }
  get sha256(): Uint8Array {
    return this.datos.sha256;
  }
  get estado(): EstadoDeDocumento {
    return this.datos.estado;
  }
  get esPublico(): boolean {
    return this.datos.esPublico;
  }
  get subidoEn(): Date {
    return this.datos.subidoEn;
  }

  // El revisor lo aprueba. La hoja de vida aprobada queda pública; los demás siguen privados.
  aprobar(): void {
    this.exigirPendiente('aprobar');
    this.datos.estado = 'aprobado';
    this.datos.esPublico = this.datos.tipo === 'hoja_de_vida';
  }

  rechazar(): void {
    this.exigirPendiente('rechazar');
    this.datos.estado = 'rechazado';
    this.datos.esPublico = false;
  }

  private exigirPendiente(accion: string): void {
    if (this.datos.estado !== 'pendiente') {
      throw new ConflictoDeEstado(
        `Un documento ${this.datos.estado} no se puede ${accion}`,
        'documento.no_pendiente',
      );
    }
  }
}
