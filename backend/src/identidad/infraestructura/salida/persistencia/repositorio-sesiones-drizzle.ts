import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioSesiones } from '../../../aplicacion/puertos/salida/repositorio-sesiones.js';
import type { FamiliaDeSesionesId, UsuarioId } from '../../../dominio/ids.js';
import type { SesionDeRefresco } from '../../../dominio/sesion-de-refresco.js';
import { sesionesRefresco } from './identidad.esquema.js';
import { sesionDeFila } from './mapeadores.js';

export class RepositorioSesionesDrizzle implements RepositorioSesiones {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(sesion: SesionDeRefresco): Promise<void> {
    try {
      await this.contexto
        .conexion()
        .insert(sesionesRefresco)
        .values({
          id: sesion.id,
          usuarioId: sesion.usuarioId,
          familiaId: sesion.familiaId,
          hashDelToken: Buffer.from(sesion.hashDelToken),
          emitidaEn: sesion.emitidaEn,
          expiraEn: sesion.expiraEn,
          reemplazadaEn: sesion.reemplazadaEn,
          reemplazadaPor: sesion.reemplazadaPor,
          revocadaEn: sesion.revocadaEn,
        });
    } catch (error) {
      if (esViolacionDeUnicidad(error, 'sesiones_refresco_hash_unico')) {
        // Con 256 bits aleatorios no ocurre por azar: indicaría un generador de tokens roto.
        throw new ConflictoDeEstado(
          'Ya existe una sesión con ese token',
          'sesion.token_repetido',
        );
      }
      throw error;
    }
  }

  async buscarPorHashDelToken(
    hash: Uint8Array,
  ): Promise<SesionDeRefresco | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(sesionesRefresco)
      .where(eq(sesionesRefresco.hashDelToken, Buffer.from(hash)))
      .limit(1)
      // NO KEY UPDATE: la fila cambia (reemplazo, revocación) pero nunca su clave.
      .for('no key update');
    const fila = filas[0];
    return fila === undefined ? null : sesionDeFila(fila);
  }

  async actualizar(sesion: SesionDeRefresco): Promise<void> {
    // coalesce: si la base ya tiene una marca, se conserva. La primera es la que cuenta para la
    // ventana de gracia; sobrescribirla la extendería con cada renovación simultánea.
    const actualizadas = await this.contexto
      .conexion()
      .update(sesionesRefresco)
      .set({
        reemplazadaEn: sql`coalesce(${sesionesRefresco.reemplazadaEn}, ${sesion.reemplazadaEn}::timestamptz)`,
        reemplazadaPor: sql`coalesce(${sesionesRefresco.reemplazadaPor}, ${sesion.reemplazadaPor}::uuid)`,
        revocadaEn: sql`coalesce(${sesionesRefresco.revocadaEn}, ${sesion.revocadaEn}::timestamptz)`,
      })
      .where(eq(sesionesRefresco.id, sesion.id))
      .returning({ id: sesionesRefresco.id });
    if (actualizadas.length === 0) {
      throw new RecursoNoEncontrado(
        'La sesión no existe',
        'sesion.no_encontrada',
      );
    }
  }

  async revocarFamilia(
    familiaId: FamiliaDeSesionesId,
    ahora: Date,
  ): Promise<number> {
    const revocadas = await this.contexto
      .conexion()
      .update(sesionesRefresco)
      .set({ revocadaEn: ahora })
      .where(
        and(
          eq(sesionesRefresco.familiaId, familiaId),
          isNull(sesionesRefresco.revocadaEn),
        ),
      )
      .returning({ id: sesionesRefresco.id });
    return revocadas.length;
  }

  async revocarTodasDeUsuario(
    usuarioId: UsuarioId,
    ahora: Date,
  ): Promise<number> {
    const revocadas = await this.contexto
      .conexion()
      .update(sesionesRefresco)
      .set({ revocadaEn: ahora })
      .where(
        and(
          eq(sesionesRefresco.usuarioId, usuarioId),
          isNull(sesionesRefresco.revocadaEn),
        ),
      )
      .returning({ id: sesionesRefresco.id });
    return revocadas.length;
  }

  async eliminarVencidasAntesDe(limite: Date): Promise<number> {
    // Una sola sentencia: una sesión reemplazada apunta a la que la reemplazó, y si una vence antes
    // de `limite` la otra también (se emitió después), así que salen juntas sin romper la referencia.
    const eliminadas = await this.contexto
      .conexion()
      .delete(sesionesRefresco)
      .where(lt(sesionesRefresco.expiraEn, limite))
      .returning({ id: sesionesRefresco.id });
    return eliminadas.length;
  }
}
