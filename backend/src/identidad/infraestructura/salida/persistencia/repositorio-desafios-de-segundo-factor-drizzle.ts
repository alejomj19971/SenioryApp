import { and, eq, isNull, lt } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioDesafiosDeSegundoFactor } from '../../../aplicacion/puertos/salida/repositorio-desafios-de-segundo-factor.js';
import type { DesafioDeSegundoFactor } from '../../../dominio/desafio-de-segundo-factor.js';
import type { UsuarioId } from '../../../dominio/ids.js';
import { desafiosDeSegundoFactor } from './identidad.esquema.js';
import { desafioDeSegundoFactorDeFila } from './mapeadores.js';

export class RepositorioDesafiosDeSegundoFactorDrizzle
  implements RepositorioDesafiosDeSegundoFactor
{
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(desafio: DesafioDeSegundoFactor): Promise<void> {
    try {
      await this.contexto
        .conexion()
        .insert(desafiosDeSegundoFactor)
        .values({
          id: desafio.id,
          usuarioId: desafio.usuarioId,
          hashDelToken: Buffer.from(desafio.hashDelToken),
          creadoEn: desafio.creadoEn,
          expiraEn: desafio.expiraEn,
          usadoEn: desafio.usadoEn,
        });
    } catch (error) {
      if (
        esViolacionDeUnicidad(error, 'desafios_segundo_factor_hash_unico')
      ) {
        // Con 256 bits aleatorios no ocurre por azar: indicaría un generador de tokens roto.
        throw new ConflictoDeEstado(
          'Ya existe un desafío con ese token',
          'segundo_factor.desafio_repetido',
        );
      }
      throw error;
    }
  }

  async buscarPorHashParaActualizar(
    hash: Uint8Array,
  ): Promise<DesafioDeSegundoFactor | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(desafiosDeSegundoFactor)
      .where(eq(desafiosDeSegundoFactor.hashDelToken, Buffer.from(hash)))
      .limit(1)
      // NO KEY UPDATE: la fila cambia (se gasta) pero nunca su clave.
      .for('no key update');
    const fila = filas[0];
    return fila === undefined ? null : desafioDeSegundoFactorDeFila(fila);
  }

  async actualizar(desafio: DesafioDeSegundoFactor): Promise<void> {
    const actualizados = await this.contexto
      .conexion()
      .update(desafiosDeSegundoFactor)
      .set({ usadoEn: desafio.usadoEn })
      .where(eq(desafiosDeSegundoFactor.id, desafio.id))
      .returning({ id: desafiosDeSegundoFactor.id });
    if (actualizados.length === 0) {
      throw new RecursoNoEncontrado(
        'El desafío no existe',
        'segundo_factor.desafio_no_encontrado',
      );
    }
  }

  async invalidarPendientesDeUsuario(
    usuarioId: UsuarioId,
    ahora: Date,
  ): Promise<number> {
    const gastados = await this.contexto
      .conexion()
      .update(desafiosDeSegundoFactor)
      .set({ usadoEn: ahora })
      .where(
        and(
          eq(desafiosDeSegundoFactor.usuarioId, usuarioId),
          isNull(desafiosDeSegundoFactor.usadoEn),
        ),
      )
      .returning({ id: desafiosDeSegundoFactor.id });
    return gastados.length;
  }

  async eliminarVencidosAntesDe(limite: Date): Promise<number> {
    const eliminados = await this.contexto
      .conexion()
      .delete(desafiosDeSegundoFactor)
      .where(lt(desafiosDeSegundoFactor.expiraEn, limite))
      .returning({ id: desafiosDeSegundoFactor.id });
    return eliminados.length;
  }
}
