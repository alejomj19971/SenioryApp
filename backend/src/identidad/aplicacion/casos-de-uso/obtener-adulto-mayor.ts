import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import type { AdultoMayorId, UsuarioId } from '../../dominio/ids.js';
import type { RepositorioVinculos } from '../puertos/salida/repositorio-vinculos.js';
import type { VistasDeAdultosMayores } from '../servicios/vistas-de-adultos-mayores.js';
import type { VistaDeAdultoMayor } from '../vistas.js';

// Una persona mayor, vista por un familiar vinculado. Quien no está vinculado recibe «no encontrado»,
// igual que si la persona no existiera: no se revela que existe (IDOR). El intento queda auditado.
export class ObtenerAdultoMayor {
  constructor(
    private readonly vinculos: RepositorioVinculos,
    private readonly vistas: VistasDeAdultosMayores,
    private readonly auditoria: Auditoria,
  ) {}

  async ejecutar(
    usuarioId: string,
    adultoMayorId: string,
  ): Promise<VistaDeAdultoMayor> {
    const vinculo = await this.vinculos.buscarActivo(
      usuarioId as UsuarioId,
      adultoMayorId as AdultoMayorId,
    );
    const [vista] = vinculo === null ? [] : await this.vistas.de([vinculo]);
    if (vista === undefined) {
      await this.auditoria.registrar({
        actorId: usuarioId,
        accion: 'identidad.consultar_adulto_mayor',
        recursoTipo: 'adulto_mayor',
        recursoId: adultoMayorId,
        resultado: 'denegado',
      });
      throw new RecursoNoEncontrado(
        'No encontramos a esa persona',
        'adulto_mayor.no_encontrado',
      );
    }
    return vista;
  }
}
