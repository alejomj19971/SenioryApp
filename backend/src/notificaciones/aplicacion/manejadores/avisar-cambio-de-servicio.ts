import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type { EventoDeReservas } from '../../../compartido/eventos/reservas.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import type { Parametros } from '../../dominio/valores-cerrados.js';
import type { CrearAvisos } from '../casos-de-uso/crear-avisos.js';

type EventoDeCicloDeVida = Exclude<
  EventoDeReservas,
  { tipo: 'reservas.servicio_calificado' }
>;

// Cuando cambia el estado de un servicio, avisa a las dos partes: la familia y el cuidador, cada una con su
// propio texto. Un manejador por tipo de evento (cada uno con su nombre estable, que el despachador guarda).
//
// Los avisos solo llevan fecha, franja, horas y motivo: nada clínico ni nombres (minimización). El texto lo arma
// después la plantilla; aquí solo se deciden a quién y qué datos.
export class AvisarCambioDeServicio<
  E extends EventoDeCicloDeVida,
> implements ManejadorDeEventos<E> {
  constructor(
    readonly tipo: E['tipo'],
    readonly nombre: string,
    private readonly reservas: ConsultaDeReservas,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: E): Promise<void> {
    const servicio = await this.reservas.obtenerServicio(
      evento.datos.servicioId,
    );
    // Sin servicio no hay nada que decir.
    if (servicio === null) return;

    const parametros: Parametros = {
      servicioId: servicio.id,
      fecha: servicio.fecha,
      jornada: servicio.jornada,
      horas: servicio.horas,
    };
    if (evento.tipo === 'reservas.servicio_cancelado') {
      parametros.motivo = evento.datos.motivo;
    }
    const base = evento.tipo.replace('reservas.', '');

    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId: servicio.familiarId,
      tipo: `${base}:familia`,
      prioridad: 'normal',
      parametros,
    });
    // El cuidador puede no tener cuenta todavía (datos de desarrollo): entonces no hay a quién avisar.
    const cuidador = await this.directorio.obtenerContactoDeCuidador(
      servicio.cuidadorId,
    );
    if (cuidador?.usuarioId != null) {
      await this.avisos.ejecutar({
        eventoId: evento.id,
        destinatarioId: cuidador.usuarioId,
        tipo: `${base}:cuidador`,
        prioridad: 'normal',
        parametros,
      });
    }
  }
}
