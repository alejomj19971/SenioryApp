import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioTokensDeRecuperacion } from '../../../aplicacion/puertos/salida/repositorio-tokens-de-recuperacion.js';
import type { UsuarioId } from '../../../dominio/ids.js';
import type { TokenDeRecuperacion } from '../../../dominio/token-de-recuperacion.js';
import { tokensDeRecuperacion } from './identidad.esquema.js';
import { tokenDeRecuperacionDeFila } from './mapeadores.js';

export class RepositorioTokensDeRecuperacionDrizzle implements RepositorioTokensDeRecuperacion {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(token: TokenDeRecuperacion): Promise<void> {
    try {
      await this.contexto
        .conexion()
        .insert(tokensDeRecuperacion)
        .values({
          id: token.id,
          usuarioId: token.usuarioId,
          hashDelToken: Buffer.from(token.hashDelToken),
          creadoEn: token.creadoEn,
          expiraEn: token.expiraEn,
          usadoEn: token.usadoEn,
        });
    } catch (error) {
      if (esViolacionDeUnicidad(error, 'tokens_de_recuperacion_hash_unico')) {
        // Con 256 bits aleatorios no ocurre por azar: indicaría un generador de tokens roto.
        throw new ConflictoDeEstado(
          'Ya existe un enlace con ese token',
          'recuperacion.token_repetido',
        );
      }
      throw error;
    }
  }

  async buscarPorHashDelToken(
    hash: Uint8Array,
  ): Promise<TokenDeRecuperacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(tokensDeRecuperacion)
      .where(eq(tokensDeRecuperacion.hashDelToken, Buffer.from(hash)))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : tokenDeRecuperacionDeFila(fila);
  }

  async buscarPorHashParaActualizar(
    hash: Uint8Array,
  ): Promise<TokenDeRecuperacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(tokensDeRecuperacion)
      .where(eq(tokensDeRecuperacion.hashDelToken, Buffer.from(hash)))
      .limit(1)
      // NO KEY UPDATE: la fila cambia (se gasta) pero nunca su clave.
      .for('no key update');
    const fila = filas[0];
    return fila === undefined ? null : tokenDeRecuperacionDeFila(fila);
  }

  async actualizar(token: TokenDeRecuperacion): Promise<void> {
    // coalesce: si la base ya tiene la marca de uso, se conserva la primera.
    const actualizados = await this.contexto
      .conexion()
      .update(tokensDeRecuperacion)
      .set({
        usadoEn: sql`coalesce(${tokensDeRecuperacion.usadoEn}, ${token.usadoEn}::timestamptz)`,
      })
      .where(eq(tokensDeRecuperacion.id, token.id))
      .returning({ id: tokensDeRecuperacion.id });
    if (actualizados.length === 0) {
      throw new RecursoNoEncontrado(
        'El enlace no existe',
        'recuperacion.no_encontrado',
      );
    }
  }

  async buscarUltimoDeUsuario(
    usuarioId: UsuarioId,
  ): Promise<TokenDeRecuperacion | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(tokensDeRecuperacion)
      .where(eq(tokensDeRecuperacion.usuarioId, usuarioId))
      .orderBy(desc(tokensDeRecuperacion.creadoEn))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : tokenDeRecuperacionDeFila(fila);
  }

  async invalidarPendientesDeUsuario(
    usuarioId: UsuarioId,
    ahora: Date,
  ): Promise<number> {
    const gastados = await this.contexto
      .conexion()
      .update(tokensDeRecuperacion)
      .set({ usadoEn: ahora })
      .where(
        and(
          eq(tokensDeRecuperacion.usuarioId, usuarioId),
          isNull(tokensDeRecuperacion.usadoEn),
        ),
      )
      .returning({ id: tokensDeRecuperacion.id });
    return gastados.length;
  }

  async eliminarVencidosAntesDe(limite: Date): Promise<number> {
    const eliminados = await this.contexto
      .conexion()
      .delete(tokensDeRecuperacion)
      .where(lt(tokensDeRecuperacion.expiraEn, limite))
      .returning({ id: tokensDeRecuperacion.id });
    return eliminados.length;
  }
}
