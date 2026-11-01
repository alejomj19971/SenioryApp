import { and, asc, count, desc, eq } from 'drizzle-orm';
import { RecursoNoEncontrado } from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type {
  DatosDeHojaDeVida,
  DocumentoPublico,
  RepositorioDocumentos,
} from '../../../aplicacion/puertos/salida/repositorio-documentos.js';
import { Documento } from '../../../dominio/documento.js';
import type { CuidadorId, DocumentoId } from '../../../dominio/ids.js';
import {
  ESTADOS_DE_DOCUMENTO,
  TIPOS_DE_DOCUMENTO,
  type TipoDeDocumento,
} from '../../../dominio/valores-cerrados.js';
import { documentos } from './directorio.esquema.js';

// Lo que sale de la base ya pasó por el dominio y por los CHECK; si no es válido, la base está dañada.
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

function documentoDeFila(fila: typeof documentos.$inferSelect): Documento {
  return Documento.reconstruir({
    id: fila.id as DocumentoId,
    cuidadorId: fila.cuidadorId as CuidadorId,
    tipo: exigir(fila.tipo, TIPOS_DE_DOCUMENTO, 'tipo'),
    claveDeAlmacenamiento: fila.claveAlmacenamiento,
    nombreOriginal: fila.nombreOriginal,
    tipoMime: exigir(
      fila.tipoMime,
      ['application/pdf', 'image/jpeg', 'image/png'] as const,
      'tipo_mime',
    ),
    tamanoBytes: fila.tamanoBytes,
    sha256: fila.sha256,
    estado: exigir(fila.estado, ESTADOS_DE_DOCUMENTO, 'estado'),
    esPublico: fila.esPublico,
    subidoEn: fila.subidoEn,
  });
}

export class RepositorioDocumentosDrizzle implements RepositorioDocumentos {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async buscarHojaDeVidaPublica(
    cuidadorId: CuidadorId,
  ): Promise<DocumentoPublico | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(documentos)
      .where(
        and(
          eq(documentos.cuidadorId, cuidadorId),
          eq(documentos.tipo, 'hoja_de_vida'),
          eq(documentos.estado, 'aprobado'),
          // Solo la marcada como pública: los documentos de verificación nunca salen por esta vía.
          eq(documentos.esPublico, true),
        ),
      )
      .orderBy(desc(documentos.subidoEn))
      .limit(1);
    const fila = filas[0];
    return fila === undefined
      ? null
      : {
          id: fila.id,
          claveDeAlmacenamiento: fila.claveAlmacenamiento,
          tipoMime: fila.tipoMime,
          nombreOriginal: fila.nombreOriginal,
        };
  }

  async guardarHojaDeVidaAprobada(datos: DatosDeHojaDeVida): Promise<void> {
    await this.contexto
      .conexion()
      .insert(documentos)
      .values({
        id: datos.id,
        cuidadorId: datos.cuidadorId,
        tipo: 'hoja_de_vida',
        claveAlmacenamiento: datos.claveDeAlmacenamiento,
        nombreOriginal: datos.nombreOriginal,
        tipoMime: datos.tipoMime,
        tamanoBytes: datos.tamanoBytes,
        sha256: Buffer.from(datos.sha256),
        estado: 'aprobado',
        esPublico: true,
        subidoEn: datos.subidoEn,
      });
  }

  async guardar(documento: Documento): Promise<void> {
    await this.contexto
      .conexion()
      .insert(documentos)
      .values({
        id: documento.id,
        cuidadorId: documento.cuidadorId,
        tipo: documento.tipo,
        claveAlmacenamiento: documento.claveDeAlmacenamiento,
        nombreOriginal: documento.nombreOriginal,
        tipoMime: documento.tipoMime,
        tamanoBytes: documento.tamanoBytes,
        sha256: Buffer.from(documento.sha256),
        estado: documento.estado,
        esPublico: documento.esPublico,
        subidoEn: documento.subidoEn,
      });
  }

  async actualizar(documento: Documento): Promise<void> {
    const cambiados = await this.contexto
      .conexion()
      .update(documentos)
      .set({ estado: documento.estado, esPublico: documento.esPublico })
      .where(eq(documentos.id, documento.id))
      .returning({ id: documentos.id });
    if (cambiados.length === 0) {
      throw new RecursoNoEncontrado(
        'El documento no existe',
        'documento.no_encontrado',
      );
    }
  }

  buscarPorId(id: DocumentoId): Promise<Documento | null> {
    return this.buscar(id, false);
  }

  buscarPorIdParaActualizar(id: DocumentoId): Promise<Documento | null> {
    return this.buscar(id, true);
  }

  private async buscar(
    id: DocumentoId,
    bloquear: boolean,
  ): Promise<Documento | null> {
    const consulta = this.contexto
      .conexion()
      .select()
      .from(documentos)
      .where(eq(documentos.id, id))
      .limit(1);
    const filas = await (bloquear ? consulta.for('no key update') : consulta);
    const fila = filas[0];
    return fila === undefined ? null : documentoDeFila(fila);
  }

  async listarDeCuidador(cuidadorId: CuidadorId): Promise<Documento[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(documentos)
      .where(eq(documentos.cuidadorId, cuidadorId))
      .orderBy(desc(documentos.subidoEn), desc(documentos.id));
    return filas.map(documentoDeFila);
  }

  async listarPendientesDeTipo(
    tipo: TipoDeDocumento,
    limite: number,
  ): Promise<Documento[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(documentos)
      .where(and(eq(documentos.tipo, tipo), eq(documentos.estado, 'pendiente')))
      .orderBy(asc(documentos.subidoEn), asc(documentos.id))
      .limit(limite);
    return filas.map(documentoDeFila);
  }

  async ultimoDeTipo(
    cuidadorId: CuidadorId,
    tipo: TipoDeDocumento,
  ): Promise<Documento | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(documentos)
      .where(
        and(eq(documentos.cuidadorId, cuidadorId), eq(documentos.tipo, tipo)),
      )
      .orderBy(desc(documentos.subidoEn), desc(documentos.id))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : documentoDeFila(fila);
  }

  async contarDeTipo(
    cuidadorId: CuidadorId,
    tipo: TipoDeDocumento,
  ): Promise<number> {
    const [fila] = await this.contexto
      .conexion()
      .select({ total: count() })
      .from(documentos)
      .where(
        and(eq(documentos.cuidadorId, cuidadorId), eq(documentos.tipo, tipo)),
      );
    return fila?.total ?? 0;
  }
}
