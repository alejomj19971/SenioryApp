import { and, asc, eq } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioVinculos } from '../../../aplicacion/puertos/salida/repositorio-vinculos.js';
import type { AdultoMayorId, UsuarioId } from '../../../dominio/ids.js';
import type { Vinculo } from '../../../dominio/vinculo.js';
import { vinculos } from './identidad.esquema.js';
import { vinculoDeFila } from './mapeadores.js';

export class RepositorioVinculosDrizzle implements RepositorioVinculos {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(vinculo: Vinculo): Promise<void> {
    try {
      await this.contexto.conexion().insert(vinculos).values({
        id: vinculo.id,
        familiarId: vinculo.familiarId,
        adultoMayorId: vinculo.adultoMayorId,
        parentesco: vinculo.parentesco,
        esResponsable: vinculo.esResponsable,
        estado: vinculo.estado,
        creadoEn: vinculo.creadoEn,
        revocadoEn: vinculo.revocadoEn,
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error, 'vinculos_activo_unico')) {
        throw new ConflictoDeEstado(
          'Ya existe un vínculo activo con esta persona',
          'vinculo.ya_existe',
        );
      }
      throw error;
    }
  }

  async actualizar(vinculo: Vinculo): Promise<void> {
    const actualizados = await this.contexto
      .conexion()
      .update(vinculos)
      .set({ estado: vinculo.estado, revocadoEn: vinculo.revocadoEn })
      .where(eq(vinculos.id, vinculo.id))
      .returning({ id: vinculos.id });
    if (actualizados.length === 0) {
      throw new RecursoNoEncontrado(
        'El vínculo no existe',
        'vinculo.no_encontrado',
      );
    }
  }

  async buscarActivo(
    familiarId: UsuarioId,
    adultoMayorId: AdultoMayorId,
  ): Promise<Vinculo | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(vinculos)
      .where(
        and(
          eq(vinculos.familiarId, familiarId),
          eq(vinculos.adultoMayorId, adultoMayorId),
          eq(vinculos.estado, 'activo'),
        ),
      )
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : vinculoDeFila(fila);
  }

  async listarActivosDeFamiliar(familiarId: UsuarioId): Promise<Vinculo[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(vinculos)
      .where(
        and(eq(vinculos.familiarId, familiarId), eq(vinculos.estado, 'activo')),
      )
      .orderBy(asc(vinculos.creadoEn), asc(vinculos.id));
    return filas.map(vinculoDeFila);
  }

  async listarActivosDeAdultoMayor(
    adultoMayorId: AdultoMayorId,
  ): Promise<Vinculo[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(vinculos)
      .where(
        and(
          eq(vinculos.adultoMayorId, adultoMayorId),
          eq(vinculos.estado, 'activo'),
        ),
      )
      .orderBy(asc(vinculos.creadoEn), asc(vinculos.id));
    return filas.map(vinculoDeFila);
  }
}
