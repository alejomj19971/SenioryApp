import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import {
  ErrorDeValidacion,
  RecursoNoEncontrado,
} from '../../../compartido/dominio/errores.js';
import { Consentimiento } from '../../dominio/consentimiento.js';
import type { AdultoMayorId, UsuarioId } from '../../dominio/ids.js';
import {
  calidadDesdeTexto,
  finalidadDesdeTexto,
} from '../../dominio/valores-cerrados.js';
import { VersionDeTexto } from '../../dominio/version-de-texto.js';
import type { RepositorioAdultosMayores } from '../puertos/salida/repositorio-adultos-mayores.js';
import type { RepositorioConsentimientos } from '../puertos/salida/repositorio-consentimientos.js';
import type { RepositorioVinculos } from '../puertos/salida/repositorio-vinculos.js';
import type { EventosDeIdentidad } from '../servicios/eventos-de-identidad.js';
import {
  vistaDeConsentimiento,
  type VistaDeConsentimiento,
} from '../vistas.js';

export interface EntradaDeConsentimiento {
  finalidad: string;
  versionDelTexto: string;
  calidad: string;
}

type Desenlace =
  | { tipo: 'otorgado'; consentimiento: VistaDeConsentimiento }
  | { tipo: 'denegado' };

// Autoriza el tratamiento de los datos de salud de una persona mayor (Ley 1581). Lo otorga un familiar
// vinculado (como representante) o la propia persona (como titular). Quien no puede actuar sobre esa
// persona recibe «no encontrado», como si no existiera, y el intento queda auditado.
export class OtorgarConsentimiento {
  constructor(
    private readonly adultosMayores: RepositorioAdultosMayores,
    private readonly vinculos: RepositorioVinculos,
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeIdentidad,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly versionVigenteDelTexto: string,
  ) {}

  async ejecutar(
    usuarioId: string,
    adultoMayorId: string,
    entrada: EntradaDeConsentimiento,
  ): Promise<VistaDeConsentimiento> {
    // Primero la forma de lo que se envía: no depende de quién pregunta ni revela si la persona existe.
    const finalidad = finalidadDesdeTexto(entrada.finalidad);
    const calidad = calidadDesdeTexto(entrada.calidad);
    const version = VersionDeTexto.crear(entrada.versionDelTexto);
    if (version.valor !== this.versionVigenteDelTexto) {
      throw new ErrorDeValidacion(
        'Debes aceptar la versión vigente del texto del consentimiento',
        'consentimiento.version_no_vigente',
      );
    }

    const otorgante = usuarioId as UsuarioId;
    const desenlace = await this.unidadDeTrabajo.ejecutar(
      async (): Promise<Desenlace> => {
        const adultoMayor = await this.adultosMayores.buscarPorId(
          adultoMayorId as AdultoMayorId,
        );
        if (adultoMayor === null) return { tipo: 'denegado' };
        const vinculo = await this.vinculos.buscarActivo(
          otorgante,
          adultoMayor.id,
        );
        if (
          Consentimiento.calidadDe(otorgante, adultoMayor, vinculo) === null
        ) {
          return { tipo: 'denegado' };
        }

        const ahora = this.reloj.ahora();
        const consentimiento = Consentimiento.otorgar({
          id: this.ids.nuevo<'Consentimiento'>(),
          adultoMayor,
          finalidad,
          otorgadoPor: otorgante,
          calidad,
          versionDelTexto: version,
          vinculoDelOtorgante: vinculo,
          // Si dos peticiones pasan esta lectura a la vez, el índice único parcial rechaza la segunda.
          vigente: await this.consentimientos.buscarVigente(
            adultoMayor.id,
            finalidad,
          ),
          ahora,
        });
        await this.consentimientos.guardar(consentimiento);
        await this.eventos.publicar(
          'identidad.consentimiento_otorgado',
          { adultoMayorId: adultoMayor.id, finalidad },
          ahora,
        );
        return {
          tipo: 'otorgado',
          consentimiento: vistaDeConsentimiento(consentimiento),
        };
      },
    );

    if (desenlace.tipo === 'denegado') {
      await this.auditoria.registrar({
        actorId: otorgante,
        accion: 'identidad.otorgar_consentimiento',
        recursoTipo: 'adulto_mayor',
        recursoId: adultoMayorId,
        resultado: 'denegado',
      });
      throw new RecursoNoEncontrado(
        'No encontramos a esa persona',
        'adulto_mayor.no_encontrado',
      );
    }
    await this.auditoria.registrar({
      actorId: otorgante,
      accion: 'identidad.otorgar_consentimiento',
      recursoTipo: 'consentimiento',
      recursoId: desenlace.consentimiento.id,
      resultado: 'permitido',
      metadatos: {
        adultoMayorId,
        finalidad,
        calidad,
        versionDelTexto: version.valor,
      },
    });
    return desenlace.consentimiento;
  }
}
