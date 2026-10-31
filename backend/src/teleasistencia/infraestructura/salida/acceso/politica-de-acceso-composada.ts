import type { Auditoria } from '../../../../compartido/aplicacion/puertos/auditoria.js';
import { RecursoNoEncontrado } from '../../../../compartido/dominio/errores.js';
import type { ConsultaDeDirectorio } from '../../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeIdentidad } from '../../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { ConsultaDeReservas } from '../../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import type {
  ActorDeTeleasistencia,
  PermisoDeAcceso,
  PoliticaDeAcceso,
} from '../../../aplicacion/puertos/salida/politica-de-acceso.js';

// La política de acceso, armada con lo que ofrecen los otros módulos por sus puertos de entrada:
//
// - La FAMILIA vinculada a la persona puede todo; los datos de salud además exigen el consentimiento vigente.
// - El CUIDADOR solo mientras tiene un servicio activo con ella (en curso, o aceptado y dentro de su franja), y
//   solo para leer, registrar y pedir ayuda: no cambia el plan de medicamentos. Cuando el servicio termina o se
//   cancela, el acceso se corta de inmediato: se pregunta en CADA acceso, nunca se guarda una respuesta.
// - Cualquier otra persona (otro rol, otra familia, un cuidador sin servicio) no tiene acceso.
//
// Una negativa responde «no encontrado», igual que si la persona no existiera, y queda en la auditoría.
export class PoliticaDeAccesoComposada implements PoliticaDeAcceso {
  constructor(
    private readonly identidad: ConsultaDeIdentidad,
    private readonly reservas: ConsultaDeReservas,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly auditoria: Auditoria,
  ) {}

  async exigir(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    permiso: PermisoDeAcceso,
    accion: string,
  ): Promise<void> {
    const permitido = await this.puede(actor, adultoMayorId, permiso);
    await this.auditoria.registrar({
      actorId: actor.usuarioId,
      accion,
      recursoTipo: 'adulto_mayor',
      recursoId: adultoMayorId,
      resultado: permitido ? 'permitido' : 'denegado',
    });
    if (!permitido) {
      throw new RecursoNoEncontrado(
        'No encontramos a esa persona',
        'adulto_mayor.no_encontrado',
      );
    }
  }

  private async puede(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    permiso: PermisoDeAcceso,
  ): Promise<boolean> {
    let tieneVinculo: boolean;
    if (actor.rol === 'familiar') {
      tieneVinculo = await this.identidad.esFamiliarVinculado(
        actor.usuarioId,
        adultoMayorId,
      );
    } else if (actor.rol === 'cuidador') {
      if (permiso === 'administracion') return false;
      const cuidador = await this.directorio.obtenerCuidadorPorUsuario(
        actor.usuarioId,
      );
      tieneVinculo =
        cuidador !== null &&
        (await this.reservas.cuidadorTieneServicioActivo(
          cuidador.cuidadorId,
          adultoMayorId,
        ));
    } else {
      return false;
    }
    if (!tieneVinculo) return false;
    // Pedir ayuda no es un dato clínico: no depende del consentimiento.
    if (permiso === 'alerta') return true;
    return this.identidad.tieneConsentimientoVigente(
      adultoMayorId,
      'datos_de_salud',
    );
  }
}
