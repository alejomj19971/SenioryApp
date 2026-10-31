import { and, desc, eq } from 'drizzle-orm';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type {
  DatosDeHojaDeVida,
  DocumentoPublico,
  RepositorioDocumentos,
} from '../../../aplicacion/puertos/salida/repositorio-documentos.js';
import type { CuidadorId } from '../../../dominio/ids.js';
import { documentos } from './directorio.esquema.js';

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
}
