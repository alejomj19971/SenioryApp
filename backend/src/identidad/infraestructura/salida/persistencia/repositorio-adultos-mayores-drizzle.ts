import { eq, inArray } from 'drizzle-orm';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { RepositorioAdultosMayores } from '../../../aplicacion/puertos/salida/repositorio-adultos-mayores.js';
import type { AdultoMayor } from '../../../dominio/adulto-mayor.js';
import type { AdultoMayorId } from '../../../dominio/ids.js';
import { adultosMayores } from './identidad.esquema.js';
import { adultoMayorDeFila } from './mapeadores.js';

export class RepositorioAdultosMayoresDrizzle implements RepositorioAdultosMayores {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(adultoMayor: AdultoMayor): Promise<void> {
    await this.contexto.conexion().insert(adultosMayores).values({
      id: adultoMayor.id,
      nombre: adultoMayor.nombre.valor,
      fechaDeNacimiento: adultoMayor.fechaDeNacimiento.aTexto(),
      fotoUrl: adultoMayor.fotoUrl,
      usuarioId: adultoMayor.usuarioId,
      creadoPor: adultoMayor.creadoPor,
      creadoEn: adultoMayor.creadoEn,
      actualizadoEn: adultoMayor.actualizadoEn,
    });
  }

  async buscarPorId(id: AdultoMayorId): Promise<AdultoMayor | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(adultosMayores)
      .where(eq(adultosMayores.id, id))
      .limit(1);
    const fila = filas[0];
    return fila === undefined ? null : adultoMayorDeFila(fila);
  }

  async listarPorIds(ids: readonly AdultoMayorId[]): Promise<AdultoMayor[]> {
    if (ids.length === 0) return [];
    const filas = await this.contexto
      .conexion()
      .select()
      .from(adultosMayores)
      .where(inArray(adultosMayores.id, [...ids]));
    return filas.map(adultoMayorDeFila);
  }
}
