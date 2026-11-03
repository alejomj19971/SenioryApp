import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { CuidadorId } from '../../dominio/ids.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';

// La foto de perfil de un cuidador QUE SE MUESTRA. Misma regla que `ObtenerCuidador` (E7): un cuidador que no se
// muestra (nunca verificado, suspendido o con un control vencido) responde «no encontrado», igual que si no
// existiera, así nadie llega a él adivinando su identificador, ni siquiera por la foto.
export class ObtenerFotoDeCuidador {
  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly reloj: Reloj,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(id: string): Promise<{ url: string }> {
    const cuidador = await this.cuidadores.buscarPorId(id as CuidadorId);
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    if (
      cuidador === null ||
      !cuidador.visible ||
      !cuidador.esVisible(hoy) ||
      cuidador.fotoUrl === null
    ) {
      throw new RecursoNoEncontrado(
        'Este cuidador no tiene foto de perfil',
        'foto.no_encontrada',
      );
    }
    return { url: cuidador.fotoUrl };
  }
}
