import { ConflictoDeEstado } from '../../../compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { Servicio } from '../../dominio/servicio.js';
import type { EjecutorDeAcciones } from '../servicios/ejecutor-de-acciones.js';
import {
  cobroDe,
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

// Lo que el cuidador hace con SUS servicios. Quien no es el cuidador del servicio recibe «no encontrado».

export class AceptarServicio {
  constructor(
    private readonly ejecutor: EjecutorDeAcciones,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly eventos: EventosDeReservas,
  ) {}

  ejecutar(cuidadorUsuarioId: string, servicioId: string): Promise<Servicio> {
    return this.ejecutor.ejecutar(servicioId, cuidadorUsuarioId, {
      nombre: 'reservas.aceptar_servicio',
      rol: 'cuidador',
      aplicar: async (servicio, ahora) => {
        // Sigue verificado: si se le venció un control desde que lo pidieron, ya no puede aceptar.
        if (
          (await this.directorio.obtenerCuidadorParaContratar(
            servicio.cuidadorId,
          )) === null
        ) {
          throw new ConflictoDeEstado(
            'Ya no puedes aceptar servicios: revisa el estado de tu perfil',
            'servicio.cuidador_no_disponible',
          );
        }
        servicio.aceptar(cuidadorUsuarioId, ahora);
      },
      // La confirmación dispara el cobro (M7) y el aviso a la familia (M5).
      anunciar: (servicio, ahora) =>
        this.eventos.publicar(
          'reservas.servicio_confirmado',
          { ...participantesDe(servicio), cobro: cobroDe(servicio) },
          ahora,
        ),
    });
  }
}

export class RechazarServicio {
  constructor(
    private readonly ejecutor: EjecutorDeAcciones,
    private readonly eventos: EventosDeReservas,
  ) {}

  ejecutar(cuidadorUsuarioId: string, servicioId: string): Promise<Servicio> {
    return this.ejecutor.ejecutar(servicioId, cuidadorUsuarioId, {
      nombre: 'reservas.rechazar_servicio',
      rol: 'cuidador',
      aplicar: (servicio, ahora) => servicio.rechazar(cuidadorUsuarioId, ahora),
      anunciar: (servicio, ahora) =>
        this.eventos.publicar(
          'reservas.servicio_cancelado',
          {
            ...participantesDe(servicio),
            motivo: 'rechazada',
            horasDeAnticipacion: null,
          },
          ahora,
        ),
    });
  }
}

export class IniciarServicio {
  constructor(
    private readonly ejecutor: EjecutorDeAcciones,
    private readonly eventos: EventosDeReservas,
    private readonly zonaHoraria: string,
    // Con true (producción) el servicio no inicia hasta que Pagos avise que el pago está aprobado.
    private readonly exigirPago: boolean,
  ) {}

  ejecutar(cuidadorUsuarioId: string, servicioId: string): Promise<Servicio> {
    return this.ejecutor.ejecutar(servicioId, cuidadorUsuarioId, {
      nombre: 'reservas.iniciar_servicio',
      rol: 'cuidador',
      aplicar: (servicio, ahora) =>
        servicio.iniciar(
          cuidadorUsuarioId,
          ahora,
          this.zonaHoraria,
          this.exigirPago,
        ),
      anunciar: (servicio, ahora) =>
        this.eventos.publicar(
          'reservas.servicio_iniciado',
          participantesDe(servicio),
          ahora,
        ),
    });
  }
}

export class FinalizarServicio {
  constructor(
    private readonly ejecutor: EjecutorDeAcciones,
    private readonly eventos: EventosDeReservas,
  ) {}

  ejecutar(cuidadorUsuarioId: string, servicioId: string): Promise<Servicio> {
    return this.ejecutor.ejecutar(servicioId, cuidadorUsuarioId, {
      nombre: 'reservas.finalizar_servicio',
      rol: 'cuidador',
      aplicar: (servicio, ahora) =>
        servicio.finalizar(cuidadorUsuarioId, ahora),
      // Habilita la calificación, suma al contador del cuidador (Directorio) y liquida su pago (M7).
      anunciar: (servicio, ahora) =>
        this.eventos.publicar(
          'reservas.servicio_finalizado',
          participantesDe(servicio),
          ahora,
        ),
    });
  }
}
