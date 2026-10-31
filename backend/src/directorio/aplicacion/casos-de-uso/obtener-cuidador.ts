import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { CuidadorId } from '../../dominio/ids.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';
import type { RepositorioResenas } from '../puertos/salida/repositorio-resenas.js';
import {
  vistaDeCuidador,
  vistaDeResena,
  type VistaDeCuidadorConResenas,
} from '../vistas.js';

export const RESENAS_EN_EL_PERFIL = 20;

// El perfil de un cuidador con sus reseñas más recientes. Quien no se muestra (nunca verificado,
// suspendido o con un control vencido) recibe «no encontrado», igual que si no existiera: así nadie puede
// llegar a un cuidador no verificado adivinando su identificador (E7).
export class ObtenerCuidador {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly resenas: RepositorioResenas,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(id: string): Promise<VistaDeCuidadorConResenas> {
    const cuidador = await this.cuidadores.buscarPorId(id as CuidadorId);
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    // Además de la marca `visible`, se vuelve a comprobar la vigencia de hoy: un control que venció esta
    // madrugada deja de mostrarse aunque la revisión diaria todavía no haya corrido.
    if (cuidador === null || !cuidador.visible || !cuidador.esVisible(hoy)) {
      throw new RecursoNoEncontrado(
        'No encontramos a ese cuidador',
        'cuidador.no_encontrado',
      );
    }
    const resenas = await this.resenas.listarVisiblesDeCuidador(
      cuidador.id,
      RESENAS_EN_EL_PERFIL,
    );
    return {
      ...vistaDeCuidador(cuidador),
      resenas: resenas.map(vistaDeResena),
    };
  }
}
