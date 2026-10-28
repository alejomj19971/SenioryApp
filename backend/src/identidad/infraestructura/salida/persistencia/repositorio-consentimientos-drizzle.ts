import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioConsentimientos } from '../../../aplicacion/puertos/salida/repositorio-consentimientos.js';
import type { Consentimiento } from '../../../dominio/consentimiento.js';
import type { AdultoMayorId, ConsentimientoId } from '../../../dominio/ids.js';
import type { FinalidadDeConsentimiento } from '../../../dominio/valores-cerrados.js';
import { consentimientos } from './identidad.esquema.js';
import { consentimientoDeFila } from './mapeadores.js';

export class RepositorioConsentimientosDrizzle implements RepositorioConsentimientos {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(consentimiento: Consentimiento): Promise<void> {
    try {
      await this.contexto.conexion().insert(consentimientos).values({
        id: consentimiento.id,
        adultoMayorId: consentimiento.adultoMayorId,
        finalidad: consentimiento.finalidad,
        otorgadoPor: consentimiento.otorgadoPor,
        calidad: consentimiento.calidad,
        versionDelTexto: consentimiento.versionDelTexto.valor,
        otorgadoEn: consentimiento.otorgadoEn,
        revocadoEn: consentimiento.revocadoEn,
      });
    } catch (error) {
      if (esViolacionDeUnicidad(error, 'consentimientos_vigente_unico')) {
        throw new ConflictoDeEstado(
          'Ya hay un consentimiento vigente para esta persona y esta finalidad',
          'consentimiento.ya_vigente',
        );
      }
      throw error;
    }
  }

  async actualizar(consentimiento: Consentimiento): Promise<void> {
    const actualizados = await this.contexto
      .conexion()
      .update(consentimientos)
      .set({ revocadoEn: consentimiento.revocadoEn })
      .where(eq(consentimientos.id, consentimiento.id))
      .returning({ id: consentimientos.id });
    if (actualizados.length === 0) {
      throw new RecursoNoEncontrado(
        'El consentimiento no existe',
        'consentimiento.no_encontrado',
      );
    }
  }

  async buscarPorId(id: ConsentimientoId): Promise<Consentimiento | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(consentimientos)
      .where(eq(consentimientos.id, id))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : consentimientoDeFila(fila);
  }

  async buscarVigente(
    adultoMayorId: AdultoMayorId,
    finalidad: FinalidadDeConsentimiento,
  ): Promise<Consentimiento | null> {
    const filas = await this.listarVigentesDe([adultoMayorId], finalidad);
    return filas[0] ?? null;
  }

  async listarVigentesDe(
    adultoMayorIds: readonly AdultoMayorId[],
    finalidad: FinalidadDeConsentimiento,
  ): Promise<Consentimiento[]> {
    if (adultoMayorIds.length === 0) return [];
    const filas = await this.contexto
      .conexion()
      .select()
      .from(consentimientos)
      .where(
        and(
          inArray(consentimientos.adultoMayorId, [...adultoMayorIds]),
          eq(consentimientos.finalidad, finalidad),
          isNull(consentimientos.revocadoEn),
        ),
      );
    return filas.map(consentimientoDeFila);
  }
}
