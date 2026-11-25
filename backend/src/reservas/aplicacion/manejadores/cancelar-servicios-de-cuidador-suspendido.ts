import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { CuidadorSuspendido } from '../../../compartido/eventos/directorio.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';
import {
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

// Tope de servicios que se cancelan en una pasada: de sobra para un cuidador (los pendientes son pocos), y evita una
// transacción sin fin si algo estuviera mal.
const LIMITE_POR_PASADA = 1_000;

// Cuando un administrador suspende a un cuidador, lo que él aún no empezó (solicitado o aceptado) no se va a prestar:
// cada servicio se cancela con motivo «cuidador_suspendido» y se avisa como cualquier cancelación. Notificaciones les
// cuenta a la familia y al cuidador, y Pagos devuelve TODO el dinero (no es una cancelación de la familia, así que nunca
// cuenta como tardía). Un servicio ya en curso se deja terminar. Es idempotente: si el evento se repite, ya no queda nada
// pendiente.
export class CancelarServiciosDeCuidadorSuspendido implements ManejadorDeEventos<CuidadorSuspendido> {
  readonly nombre = 'reservas.cancelar_servicios_de_cuidador_suspendido';
  readonly tipo = 'directorio.cuidador_suspendido';

  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly eventos: EventosDeReservas,
    private readonly reloj: Reloj,
  ) {}

  async manejar(evento: CuidadorSuspendido): Promise<void> {
    const pendientes = await this.servicios.listarPendientesDeCuidador(
      evento.datos.cuidadorId,
      LIMITE_POR_PASADA,
    );
    for (const id of pendientes) {
      const servicio = await this.servicios.buscarPorIdParaActualizar(id);
      // Pudo cambiar entre la lista y el bloqueo (el cuidador lo inició, la familia lo canceló): ya no es de esta pasada.
      if (
        servicio?.estado !== 'solicitado' &&
        servicio?.estado !== 'aceptado'
      ) {
        continue;
      }
      const ahora = this.reloj.ahora();
      servicio.cancelarPorSuspension(ahora);
      await this.servicios.actualizar(servicio);
      await this.eventos.publicar(
        'reservas.servicio_cancelado',
        {
          ...participantesDe(servicio),
          motivo: 'cuidador_suspendido',
          horasDeAnticipacion: null,
        },
        ahora,
      );
    }
  }
}
