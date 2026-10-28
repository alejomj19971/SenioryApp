import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../src/compartido/dominio/errores.js';
import { AceptacionDePolitica } from '../../../src/identidad/dominio/aceptacion-de-politica.js';
import { AdultoMayor } from '../../../src/identidad/dominio/adulto-mayor.js';
import { Consentimiento } from '../../../src/identidad/dominio/consentimiento.js';
import { NombrePersona } from '../../../src/identidad/dominio/nombre-persona.js';
import { VersionDeTexto } from '../../../src/identidad/dominio/version-de-texto.js';
import { Vinculo } from '../../../src/identidad/dominio/vinculo.js';
import { FechaCivil } from '../../../src/compartido/dominio/fecha-civil.js';
import { AHORA, HOY, idDePrueba } from '../../soporte/identidad.js';
import {
  guardarAdultoMayor,
  guardarFamiliar,
  montarRepositoriosDeIdentidad,
  type RepositoriosDeIdentidad,
} from '../../soporte/repositorios-identidad.js';

const DESPUES = new Date(AHORA.getTime() + 60_000);

describe('persistencia de personas mayores, vínculos y consentimientos', () => {
  const repos = montarRepositoriosDeIdentidad();

  afterAll(async () => {
    await repos.pool.end();
  });

  // Un familiar y una persona mayor ya guardados.
  async function escenario() {
    const familiar = await guardarFamiliar(repos);
    const persona = await guardarAdultoMayor(repos, familiar.id);
    return { familiar, persona };
  }

  async function vincular(
    r: RepositoriosDeIdentidad,
    familiarId = idDePrueba<'Usuario'>(),
    adultoMayorId = idDePrueba<'AdultoMayor'>(),
  ) {
    const vinculo = Vinculo.crear({
      id: idDePrueba(),
      familiarId,
      adultoMayorId,
      parentesco: 'hijo_hija',
      esResponsable: true,
      ahora: AHORA,
    });
    await r.vinculos.guardar(vinculo);
    return vinculo;
  }

  function consentimientoDe(
    persona: AdultoMayor,
    otorgadoPor: ReturnType<typeof idDePrueba<'Usuario'>>,
    vinculo: Vinculo,
  ) {
    return Consentimiento.otorgar({
      id: idDePrueba(),
      adultoMayor: persona,
      finalidad: 'datos_de_salud',
      otorgadoPor,
      calidad: 'representante',
      versionDelTexto: VersionDeTexto.crear('v1'),
      vinculoDelOtorgante: vinculo,
      vigente: null,
      ahora: AHORA,
    });
  }

  describe('adultos mayores', () => {
    it('guarda a la persona y la recupera con su fecha de nacimiento como día de calendario', async () => {
      const familiar = await guardarFamiliar(repos);
      const id = idDePrueba<'AdultoMayor'>();
      const carmen = AdultoMayor.registrar({
        id,
        nombre: NombrePersona.crear('Carmen Gómez'),
        fechaDeNacimiento: FechaCivil.desdeTexto('1948-03-15'),
        creadoPor: familiar.id,
        hoy: HOY,
        ahora: AHORA,
      });

      await repos.adultosMayores.guardar(carmen);
      const guardada = await repos.adultosMayores.buscarPorId(id);

      expect(guardada).toMatchObject({
        id,
        creadoPor: familiar.id,
        usuarioId: null,
        fotoUrl: null,
        creadoEn: AHORA,
      });
      expect(guardada?.fechaDeNacimiento.aTexto()).toBe('1948-03-15');
      expect(guardada?.nombre.valor).toBe('Carmen Gómez');
      expect(guardada?.edadEn(HOY)).toBe(78);
    });

    it('devuelve null si no existe y lista solo las que existen', async () => {
      const { familiar, persona } = await escenario();
      const otra = await guardarAdultoMayor(repos, familiar.id);

      expect(await repos.adultosMayores.buscarPorId(idDePrueba())).toBeNull();
      const encontradas = await repos.adultosMayores.listarPorIds([
        persona.id,
        otra.id,
        idDePrueba(),
      ]);
      expect(encontradas.map((a) => a.id).sort()).toEqual(
        [persona.id, otra.id].sort(),
      );
      expect(await repos.adultosMayores.listarPorIds([])).toEqual([]);
    });

    it('no guarda a una persona creada por un usuario que no existe', async () => {
      const carmen = AdultoMayor.registrar({
        id: idDePrueba(),
        nombre: NombrePersona.crear('Carmen'),
        fechaDeNacimiento: FechaCivil.desdeTexto('1948-03-15'),
        creadoPor: idDePrueba(),
        hoy: HOY,
        ahora: AHORA,
      });

      await expect(repos.adultosMayores.guardar(carmen)).rejects.toThrow();
    });
  });

  describe('vínculos', () => {
    it('guarda un vínculo y lo encuentra activo por familiar y por persona mayor', async () => {
      const { familiar, persona } = await escenario();

      const vinculo = await vincular(repos, familiar.id, persona.id);

      const activo = await repos.vinculos.buscarActivo(familiar.id, persona.id);
      expect(activo).toMatchObject({
        id: vinculo.id,
        parentesco: 'hijo_hija',
        esResponsable: true,
        estado: 'activo',
        revocadoEn: null,
      });
      expect(
        (await repos.vinculos.listarActivosDeFamiliar(familiar.id)).map(
          (v) => v.id,
        ),
      ).toEqual([vinculo.id]);
      expect(
        (await repos.vinculos.listarActivosDeAdultoMayor(persona.id)).map(
          (v) => v.id,
        ),
      ).toEqual([vinculo.id]);
    });

    it('sin vínculo, o con otra persona, no hay nada', async () => {
      const { familiar, persona } = await escenario();

      expect(
        await repos.vinculos.buscarActivo(familiar.id, persona.id),
      ).toBeNull();
      expect(await repos.vinculos.listarActivosDeFamiliar(familiar.id)).toEqual(
        [],
      );
      expect(
        await repos.vinculos.listarActivosDeAdultoMayor(persona.id),
      ).toEqual([]);
    });

    it('un vínculo revocado deja de aparecer como activo', async () => {
      const { familiar, persona } = await escenario();
      const vinculo = await vincular(repos, familiar.id, persona.id);

      vinculo.revocar(DESPUES);
      await repos.vinculos.actualizar(vinculo);

      expect(
        await repos.vinculos.buscarActivo(familiar.id, persona.id),
      ).toBeNull();
      expect(await repos.vinculos.listarActivosDeFamiliar(familiar.id)).toEqual(
        [],
      );
      const { rows } = await repos.pool.query(
        'select estado, revocado_en from identidad.vinculos where id = $1',
        [vinculo.id],
      );
      expect(rows[0]).toEqual({ estado: 'revocado', revocado_en: DESPUES });
    });

    it('no puede haber dos vínculos activos entre las mismas dos personas', async () => {
      const { familiar, persona } = await escenario();
      await vincular(repos, familiar.id, persona.id);

      await expect(vincular(repos, familiar.id, persona.id)).rejects.toThrow(
        expect.objectContaining({
          codigo: 'vinculo.ya_existe',
          constructor: ConflictoDeEstado,
        }),
      );
    });

    it('tras revocar el vínculo se puede crear uno nuevo con la misma persona', async () => {
      const { familiar, persona } = await escenario();
      const primero = await vincular(repos, familiar.id, persona.id);
      primero.revocar(DESPUES);
      await repos.vinculos.actualizar(primero);

      const segundo = await vincular(repos, familiar.id, persona.id);

      const activo = await repos.vinculos.buscarActivo(familiar.id, persona.id);
      expect(activo?.id).toBe(segundo.id);
    });

    it('varios familiares pueden estar vinculados a la misma persona', async () => {
      const { familiar, persona } = await escenario();
      const hermano = await guardarFamiliar(repos);
      await vincular(repos, familiar.id, persona.id);
      await vincular(repos, hermano.id, persona.id);

      const vinculados = await repos.vinculos.listarActivosDeAdultoMayor(
        persona.id,
      );

      expect(vinculados.map((v) => v.familiarId).sort()).toEqual(
        [familiar.id, hermano.id].sort(),
      );
    });

    it('actualizar un vínculo que no existe es un recurso no encontrado', async () => {
      const inexistente = Vinculo.crear({
        id: idDePrueba(),
        familiarId: idDePrueba(),
        adultoMayorId: idDePrueba(),
        parentesco: 'otro',
        esResponsable: false,
        ahora: AHORA,
      });

      await expect(repos.vinculos.actualizar(inexistente)).rejects.toThrow(
        expect.objectContaining({
          codigo: 'vinculo.no_encontrado',
          constructor: RecursoNoEncontrado,
        }),
      );
    });

    it('no guarda un vínculo con un familiar o una persona que no existen', async () => {
      await expect(vincular(repos)).rejects.toThrow();
    });
  });

  describe('consentimientos', () => {
    it('guarda un consentimiento y lo encuentra como vigente', async () => {
      const { familiar, persona } = await escenario();
      const vinculo = await vincular(repos, familiar.id, persona.id);
      const consentimiento = consentimientoDe(persona, familiar.id, vinculo);

      await repos.consentimientos.guardar(consentimiento);

      const vigente = await repos.consentimientos.buscarVigente(
        persona.id,
        'datos_de_salud',
      );
      expect(vigente).toMatchObject({
        id: consentimiento.id,
        adultoMayorId: persona.id,
        finalidad: 'datos_de_salud',
        otorgadoPor: familiar.id,
        calidad: 'representante',
        otorgadoEn: AHORA,
        revocadoEn: null,
      });
      expect(vigente?.versionDelTexto.valor).toBe('v1');
      expect(
        (await repos.consentimientos.buscarPorId(consentimiento.id))?.id,
      ).toBe(consentimiento.id);
    });

    it('revocarlo lo saca de los vigentes, pero el registro se conserva', async () => {
      const { familiar, persona } = await escenario();
      const vinculo = await vincular(repos, familiar.id, persona.id);
      const consentimiento = consentimientoDe(persona, familiar.id, vinculo);
      await repos.consentimientos.guardar(consentimiento);

      consentimiento.revocar(DESPUES);
      await repos.consentimientos.actualizar(consentimiento);

      expect(
        await repos.consentimientos.buscarVigente(persona.id, 'datos_de_salud'),
      ).toBeNull();
      const guardado = await repos.consentimientos.buscarPorId(
        consentimiento.id,
      );
      expect(guardado?.revocadoEn).toEqual(DESPUES);
      expect(guardado?.estaVigente()).toBe(false);
    });

    it('lista los vigentes de varias personas a la vez', async () => {
      const familiar = await guardarFamiliar(repos);
      const conConsentimiento = await guardarAdultoMayor(repos, familiar.id);
      const sinConsentimiento = await guardarAdultoMayor(repos, familiar.id);
      const revocado = await guardarAdultoMayor(repos, familiar.id);
      for (const persona of [conConsentimiento, revocado]) {
        const vinculo = await vincular(repos, familiar.id, persona.id);
        const c = consentimientoDe(persona, familiar.id, vinculo);
        await repos.consentimientos.guardar(c);
        if (persona === revocado) {
          c.revocar(DESPUES);
          await repos.consentimientos.actualizar(c);
        }
      }

      const vigentes = await repos.consentimientos.listarVigentesDe(
        [conConsentimiento.id, sinConsentimiento.id, revocado.id],
        'datos_de_salud',
      );

      expect(vigentes.map((c) => c.adultoMayorId)).toEqual([
        conConsentimiento.id,
      ]);
      expect(
        await repos.consentimientos.listarVigentesDe([], 'datos_de_salud'),
      ).toEqual([]);
    });

    it('no puede haber dos vigentes para la misma persona y finalidad', async () => {
      const { familiar, persona } = await escenario();
      const vinculo = await vincular(repos, familiar.id, persona.id);
      await repos.consentimientos.guardar(
        consentimientoDe(persona, familiar.id, vinculo),
      );

      await expect(
        repos.consentimientos.guardar(
          consentimientoDe(persona, familiar.id, vinculo),
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          codigo: 'consentimiento.ya_vigente',
          constructor: ConflictoDeEstado,
        }),
      );
    });

    it('dos peticiones simultáneas pasan la comprobación del dominio, pero solo una se guarda', async () => {
      const { familiar, persona } = await escenario();
      const vinculo = await vincular(repos, familiar.id, persona.id);

      const resultados = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          repos.consentimientos.guardar(
            consentimientoDe(persona, familiar.id, vinculo),
          ),
        ),
      );

      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(
        1,
      );
      const rechazadas = resultados.filter((r) => r.status === 'rejected');
      expect(rechazadas).toHaveLength(5);
      for (const r of rechazadas) {
        expect(r.reason).toMatchObject({ codigo: 'consentimiento.ya_vigente' });
      }
    });

    it('tras revocar el anterior se puede otorgar uno nuevo', async () => {
      const { familiar, persona } = await escenario();
      const vinculo = await vincular(repos, familiar.id, persona.id);
      const primero = consentimientoDe(persona, familiar.id, vinculo);
      await repos.consentimientos.guardar(primero);
      primero.revocar(DESPUES);
      await repos.consentimientos.actualizar(primero);

      const segundo = consentimientoDe(persona, familiar.id, vinculo);
      await repos.consentimientos.guardar(segundo);

      const vigente = await repos.consentimientos.buscarVigente(
        persona.id,
        'datos_de_salud',
      );
      expect(vigente?.id).toBe(segundo.id);
    });

    it('actualizar un consentimiento que no existe es un recurso no encontrado', async () => {
      const { familiar, persona } = await escenario();
      const vinculo = Vinculo.crear({
        id: idDePrueba(),
        familiarId: familiar.id,
        adultoMayorId: persona.id,
        parentesco: 'hijo_hija',
        esResponsable: true,
        ahora: AHORA,
      });
      const sinGuardar = consentimientoDe(persona, familiar.id, vinculo);

      await expect(
        repos.consentimientos.actualizar(sinGuardar),
      ).rejects.toThrow(
        expect.objectContaining({ codigo: 'consentimiento.no_encontrado' }),
      );
    });
  });

  describe('aceptaciones de la política', () => {
    const aceptacion = (
      usuarioId: ReturnType<typeof idDePrueba<'Usuario'>>,
      version: string,
      cuando: Date,
    ) =>
      AceptacionDePolitica.registrar({
        usuarioId,
        version: VersionDeTexto.crear(version),
        aceptadaEn: cuando,
      });

    it('guarda la aceptación de una versión y la lista', async () => {
      const usuario = await guardarFamiliar(repos);

      await repos.aceptaciones.guardar(aceptacion(usuario.id, 'v1', AHORA));

      const guardadas = await repos.aceptaciones.listarDeUsuario(usuario.id);
      expect(guardadas).toHaveLength(1);
      expect(guardadas[0]?.version.valor).toBe('v1');
      expect(guardadas[0]?.aceptadaEn).toEqual(AHORA);
    });

    it('aceptar de nuevo la misma versión no la reemplaza: queda la primera como prueba', async () => {
      const usuario = await guardarFamiliar(repos);
      await repos.aceptaciones.guardar(aceptacion(usuario.id, 'v1', AHORA));

      await repos.aceptaciones.guardar(aceptacion(usuario.id, 'v1', DESPUES));

      const guardadas = await repos.aceptaciones.listarDeUsuario(usuario.id);
      expect(guardadas).toHaveLength(1);
      expect(guardadas[0]?.aceptadaEn).toEqual(AHORA);
    });

    it('guarda una versión nueva junto a la anterior, en orden', async () => {
      const usuario = await guardarFamiliar(repos);
      await repos.aceptaciones.guardar(aceptacion(usuario.id, 'v2', DESPUES));
      await repos.aceptaciones.guardar(aceptacion(usuario.id, 'v1', AHORA));

      const versiones = (
        await repos.aceptaciones.listarDeUsuario(usuario.id)
      ).map((a) => a.version.valor);

      expect(versiones).toEqual(['v1', 'v2']);
    });

    it('no guarda la aceptación de un usuario que no existe', async () => {
      await expect(
        repos.aceptaciones.guardar(aceptacion(idDePrueba(), 'v1', AHORA)),
      ).rejects.toThrow();
    });
  });
});
