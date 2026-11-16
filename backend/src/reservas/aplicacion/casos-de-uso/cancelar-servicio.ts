import type { Servicio } from '../../dominio/servicio.js';
import type { EjecutorDeAcciones } from '../servicios/ejecutor-de-acciones.js';
import {
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

// La familia cancela un servicio que aún no empezó (solicitado o aceptado). El evento lleva cuántas horas de
// anticipación tuvo la cancelación, y Pagos decide el
// reembolso con la política que defina el negocio (M7).
export class CancelarServicio {
  constructor(
    private readonly ejecutor: EjecutorDeAcciones,
    private readonly eventos: EventosDeReservas,
    private readonly zonaHoraria: string,
  ) {}

  ejecutar(familiarId: string, servicioId: string): Promise<Servicio> {
    return this.ejecutor.ejecutar(servicioId, familiarId, {
      nombre: 'reservas.cancelar_servicio',
      rol: 'familiar',
      aplicar: (servicio, ahora) => servicio.cancelar(familiarId, ahora),
      anunciar: (servicio, ahora) =>
        this.eventos.publicar(
          'reservas.servicio_cancelado',
          {
            ...participantesDe(servicio),
            motivo: 'cancelada_por_familia',
            horasDeAnticipacion: servicio.horasDeAnticipacion(
              ahora,
              this.zonaHoraria,
            ),
          },
          ahora,
        ),
    });
  }
}

// El cuidador ya había aceptado, pero avisa que no puede prestarlo. A diferencia de `CancelarServicio`
// (familiar), solo admite un servicio «aceptado»: uno «solicitado» todavía no es un compromiso suyo (ahí
// corresponde `RechazarServicio`), y uno «en_curso» ya se está prestando.
export class CancelarServicioPorCuidador {
  constructor(
    private readonly ejecutor: EjecutorDeAcciones,
    private readonly eventos: EventosDeReservas,
    private readonly zonaHoraria: string,
  ) {}

  ejecutar(cuidadorUsuarioId: string, servicioId: string): Promise<Servicio> {
    return this.ejecutor.ejecutar(servicioId, cuidadorUsuarioId, {
      nombre: 'reservas.cancelar_servicio_cuidador',
      rol: 'cuidador',
      aplicar: (servicio, ahora) =>
        servicio.cancelarPorCuidador(cuidadorUsuarioId, ahora),
      anunciar: (servicio, ahora) =>
        this.eventos.publicar(
          'reservas.servicio_cancelado',
          {
            ...participantesDe(servicio),
            motivo: 'cancelada_por_cuidador',
            horasDeAnticipacion: servicio.horasDeAnticipacion(
              ahora,
              this.zonaHoraria,
            ),
          },
          ahora,
        ),
    });
  }
}
