import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type {
  BolsaComprada,
  PagoReembolsado,
  PagoRechazado,
  PagoRequerido,
} from '../../../compartido/eventos/pagos.js';
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import type { Parametros } from '../../dominio/valores-cerrados.js';
import type { CrearAvisos } from '../casos-de-uso/crear-avisos.js';

// Los datos del servicio que el texto de un aviso de pago necesita: cuándo es. Si el servicio ya no existe, no hay
// nada que decir.
async function datosDelServicio(
  reservas: ConsultaDeReservas,
  servicioId: string,
): Promise<Parametros | null> {
  const servicio = await reservas.obtenerServicio(servicioId);
  if (servicio === null) return null;
  return {
    servicioId: servicio.id,
    fecha: servicio.fecha,
    jornada: servicio.jornada,
    horas: servicio.horas,
  };
}

// El servicio está confirmado y hay que pagarlo con la pasarela: se avisa a la familia. Los avisos de pago no llevan
// montos: dicen que hay algo por hacer y mandan a abrir Seniory.
export class AvisarPagoRequerido implements ManejadorDeEventos<PagoRequerido> {
  readonly nombre = 'notificaciones.avisar_pago_requerido';
  readonly tipo = 'pagos.pago_requerido';

  constructor(
    private readonly reservas: ConsultaDeReservas,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: PagoRequerido): Promise<void> {
    const parametros = await datosDelServicio(
      this.reservas,
      evento.datos.servicioId,
    );
    if (parametros === null) return;
    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId: evento.datos.pagadorId,
      tipo: 'pago_requerido:familia',
      prioridad: 'normal',
      parametros,
    });
  }
}

// Se devolvió el dinero (o se liberó el saldo de la bolsa) de un servicio cancelado.
export class AvisarPagoReembolsado implements ManejadorDeEventos<PagoReembolsado> {
  readonly nombre = 'notificaciones.avisar_pago_reembolsado';
  readonly tipo = 'pagos.pago_reembolsado';

  constructor(
    private readonly reservas: ConsultaDeReservas,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: PagoReembolsado): Promise<void> {
    if (evento.datos.servicioId === null) return;
    const parametros = await datosDelServicio(
      this.reservas,
      evento.datos.servicioId,
    );
    if (parametros === null) return;
    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId: evento.datos.pagadorId,
      tipo: 'pago_reembolsado:familia',
      prioridad: 'normal',
      parametros,
    });
  }
}

// No se completó la compra de una bolsa. Cuando falla el pago de un SERVICIO no se avisa aquí: Reservas lo cancela y
// el aviso de la cancelación ya explica el motivo (dos avisos por lo mismo serían ruido).
export class AvisarCompraDeBolsaFallida implements ManejadorDeEventos<PagoRechazado> {
  readonly nombre = 'notificaciones.avisar_compra_de_bolsa_fallida';
  readonly tipo = 'pagos.pago_rechazado';

  constructor(private readonly avisos: CrearAvisos) {}

  async manejar(evento: PagoRechazado): Promise<void> {
    if (evento.datos.servicioId !== null) return;
    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId: evento.datos.pagadorId,
      tipo: 'compra_de_bolsa_fallida:familia',
      prioridad: 'normal',
      parametros: { motivo: evento.datos.motivo },
    });
  }
}

export class AvisarBolsaComprada implements ManejadorDeEventos<BolsaComprada> {
  readonly nombre = 'notificaciones.avisar_bolsa_comprada';
  readonly tipo = 'pagos.bolsa_comprada';

  constructor(private readonly avisos: CrearAvisos) {}

  async manejar(evento: BolsaComprada): Promise<void> {
    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId: evento.datos.familiarId,
      tipo: 'bolsa_comprada:familia',
      prioridad: 'normal',
      parametros: { bolsaId: evento.datos.bolsaId },
    });
  }
}
