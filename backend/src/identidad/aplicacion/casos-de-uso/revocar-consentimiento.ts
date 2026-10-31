import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import { Consentimiento } from '../../dominio/consentimiento.js';
import type { ConsentimientoId, UsuarioId } from '../../dominio/ids.js';
import type { RepositorioAdultosMayores } from '../puertos/salida/repositorio-adultos-mayores.js';
import type { RepositorioConsentimientos } from '../puertos/salida/repositorio-consentimientos.js';
import type { RepositorioVinculos } from '../puertos/salida/repositorio-vinculos.js';
import type { EventosDeIdentidad } from '../servicios/eventos-de-identidad.js';

type Desenlace =
  | { tipo: 'revocado'; adultoMayorId: string; finalidad: string }
  | { tipo: 'denegado' };

// Retira la autorización. Es inmediato: Teleasistencia consulta el consentimiento en cada acceso, y el
// evento le avisa para cerrar los accesos abiertos. Lo revoca quien podría haberlo otorgado; los demás
// reciben «no encontrado» y el intento queda auditado.
export class RevocarConsentimiento {
  constructor(
    private readonly adultosMayores: RepositorioAdultosMayores,
    private readonly vinculos: RepositorioVinculos,
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeIdentidad,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(usuarioId: string, consentimientoId: string): Promise<void> {
    const actor = usuarioId as UsuarioId;
    const desenlace = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<Desenlace> => {
        // Con bloqueo: dos revocaciones simultáneas se atienden una tras otra, y la segunda recibe un
        // conflicto en lugar de emitir un segundo evento.
        const consentimiento =
          await this.consentimientos.buscarPorIdParaActualizar(
            consentimientoId as ConsentimientoId,
          );
        if (consentimiento === null) return { tipo: 'denegado' };
        const adultoMayor = await this.adultosMayores.buscarPorId(
          consentimiento.adultoMayorId,
        );
        if (adultoMayor === null) return { tipo: 'denegado' };
        const vinculo = await this.vinculos.buscarActivo(actor, adultoMayor.id);
        if (Consentimiento.calidadDe(actor, adultoMayor, vinculo) === null) {
          return { tipo: 'denegado' };
        }

        const ahora = this.reloj.ahora();
        consentimiento.revocar(ahora);
        await this.consentimientos.actualizar(consentimiento);
        await this.eventos.publicar(
          'identidad.consentimiento_revocado',
          {
            adultoMayorId: consentimiento.adultoMayorId,
            finalidad: consentimiento.finalidad,
          },
          ahora,
        );
        return {
          tipo: 'revocado',
          adultoMayorId: consentimiento.adultoMayorId,
          finalidad: consentimiento.finalidad,
        };
      },
    );

    if (desenlace.tipo === 'denegado') {
      await this.auditoria.registrar({
        actorId: actor,
        accion: 'identidad.revocar_consentimiento',
        recursoTipo: 'consentimiento',
        recursoId: consentimientoId,
        resultado: 'denegado',
      });
      throw new RecursoNoEncontrado(
        'No encontramos ese consentimiento',
        'consentimiento.no_encontrado',
      );
    }
    await this.auditoria.registrar({
      actorId: actor,
      accion: 'identidad.revocar_consentimiento',
      recursoTipo: 'consentimiento',
      recursoId: consentimientoId,
      resultado: 'permitido',
      metadatos: {
        adultoMayorId: desenlace.adultoMayorId,
        finalidad: desenlace.finalidad,
      },
    });
  }
}
