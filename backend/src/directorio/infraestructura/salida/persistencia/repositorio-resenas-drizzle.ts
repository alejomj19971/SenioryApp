import { and, desc, eq } from 'drizzle-orm';
import { ConflictoDeEstado } from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioResenas } from '../../../aplicacion/puertos/salida/repositorio-resenas.js';
import type { CuidadorId } from '../../../dominio/ids.js';
import type { Resena } from '../../../dominio/resena.js';
import { resenas } from './directorio.esquema.js';
import { resenaDeFila } from './mapeadores.js';

export class RepositorioResenasDrizzle implements RepositorioResenas {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(resena: Resena): Promise<void> {
    try {
      await this.contexto.conexion().insert(resenas).values({
        id: resena.id,
        cuidadorId: resena.cuidadorId,
        servicioId: resena.servicioId,
        autorVisible: resena.autorVisible,
        calificacion: resena.calificacion,
        comentario: resena.comentario,
        oculta: resena.oculta,
        creadaEn: resena.creadaEn,
      });
    } catch (error) {
      // Tras este error la transacción en curso queda abortada: el caso de uso debe dejar que se revierta.
      if (esViolacionDeUnicidad(error, 'resenas_servicio_unica')) {
        throw new ConflictoDeEstado(
          'Ese servicio ya tiene su reseña',
          'resena.ya_existe',
        );
      }
      throw error;
    }
  }

  async existeParaServicio(servicioId: string): Promise<boolean> {
    const filas = await this.contexto
      .conexion()
      .select({ id: resenas.id })
      .from(resenas)
      .where(eq(resenas.servicioId, servicioId))
      .limit(1);
    return filas.length > 0;
  }

  async listarVisiblesDeCuidador(
    cuidadorId: CuidadorId,
    limite: number,
  ): Promise<Resena[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(resenas)
      .where(and(eq(resenas.cuidadorId, cuidadorId), eq(resenas.oculta, false)))
      .orderBy(desc(resenas.creadaEn), desc(resenas.id))
      .limit(limite);
    return filas.map(resenaDeFila);
  }
}
