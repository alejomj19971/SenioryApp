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
import {
  tokensDeRecuperacion,
  tokensDeVerificacionDeCorreo,
} from './identidad.esquema.js';
import { tokenDeRecuperacionDeFila } from './mapeadores.js';

export class RepositorioTokensDeRecuperacionDrizzle implements RepositorioTokensDeRecuperacion {
  // Sirve a las DOS tablas de enlaces de un solo uso (recuperación de contraseña y verificación de correo): tienen la misma
  // forma, y cada una va en su propia tabla para que un enlace de un tipo nunca valga para el otro.
  private readonly tabla: typeof tokensDeRecuperacion;

  constructor(
    private readonly contexto: ContextoTransaccional,
    tabla: typeof tokensDeRecuperacion | typeof tokensDeVerificacionDeCorreo = tokensDeRecuperacion,
    private readonly restriccionDeHashUnico = 'tokens_de_recuperacion_hash_unico',
  ) {
    // Las columnas son idénticas: el tipo de una vale para la otra.
    this.tabla = tabla as typeof tokensDeRecuperacion;
  }

  async guardar(token: TokenDeRecuperacion): Promise<void> {
    try {
      await this.contexto
        .conexion()
        .insert(this.tabla)
        .values({
          id: token.id,
          usuarioId: token.usuarioId,
          hashDelToken: Buffer.from(token.hashDelToken),
          creadoEn: token.creadoEn,
          expiraEn: token.expiraEn,
          usadoEn: token.usadoEn,
        });
    } catch (error) {
      if (esViolacionDeUnicidad(error, this.restriccionDeHashUnico)) {
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
      .from(this.tabla)
      .where(eq(this.tabla.hashDelToken, Buffer.from(hash)))
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
      .from(this.tabla)
      .where(eq(this.tabla.hashDelToken, Buffer.from(hash)))
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
      .update(this.tabla)
      .set({
        usadoEn: sql`coalesce(${this.tabla.usadoEn}, ${token.usadoEn}::timestamptz)`,
      })
      .where(eq(this.tabla.id, token.id))
      .returning({ id: this.tabla.id });
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
      .from(this.tabla)
      .where(eq(this.tabla.usuarioId, usuarioId))
      .orderBy(desc(this.tabla.creadoEn))
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
      .update(this.tabla)
      .set({ usadoEn: ahora })
      .where(
        and(
          eq(this.tabla.usuarioId, usuarioId),
          isNull(this.tabla.usadoEn),
        ),
      )
      .returning({ id: this.tabla.id });
    return gastados.length;
  }

  async eliminarVencidosAntesDe(limite: Date): Promise<number> {
    const eliminados = await this.contexto
      .conexion()
      .delete(this.tabla)
      .where(lt(this.tabla.expiraEn, limite))
      .returning({ id: this.tabla.id });
    return eliminados.length;
  }
}
