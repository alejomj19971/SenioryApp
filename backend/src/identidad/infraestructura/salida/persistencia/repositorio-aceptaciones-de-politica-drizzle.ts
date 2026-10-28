import { asc, eq } from 'drizzle-orm';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { RepositorioAceptacionesDePolitica } from '../../../aplicacion/puertos/salida/repositorio-aceptaciones-de-politica.js';
import type { AceptacionDePolitica } from '../../../dominio/aceptacion-de-politica.js';
import type { UsuarioId } from '../../../dominio/ids.js';
import { aceptacionesDePolitica } from './identidad.esquema.js';
import { aceptacionDeFila } from './mapeadores.js';

export class RepositorioAceptacionesDePoliticaDrizzle implements RepositorioAceptacionesDePolitica {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(aceptacion: AceptacionDePolitica): Promise<void> {
    await this.contexto
      .conexion()
      .insert(aceptacionesDePolitica)
      .values({
        usuarioId: aceptacion.usuarioId,
        version: aceptacion.version.valor,
        aceptadaEn: aceptacion.aceptadaEn,
      })
      // La primera aceptación de una versión es la prueba; una repetida no la reemplaza.
      .onConflictDoNothing();
  }

  async listarDeUsuario(usuarioId: UsuarioId): Promise<AceptacionDePolitica[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(aceptacionesDePolitica)
      .where(eq(aceptacionesDePolitica.usuarioId, usuarioId))
      .orderBy(asc(aceptacionesDePolitica.aceptadaEn));
    return filas.map(aceptacionDeFila);
  }
}
