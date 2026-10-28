import {
  ConflictoDeEstado,
  SinPermiso,
} from '../../../../src/compartido/dominio/errores.js';
import { AceptacionDePolitica } from '../../../../src/identidad/dominio/aceptacion-de-politica.js';
import { Consentimiento } from '../../../../src/identidad/dominio/consentimiento.js';
import type {
  AdultoMayorId,
  UsuarioId,
} from '../../../../src/identidad/dominio/ids.js';
import type { CalidadDeConsentimiento } from '../../../../src/identidad/dominio/valores-cerrados.js';
import { Vinculo } from '../../../../src/identidad/dominio/vinculo.js';
import { VersionDeTexto } from '../../../../src/identidad/dominio/version-de-texto.js';
import {
  AHORA,
  adultoMayorDePrueba,
  idDePrueba,
  vinculoDePrueba,
} from '../../../soporte/identidad.js';

const DESPUES = new Date(AHORA.getTime() + 60_000);

describe('Vinculo', () => {
  it('nace activo y sin fecha de revocación', () => {
    const familiar = idDePrueba<'Usuario'>();
    const persona = idDePrueba<'AdultoMayor'>();

    const vinculo = Vinculo.crear({
      id: idDePrueba(),
      familiarId: familiar,
      adultoMayorId: persona,
      parentesco: 'nieto_nieta',
      esResponsable: false,
      ahora: AHORA,
    });

    expect(vinculo).toMatchObject({
      familiarId: familiar,
      adultoMayorId: persona,
      parentesco: 'nieto_nieta',
      esResponsable: false,
      estado: 'activo',
      creadoEn: AHORA,
      revocadoEn: null,
    });
    expect(vinculo.estaActivo()).toBe(true);
  });

  it('conecta solo a ese familiar con esa persona mayor', () => {
    const familiar = idDePrueba<'Usuario'>();
    const persona = idDePrueba<'AdultoMayor'>();
    const vinculo = vinculoDePrueba(familiar, persona);

    expect(vinculo.conecta(familiar, persona)).toBe(true);
    expect(vinculo.conecta(idDePrueba(), persona)).toBe(false);
    expect(vinculo.conecta(familiar, idDePrueba())).toBe(false);
  });

  it('al revocarse deja de conectar y guarda cuándo', () => {
    const familiar = idDePrueba<'Usuario'>();
    const persona = idDePrueba<'AdultoMayor'>();
    const vinculo = vinculoDePrueba(familiar, persona);

    vinculo.revocar(DESPUES);

    expect(vinculo.estado).toBe('revocado');
    expect(vinculo.revocadoEn).toEqual(DESPUES);
    expect(vinculo.conecta(familiar, persona)).toBe(false);
  });

  it('revocar dos veces es un conflicto y conserva la primera fecha', () => {
    const vinculo = vinculoDePrueba(idDePrueba(), idDePrueba());
    vinculo.revocar(DESPUES);

    expect(() => vinculo.revocar(new Date())).toThrow(ConflictoDeEstado);
    expect(vinculo.revocadoEn).toEqual(DESPUES);
  });
});

describe('Consentimiento', () => {
  const version = VersionDeTexto.crear('v1');

  // Un familiar vinculado a una persona mayor, con todo lo que hace falta para consentir.
  function escenario() {
    const familiar = idDePrueba<'Usuario'>();
    const persona = adultoMayorDePrueba();
    return {
      familiar,
      persona,
      vinculo: vinculoDePrueba(familiar, persona.id),
    };
  }

  function otorgar(datos: {
    persona: ReturnType<typeof adultoMayorDePrueba>;
    otorgadoPor: UsuarioId;
    vinculo: Vinculo | null;
    calidad?: CalidadDeConsentimiento;
    vigente?: Consentimiento | null;
  }) {
    return Consentimiento.otorgar({
      id: idDePrueba(),
      adultoMayor: datos.persona,
      finalidad: 'datos_de_salud',
      otorgadoPor: datos.otorgadoPor,
      calidad: datos.calidad ?? 'representante',
      versionDelTexto: version,
      vinculoDelOtorgante: datos.vinculo,
      vigente: datos.vigente ?? null,
      ahora: AHORA,
    });
  }

  describe('calidadDe: quién puede actuar y con qué calidad', () => {
    it('un familiar con vínculo activo actúa como representante', () => {
      const { familiar, persona, vinculo } = escenario();

      expect(Consentimiento.calidadDe(familiar, persona, vinculo)).toBe(
        'representante',
      );
    });

    it('la propia persona mayor, si tiene cuenta, actúa como titular', () => {
      const cuenta = idDePrueba<'Usuario'>();
      const persona = adultoMayorDePrueba({ usuarioId: cuenta });

      expect(Consentimiento.calidadDe(cuenta, persona, null)).toBe('titular');
    });

    it.each([
      ['no tiene vínculo', () => null],
      [
        'tiene un vínculo con otra persona mayor',
        (f: UsuarioId) => vinculoDePrueba(f, idDePrueba()),
      ],
      [
        'el vínculo es de otro familiar',
        (_f: UsuarioId, p?: AdultoMayorId) =>
          vinculoDePrueba(idDePrueba(), p ?? idDePrueba()),
      ],
      [
        'su vínculo fue revocado',
        (f: UsuarioId, p?: AdultoMayorId) => {
          const revocado = vinculoDePrueba(f, p ?? idDePrueba());
          revocado.revocar(DESPUES);
          return revocado;
        },
      ],
    ])('un familiar que %s no puede actuar', (_caso, crearVinculo) => {
      const familiar = idDePrueba<'Usuario'>();
      const persona = adultoMayorDePrueba();

      expect(
        Consentimiento.calidadDe(
          familiar,
          persona,
          crearVinculo(familiar, persona.id),
        ),
      ).toBeNull();
    });

    it('una persona mayor sin cuenta propia no tiene titular que actúe', () => {
      expect(
        Consentimiento.calidadDe(idDePrueba(), adultoMayorDePrueba(), null),
      ).toBeNull();
    });
  });

  describe('otorgar', () => {
    it('un familiar vinculado consiente como representante, con la versión del texto', () => {
      const { familiar, persona, vinculo } = escenario();

      const consentimiento = otorgar({
        persona,
        otorgadoPor: familiar,
        vinculo,
      });

      expect(consentimiento).toMatchObject({
        adultoMayorId: persona.id,
        finalidad: 'datos_de_salud',
        otorgadoPor: familiar,
        calidad: 'representante',
        otorgadoEn: AHORA,
        revocadoEn: null,
      });
      expect(consentimiento.versionDelTexto.valor).toBe('v1');
      expect(consentimiento.estaVigente()).toBe(true);
    });

    it('la propia persona mayor consiente como titular', () => {
      const cuenta = idDePrueba<'Usuario'>();
      const persona = adultoMayorDePrueba({ usuarioId: cuenta });

      const consentimiento = otorgar({
        persona,
        otorgadoPor: cuenta,
        vinculo: null,
        calidad: 'titular',
      });

      expect(consentimiento.calidad).toBe('titular');
    });

    it('un familiar sin vínculo no puede consentir por una persona ajena', () => {
      const { persona } = escenario();

      expect(() =>
        otorgar({ persona, otorgadoPor: idDePrueba(), vinculo: null }),
      ).toThrow(SinPermiso);
      expect(() =>
        otorgar({ persona, otorgadoPor: idDePrueba(), vinculo: null }),
      ).toThrow(
        expect.objectContaining({ codigo: 'consentimiento.sin_permiso' }),
      );
    });

    it('un vínculo revocado no sirve para consentir', () => {
      const { familiar, persona, vinculo } = escenario();
      vinculo.revocar(DESPUES);

      expect(() =>
        otorgar({ persona, otorgadoPor: familiar, vinculo }),
      ).toThrow(
        expect.objectContaining({ codigo: 'consentimiento.sin_permiso' }),
      );
    });

    it('un familiar no puede hacerse pasar por el titular', () => {
      const { familiar, persona, vinculo } = escenario();

      expect(() =>
        otorgar({
          persona,
          otorgadoPor: familiar,
          vinculo,
          calidad: 'titular',
        }),
      ).toThrow(
        expect.objectContaining({
          codigo: 'consentimiento.calidad_no_corresponde',
        }),
      );
    });

    it('el titular no puede declararse representante', () => {
      const cuenta = idDePrueba<'Usuario'>();
      const persona = adultoMayorDePrueba({ usuarioId: cuenta });

      expect(() =>
        otorgar({
          persona,
          otorgadoPor: cuenta,
          vinculo: null,
          calidad: 'representante',
        }),
      ).toThrow(
        expect.objectContaining({
          codigo: 'consentimiento.calidad_no_corresponde',
        }),
      );
    });

    it('no puede haber dos consentimientos vigentes para la misma persona y finalidad', () => {
      const { familiar, persona, vinculo } = escenario();
      const primero = otorgar({ persona, otorgadoPor: familiar, vinculo });

      expect(() =>
        otorgar({ persona, otorgadoPor: familiar, vinculo, vigente: primero }),
      ).toThrow(ConflictoDeEstado);
      expect(() =>
        otorgar({ persona, otorgadoPor: familiar, vinculo, vigente: primero }),
      ).toThrow(
        expect.objectContaining({ codigo: 'consentimiento.ya_vigente' }),
      );
    });

    it('tras revocar el anterior sí se puede otorgar uno nuevo', () => {
      const { familiar, persona, vinculo } = escenario();
      const primero = otorgar({ persona, otorgadoPor: familiar, vinculo });
      primero.revocar(DESPUES);

      const segundo = otorgar({
        persona,
        otorgadoPor: familiar,
        vinculo,
        vigente: primero,
      });

      expect(segundo.estaVigente()).toBe(true);
      expect(segundo.id).not.toBe(primero.id);
    });

    it('revisa el permiso antes que el conflicto: quien no puede actuar no se entera de si hay uno vigente', () => {
      const { familiar, persona, vinculo } = escenario();
      const vigente = otorgar({ persona, otorgadoPor: familiar, vinculo });

      expect(() =>
        otorgar({ persona, otorgadoPor: idDePrueba(), vinculo: null, vigente }),
      ).toThrow(SinPermiso);
    });
  });

  describe('revocar', () => {
    it('es inmediato y deja de estar vigente', () => {
      const { familiar, persona, vinculo } = escenario();
      const consentimiento = otorgar({
        persona,
        otorgadoPor: familiar,
        vinculo,
      });

      consentimiento.revocar(DESPUES);

      expect(consentimiento.estaVigente()).toBe(false);
      expect(consentimiento.revocadoEn).toEqual(DESPUES);
    });

    it('revocar otra vez es un conflicto y conserva la primera fecha', () => {
      const { familiar, persona, vinculo } = escenario();
      const consentimiento = otorgar({
        persona,
        otorgadoPor: familiar,
        vinculo,
      });
      consentimiento.revocar(DESPUES);

      expect(() => consentimiento.revocar(new Date())).toThrow(
        expect.objectContaining({ codigo: 'consentimiento.ya_revocado' }),
      );
      expect(consentimiento.revocadoEn).toEqual(DESPUES);
    });
  });
});

describe('AceptacionDePolitica', () => {
  it('guarda quién aceptó qué versión y cuándo', () => {
    const usuarioId = idDePrueba<'Usuario'>();

    const aceptacion = AceptacionDePolitica.registrar({
      usuarioId,
      version: VersionDeTexto.crear('v1'),
      aceptadaEn: AHORA,
    });

    expect(aceptacion.usuarioId).toBe(usuarioId);
    expect(aceptacion.version.valor).toBe('v1');
    expect(aceptacion.aceptadaEn).toEqual(AHORA);
  });
});
