import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type {
  AlertaGenerada,
  LecturaFueraDeRango,
  MedicamentoOmitido,
} from '../../../compartido/eventos/teleasistencia.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import type { CrearAvisos } from '../casos-de-uso/crear-avisos.js';

// A quién se avisa de lo que pasa con una persona mayor: sus familiares vinculados y el cuidador que está con ella
// ahora, sin repetir.
async function quienesSeAvisan(
  identidad: ConsultaDeIdentidad,
  reservas: ConsultaDeReservas,
  adultoMayorId: string,
): Promise<string[]> {
  const familiares = await identidad.listarFamiliaresVinculados(adultoMayorId);
  const cuidador = await reservas.obtenerCuidadorEnTurno(adultoMayorId);
  return [
    ...new Set([
      ...familiares,
      ...(cuidador?.cuidadorUsuarioId != null
        ? [cuidador.cuidadorUsuarioId]
        : []),
    ]),
  ];
}

// Una alerta de ayuda sale con PRIORIDAD ALTA: por todos los canales disponibles a la vez, hasta que llegue por al
// menos uno. Los destinatarios ya vienen resueltos en el evento (los decide Teleasistencia). El aviso lleva el
// identificador de la alerta para que, al entregarse, Teleasistencia sepa cuándo salió (E11).
export class AvisarAlerta implements ManejadorDeEventos<AlertaGenerada> {
  readonly nombre = 'notificaciones.avisar_alerta';
  readonly tipo = 'teleasistencia.alerta_generada';

  constructor(
    private readonly identidad: ConsultaDeIdentidad,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: AlertaGenerada): Promise<void> {
    const persona = await this.identidad.obtenerAdultoMayor(
      evento.datos.adultoMayorId,
    );
    // Sin la persona no se sabe de quién es el pedido de ayuda; el evento queda fallido para que alguien lo revise.
    if (persona === null) {
      throw new Error('La persona de la alerta ya no existe');
    }
    // Todos a la vez: uno que falle no debe retrasar a los demás.
    await Promise.all(
      evento.datos.destinatarios.map((destinatarioId) =>
        this.avisos.ejecutar({
          eventoId: evento.id,
          destinatarioId,
          tipo: 'alerta_generada:destinatario',
          prioridad: 'alta',
          parametros: {
            alertaId: evento.datos.alertaId,
            nombre: persona.nombre,
          },
        }),
      ),
    );
  }
}

// Una toma que nadie registró: aviso normal a la familia y al cuidador, sin decir qué medicamento.
export class AvisarMedicamentoOmitido implements ManejadorDeEventos<MedicamentoOmitido> {
  readonly nombre = 'notificaciones.avisar_medicamento_omitido';
  readonly tipo = 'teleasistencia.medicamento_omitido';

  constructor(
    private readonly identidad: ConsultaDeIdentidad,
    private readonly reservas: ConsultaDeReservas,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: MedicamentoOmitido): Promise<void> {
    const destinatarios = await quienesSeAvisan(
      this.identidad,
      this.reservas,
      evento.datos.adultoMayorId,
    );
    for (const destinatarioId of destinatarios) {
      await this.avisos.ejecutar({
        eventoId: evento.id,
        destinatarioId,
        tipo: 'medicamento_omitido:destinatario',
        prioridad: 'normal',
        parametros: {},
      });
    }
  }
}

// Una lectura fuera de los rangos: aviso de prioridad alta, sin decir cuál medida ni cuánto.
export class AvisarLecturaFueraDeRango implements ManejadorDeEventos<LecturaFueraDeRango> {
  readonly nombre = 'notificaciones.avisar_lectura_fuera_de_rango';
  readonly tipo = 'teleasistencia.lectura_fuera_de_rango';

  constructor(
    private readonly identidad: ConsultaDeIdentidad,
    private readonly reservas: ConsultaDeReservas,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: LecturaFueraDeRango): Promise<void> {
    const destinatarios = await quienesSeAvisan(
      this.identidad,
      this.reservas,
      evento.datos.adultoMayorId,
    );
    for (const destinatarioId of destinatarios) {
      await this.avisos.ejecutar({
        eventoId: evento.id,
        destinatarioId,
        tipo: 'lectura_fuera_de_rango:destinatario',
        prioridad: 'alta',
        parametros: {},
      });
    }
  }
}
