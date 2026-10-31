import { desc, eq, lte } from 'drizzle-orm';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { RepositorioPoliticasDePrecios } from '../../../aplicacion/puertos/salida/repositorio-politicas-de-precios.js';
import { PoliticaDePrecios } from '../../../dominio/politica-de-precios.js';
import { politicasDePrecios } from './pagos.esquema.js';

function politicaDeFila(
  fila: typeof politicasDePrecios.$inferSelect,
): PoliticaDePrecios {
  return PoliticaDePrecios.crear({
    version: fila.version,
    comisionFamiliaBps: fila.comisionFamiliaBps,
    comisionProfesionalBps: fila.comisionProfesionalBps,
    vigenteDesde: fila.vigenteDesde,
  });
}

export class RepositorioPoliticasDePreciosDrizzle implements RepositorioPoliticasDePrecios {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async obtenerVigente(ahora: Date): Promise<PoliticaDePrecios | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(politicasDePrecios)
      .where(lte(politicasDePrecios.vigenteDesde, ahora))
      // Si dos empiezan a regir en el mismo instante, gana la versión más nueva.
      .orderBy(
        desc(politicasDePrecios.vigenteDesde),
        desc(politicasDePrecios.version),
      )
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : politicaDeFila(fila);
  }

  async buscarPorVersion(version: number): Promise<PoliticaDePrecios | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(politicasDePrecios)
      .where(eq(politicasDePrecios.version, version))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : politicaDeFila(fila);
  }
}
