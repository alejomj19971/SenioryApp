import type { ContextoDePeticion } from '../../../compartido/aplicacion/puertos/contexto-de-peticion.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { PublicadorDeEventos } from '../../../compartido/aplicacion/puertos/publicador-de-eventos.js';
import type {
  CondicionesDeCobro,
  EventoDeReservas,
} from '../../../compartido/eventos/reservas.js';
import type { Servicio } from '../../dominio/servicio.js';

type DatosDe<Tipo extends EventoDeReservas['tipo']> = Extract<
  EventoDeReservas,
  { tipo: Tipo }
>['datos'];

// Los datos que comparten todos los eventos del ciclo de vida del servicio.
export function participantesDe(servicio: Servicio) {
  return {
    servicioId: servicio.id,
    familiarId: servicio.familiarId,
    cuidadorId: servicio.cuidadorId,
    adultoMayorId: servicio.adultoMayorId,
  };
}

// Con qué condiciones se contrató el servicio: Pagos las recalcula y las compara antes de cobrar.
export function cobroDe(servicio: Servicio): CondicionesDeCobro {
  return {
    medioDePago: servicio.medioDePago,
    horas: servicio.horas,
    tarifaHora: servicio.tarifaHora,
    politicaVersion: servicio.politicaVersion,
    totalFamilia: servicio.totalFamilia,
    pagoProfesional: servicio.pagoProfesional,
  };
}

// Arma el sobre común de los eventos de Reservas (ID, versión, hora y correlación) y los guarda en el outbox.
// Debe usarse dentro de una unidad de trabajo, como todo el publicador.
export class EventosDeReservas {
  constructor(
    private readonly publicador: PublicadorDeEventos,
    private readonly ids: GeneradorDeIds,
    private readonly contexto: ContextoDePeticion,
  ) {}

  publicar<Tipo extends EventoDeReservas['tipo']>(
    tipo: Tipo,
    datos: DatosDe<Tipo>,
    ahora: Date,
  ): Promise<void> {
    return this.publicador.publicar({
      id: this.ids.nuevo(),
      tipo,
      version: 1,
      ocurridoEn: ahora.toISOString(),
      idDeCorrelacion: this.contexto.idDeCorrelacion(),
      datos,
    });
  }
}
