import {
  ConflictoDeEstado,
  SinPermiso,
} from '../../compartido/dominio/errores.js';
import type { AdultoMayor } from './adulto-mayor.js';
import type { AdultoMayorId, ConsentimientoId, UsuarioId } from './ids.js';
import type { Vinculo } from './vinculo.js';
import type { VersionDeTexto } from './version-de-texto.js';
import type {
  CalidadDeConsentimiento,
  FinalidadDeConsentimiento,
} from './valores-cerrados.js';

export interface DatosDeConsentimiento {
  id: ConsentimientoId;
  adultoMayorId: AdultoMayorId;
  finalidad: FinalidadDeConsentimiento;
  otorgadoPor: UsuarioId;
  calidad: CalidadDeConsentimiento;
  versionDelTexto: VersionDeTexto;
  otorgadoEn: Date;
  revocadoEn: Date | null;
}

export interface DatosParaOtorgarConsentimiento {
  id: ConsentimientoId;
  adultoMayor: AdultoMayor;
  finalidad: FinalidadDeConsentimiento;
  otorgadoPor: UsuarioId;
  // Con qué calidad dice actuar quien consiente. Debe coincidir con la que le corresponde.
  calidad: CalidadDeConsentimiento;
  versionDelTexto: VersionDeTexto;
  // El vínculo de `otorgadoPor` con la persona mayor, si lo tiene.
  vinculoDelOtorgante: Vinculo | null;
  // El consentimiento vigente que ya exista para esta persona y finalidad, si lo hay.
  vigente: Consentimiento | null;
  ahora: Date;
}

// La autorización para tratar los datos de salud de una persona mayor (Ley 1581 de 2012). Teleasistencia
// la consulta en CADA acceso: revocarla corta el acceso de inmediato.
//
// Quién puede consentir: la propia persona mayor, como titular, si tiene cuenta; o un familiar con
// vínculo activo, como representante. Qué relación legal basta para representar a alguien es una
// decisión pendiente de asesoría legal (docs/backend/M1 §10, decisión 1): el modelo guarda con qué
// calidad se consintió para poder cambiar la regla sin perder el registro de lo ya otorgado.
export class Consentimiento {
  private constructor(private readonly datos: DatosDeConsentimiento) {}

  // Con qué calidad puede actuar `usuarioId` sobre el consentimiento de esta persona; null si no
  // puede actuar. La misma regla vale para otorgar y para revocar.
  static calidadDe(
    usuarioId: UsuarioId,
    adultoMayor: AdultoMayor,
    vinculo: Vinculo | null,
  ): CalidadDeConsentimiento | null {
    if (adultoMayor.usuarioId !== null && adultoMayor.usuarioId === usuarioId) {
      return 'titular';
    }
    if (vinculo?.conecta(usuarioId, adultoMayor.id) === true) {
      return 'representante';
    }
    return null;
  }

  static otorgar(datos: DatosParaOtorgarConsentimiento): Consentimiento {
    const quePuede = Consentimiento.calidadDe(
      datos.otorgadoPor,
      datos.adultoMayor,
      datos.vinculoDelOtorgante,
    );
    if (quePuede === null) {
      throw new SinPermiso(
        'No puedes otorgar el consentimiento de esta persona',
        'consentimiento.sin_permiso',
      );
    }
    if (quePuede !== datos.calidad) {
      throw new SinPermiso(
        'La calidad indicada no corresponde a tu relación con esta persona',
        'consentimiento.calidad_no_corresponde',
      );
    }
    if (datos.vigente?.estaVigente() === true) {
      throw new ConflictoDeEstado(
        'Ya hay un consentimiento vigente para esta persona y esta finalidad',
        'consentimiento.ya_vigente',
      );
    }
    return new Consentimiento({
      id: datos.id,
      adultoMayorId: datos.adultoMayor.id,
      finalidad: datos.finalidad,
      otorgadoPor: datos.otorgadoPor,
      calidad: datos.calidad,
      versionDelTexto: datos.versionDelTexto,
      otorgadoEn: datos.ahora,
      revocadoEn: null,
    });
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeConsentimiento): Consentimiento {
    return new Consentimiento({ ...datos });
  }

  get id(): ConsentimientoId {
    return this.datos.id;
  }
  get adultoMayorId(): AdultoMayorId {
    return this.datos.adultoMayorId;
  }
  get finalidad(): FinalidadDeConsentimiento {
    return this.datos.finalidad;
  }
  get otorgadoPor(): UsuarioId {
    return this.datos.otorgadoPor;
  }
  get calidad(): CalidadDeConsentimiento {
    return this.datos.calidad;
  }
  get versionDelTexto(): VersionDeTexto {
    return this.datos.versionDelTexto;
  }
  get otorgadoEn(): Date {
    return this.datos.otorgadoEn;
  }
  get revocadoEn(): Date | null {
    return this.datos.revocadoEn;
  }

  estaVigente(): boolean {
    return this.datos.revocadoEn === null;
  }

  // Quien revoca debe poder actuar sobre esta persona (`calidadDe`); el caso de uso lo verifica.
  // Revocar es inmediato y no se puede deshacer: para volver a consentir se otorga uno nuevo.
  revocar(ahora: Date): void {
    if (!this.estaVigente()) {
      throw new ConflictoDeEstado(
        'El consentimiento ya fue revocado',
        'consentimiento.ya_revocado',
      );
    }
    this.datos.revocadoEn = ahora;
  }
}
