import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { ErrorDeValidacion } from '../../../compartido/dominio/errores.js';
import {
  LecturaDeSignos,
  RANGOS_POR_DEFECTO,
  validarRangos,
  type FuenteDeLectura,
  type LecturaId,
  type RangosDeReferencia,
} from '../../dominio/signos.js';
import type {
  ActorDeTeleasistencia,
  PoliticaDeAcceso,
} from '../puertos/salida/politica-de-acceso.js';
import type {
  RepositorioLecturas,
  RepositorioRangos,
} from '../puertos/salida/repositorios.js';
import type { EventosDeTeleasistencia } from '../servicios/eventos-de-teleasistencia.js';
import { vistaDeLectura, type VistaDeLectura } from '../vistas.js';

export const DIAS_POR_DEFECTO = 7;
export const DIAS_MAXIMOS = 30;

export interface EntradaDeLectura {
  // ISO 8601; si no viene, ahora.
  tomadaEn?: string;
  presionSistolica?: number | null;
  presionDiastolica?: number | null;
  frecuenciaCardiaca?: number | null;
  glucosa?: number | null;
  fuente?: FuenteDeLectura;
}

// Registra una medición de signos vitales y la compara con los rangos de la persona (los suyos, o los generales si
// no tiene). Si sale de rango, lo anuncia (`lectura_fuera_de_rango`) SIN decir cuál medida ni cuánto: el evento
// solo dice que hay que mirar.
export class RegistrarLectura {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly lecturas: RepositorioLecturas,
    private readonly rangos: RepositorioRangos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeTeleasistencia,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    entrada: EntradaDeLectura,
  ): Promise<VistaDeLectura> {
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'registro',
      'teleasistencia.registrar_lectura',
    );
    const ahora = this.reloj.ahora();
    const rangos =
      (await this.rangos.obtener(adultoMayorId)) ?? RANGOS_POR_DEFECTO;
    const lectura = LecturaDeSignos.registrar({
      id: this.ids.nuevo<'Lectura'>() as LecturaId,
      adultoMayorId,
      tomadaEn:
        entrada.tomadaEn === undefined ? ahora : new Date(entrada.tomadaEn),
      presionSistolica: entrada.presionSistolica,
      presionDiastolica: entrada.presionDiastolica,
      frecuenciaCardiaca: entrada.frecuenciaCardiaca,
      glucosa: entrada.glucosa,
      fuente: entrada.fuente ?? 'manual',
      registradaPor: actor.usuarioId,
      rangos,
      ahora,
    });
    await this.unidadDeTrabajo.ejecutar(async () => {
      await this.lecturas.guardar(lectura);
      if (lectura.fueraDeRango) {
        await this.eventos.publicar(
          'teleasistencia.lectura_fuera_de_rango',
          { lecturaId: lectura.id, adultoMayorId },
          ahora,
        );
      }
    });
    return vistaDeLectura(lectura);
  }
}

// Las lecturas de los últimos N días (7 por defecto, 30 como máximo). Sin lecturas, la lista va vacía (H8): no es
// un error.
export class ListarSignosVitales {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly lecturas: RepositorioLecturas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    dias?: number,
  ): Promise<VistaDeLectura[]> {
    if (
      dias !== undefined &&
      (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS)
    ) {
      throw new ErrorDeValidacion(
        `Los días deben ser un entero entre 1 y ${DIAS_MAXIMOS}`,
        'signos.dias_invalidos',
      );
    }
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'lectura',
      'teleasistencia.leer_signos',
    );
    const desde = new Date(
      this.reloj.ahora().getTime() - (dias ?? DIAS_POR_DEFECTO) * 86_400_000,
    );
    const lecturas = await this.lecturas.listarDesde(adultoMayorId, desde);
    return lecturas.map(vistaDeLectura);
  }
}

// La lectura más reciente, o null si nunca se registró una.
export class ObtenerUltimaLectura {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly lecturas: RepositorioLecturas,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
  ): Promise<VistaDeLectura | null> {
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'lectura',
      'teleasistencia.leer_signos',
    );
    const lectura = await this.lecturas.ultima(adultoMayorId);
    return lectura === null ? null : vistaDeLectura(lectura);
  }
}

// Fija los rangos de referencia de una persona. Los umbrales clínicos los define un profesional de salud: quien
// los carga (la familia) queda registrado como quien los definió, y la auditoría guarda el cambio.
export class DefinirRangos {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly rangos: RepositorioRangos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    rangos: RangosDeReferencia,
  ): Promise<RangosDeReferencia> {
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'administracion',
      'teleasistencia.definir_rangos',
    );
    const validos = validarRangos(rangos);
    await this.rangos.guardar(
      adultoMayorId,
      validos,
      actor.usuarioId,
      this.reloj.ahora(),
    );
    return validos;
  }
}
