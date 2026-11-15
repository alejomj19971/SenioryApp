import { eq } from 'drizzle-orm';
import { RecursoNoEncontrado } from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { RepositorioSegundosFactores } from '../../../aplicacion/puertos/salida/repositorio-segundos-factores.js';
import type { UsuarioId } from '../../../dominio/ids.js';
import type { SegundoFactor } from '../../../dominio/segundo-factor.js';
import { segundosFactores } from './identidad.esquema.js';
import { segundoFactorDeFila } from './mapeadores.js';

export class RepositorioSegundosFactoresDrizzle
  implements RepositorioSegundosFactores
{
  constructor(private readonly contexto: ContextoTransaccional) {}

  async buscarPorUsuarioId(
    usuarioId: UsuarioId,
  ): Promise<SegundoFactor | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(segundosFactores)
      .where(eq(segundosFactores.usuarioId, usuarioId))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : segundoFactorDeFila(fila);
  }

  async buscarPorUsuarioIdParaActualizar(
    usuarioId: UsuarioId,
  ): Promise<SegundoFactor | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(segundosFactores)
      .where(eq(segundosFactores.usuarioId, usuarioId))
      .limit(1)
      .for('update');
    const fila = filas[0];
    return fila === undefined ? null : segundoFactorDeFila(fila);
  }

  async guardarOReemplazar(segundoFactor: SegundoFactor): Promise<void> {
    await this.contexto
      .conexion()
      .insert(segundosFactores)
      .values({
        usuarioId: segundoFactor.usuarioId,
        secretoCifrado: Buffer.from(segundoFactor.secretoCifrado),
        activadoEn: segundoFactor.activadoEn,
        creadoEn: segundoFactor.creadoEn,
        actualizadoEn: segundoFactor.actualizadoEn,
      })
      .onConflictDoUpdate({
        target: segundosFactores.usuarioId,
        set: {
          secretoCifrado: Buffer.from(segundoFactor.secretoCifrado),
          activadoEn: segundoFactor.activadoEn,
          actualizadoEn: segundoFactor.actualizadoEn,
        },
      });
  }

  async actualizar(segundoFactor: SegundoFactor): Promise<void> {
    const actualizados = await this.contexto
      .conexion()
      .update(segundosFactores)
      .set({
        secretoCifrado: Buffer.from(segundoFactor.secretoCifrado),
        activadoEn: segundoFactor.activadoEn,
        actualizadoEn: segundoFactor.actualizadoEn,
      })
      .where(eq(segundosFactores.usuarioId, segundoFactor.usuarioId))
      .returning({ usuarioId: segundosFactores.usuarioId });
    if (actualizados.length === 0) {
      throw new RecursoNoEncontrado(
        'El segundo factor no existe',
        'segundo_factor.no_encontrado',
      );
    }
  }

  async eliminar(usuarioId: UsuarioId): Promise<void> {
    await this.contexto
      .conexion()
      .delete(segundosFactores)
      .where(eq(segundosFactores.usuarioId, usuarioId));
  }
}
