import type { ManejadorDeEventos } from '../../../compartido/aplicacion/puertos/manejador-de-eventos.js';
import type {
  CuidadorVerificado,
  VerificacionRechazada,
} from '../../../compartido/eventos/directorio.js';
import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { CrearAvisos } from '../casos-de-uso/crear-avisos.js';

// Le avisa al cuidador cómo va su postulación. Los avisos no llevan el motivo del rechazo (puede mencionar datos
// personales y por correo o SMS no hay privacidad): dicen que hay algo que ver y mandan a abrir Seniory.
async function usuarioDelCuidador(
  directorio: ConsultaDeDirectorio,
  cuidadorId: string,
): Promise<string | null> {
  const contacto = await directorio.obtenerContactoDeCuidador(cuidadorId);
  return contacto?.usuarioId ?? null;
}

export class AvisarCuidadorVerificado implements ManejadorDeEventos<CuidadorVerificado> {
  readonly nombre = 'notificaciones.avisar_cuidador_verificado';
  readonly tipo = 'directorio.cuidador_verificado';

  constructor(
    private readonly directorio: ConsultaDeDirectorio,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: CuidadorVerificado): Promise<void> {
    const destinatarioId = await usuarioDelCuidador(
      this.directorio,
      evento.datos.cuidadorId,
    );
    if (destinatarioId === null) return;
    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId,
      tipo: 'cuidador_verificado:cuidador',
      prioridad: 'normal',
      parametros: { cuidadorId: evento.datos.cuidadorId },
    });
  }
}

export class AvisarVerificacionRechazada implements ManejadorDeEventos<VerificacionRechazada> {
  readonly nombre = 'notificaciones.avisar_verificacion_rechazada';
  readonly tipo = 'directorio.verificacion_rechazada';

  constructor(
    private readonly directorio: ConsultaDeDirectorio,
    private readonly avisos: CrearAvisos,
  ) {}

  async manejar(evento: VerificacionRechazada): Promise<void> {
    const destinatarioId = await usuarioDelCuidador(
      this.directorio,
      evento.datos.cuidadorId,
    );
    if (destinatarioId === null) return;
    await this.avisos.ejecutar({
      eventoId: evento.id,
      destinatarioId,
      tipo: 'verificacion_rechazada:cuidador',
      prioridad: 'normal',
      parametros: {
        cuidadorId: evento.datos.cuidadorId,
        control: evento.datos.control,
      },
    });
  }
}
