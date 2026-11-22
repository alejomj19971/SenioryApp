import {
  ErrorDeValidacion,
  RecursoNoEncontrado,
  ReglaDeNegocioIncumplida,
} from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDePagos } from '../../../pagos/aplicacion/puertos/entrada/consulta-de-pagos.js';
import type { CotizadorDeServicios } from '../../../pagos/aplicacion/puertos/entrada/cotizador-de-servicios.js';
import { esHoraInicioValida, jornadaDe } from '../../dominio/franjas.js';
import type { Servicio } from '../../dominio/servicio.js';
import type { EjecutorDeAcciones } from '../servicios/ejecutor-de-acciones.js';
import {
  participantesDe,
  type EventosDeReservas,
} from '../servicios/eventos-de-reservas.js';

export interface EntradaDeModificacion {
  // "AAAA-MM-DD", el día civil en la zona del negocio.
  fecha: string;
  // Minutos desde las 00:00 de esa fecha, en bloques de 30.
  horaInicio: number;
  horas: number;
}

// La familia cambia fecha/hora/horas de una solicitud que el cuidador todavía no respondió: evita tener que
// cancelarla y pedir una nueva solo porque cambió un detalle del horario. El monto se recalcula con la
// cotización vigente, igual que al pedir (E10): el servicio modificado queda con un desglose nuevo, como si
// fuera una solicitud nueva. Una vez aceptado ya no se puede: ahí corresponde cancelar y pedir de nuevo.
export class ModificarServicio {
  constructor(
    private readonly ejecutor: EjecutorDeAcciones,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly cotizador: CotizadorDeServicios,
    private readonly pagos: ConsultaDePagos,
    private readonly eventos: EventosDeReservas,
    private readonly zonaHoraria: string,
  ) {}

  ejecutar(
    familiarId: string,
    servicioId: string,
    entrada: EntradaDeModificacion,
  ): Promise<Servicio> {
    const fecha = FechaCivil.desdeTexto(entrada.fecha);
    if (!esHoraInicioValida(entrada.horaInicio)) {
      throw new ErrorDeValidacion(
        'La hora de inicio no es válida',
        'servicio.hora_invalida',
      );
    }
    return this.ejecutor.ejecutar(servicioId, familiarId, {
      nombre: 'reservas.modificar_servicio',
      rol: 'familiar',
      aplicar: async (servicio, ahora) => {
        const cuidador = await this.directorio.obtenerCuidadorParaContratar(
          servicio.cuidadorId,
        );
        if (cuidador === null) {
          throw new RecursoNoEncontrado(
            'No encontramos a ese cuidador',
            'cuidador.no_encontrado',
          );
        }
        if (!cuidador.disponibilidad.includes(jornadaDe(entrada.horaInicio))) {
          throw new ReglaDeNegocioIncumplida(
            `${cuidador.nombre} no atiende en esa jornada`,
            'servicio.jornada_no_disponible',
          );
        }
        const cotizacion = await this.cotizador.cotizar(
          servicio.cuidadorId,
          entrada.horas,
        );
        if (
          servicio.medioDePago === 'bolsa' &&
          !(await this.pagos.bolsaAlcanzaPara(
            familiarId,
            cotizacion.totalFamilia,
          ))
        ) {
          throw new ReglaDeNegocioIncumplida(
            'No tienes saldo suficiente en tu bolsa para este servicio',
            'bolsa.saldo_insuficiente',
          );
        }
        servicio.modificar(
          {
            fecha,
            horaInicio: entrada.horaInicio,
            horas: entrada.horas,
            tarifaHora: cotizacion.tarifaHora,
            subtotal: cotizacion.subtotal,
            cargoFamilia: cotizacion.cargoFamilia,
            totalFamilia: cotizacion.totalFamilia,
            pagoProfesional: cotizacion.pagoProfesional,
            politicaVersion: cotizacion.politicaVersion,
            hoy: FechaCivil.hoy({ ahora: () => ahora }, this.zonaHoraria),
            ahora,
            zonaHoraria: this.zonaHoraria,
          },
          familiarId,
        );
      },
      anunciar: (servicio, ahora) =>
        this.eventos.publicar(
          'reservas.servicio_modificado',
          participantesDe(servicio),
          ahora,
        ),
    });
  }
}
