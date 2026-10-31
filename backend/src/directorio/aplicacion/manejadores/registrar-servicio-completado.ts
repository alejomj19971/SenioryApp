import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import type { ServicioFinalizado } from '../../../compartido/eventos/reservas.js';
import type { CuidadorId } from '../../dominio/ids.js';
import type { RepositorioCuidadores } from '../puertos/salida/repositorio-cuidadores.js';

// Cuando un servicio termina (Reservas), se suma al contador de servicios completados del cuidador. Es un
// valor derivado: nadie lo edita a mano (H12). El despachador ya garantiza «una vez por evento», y un
// servicio solo puede finalizar una vez (lo impide la máquina de estados de Reservas).
export class RegistrarServicioCompletado implements ManejadorDeEventos<ServicioFinalizado> {
  readonly nombre = 'directorio.registrar_servicio_completado';
  readonly tipo = 'reservas.servicio_finalizado';

  constructor(
    private readonly cuidadores: RepositorioCuidadores,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: ServicioFinalizado): Promise<void> {
    // Con la fila bloqueada: una reseña y un servicio terminado del mismo cuidador no se pisan.
    const cuidador = await this.cuidadores.buscarPorIdParaActualizar(
      evento.datos.cuidadorId as CuidadorId,
    );
    if (cuidador === null) {
      // Falla para que el evento quede marcado como fallido y alguien lo revise, en vez de perderlo.
      throw new RecursoNoEncontrado(
        'El cuidador del servicio no existe',
        'cuidador.no_encontrado',
      );
    }
    cuidador.registrarServicioCompletado(this.reloj.ahora());
    await this.cuidadores.actualizar(cuidador);
  }
}
