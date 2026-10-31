import { Consentimiento } from '../../../src/identidad/dominio/consentimiento.js';
import { TelefonoE164 } from '../../../src/identidad/dominio/telefono-e164.js';
import { VersionDeTexto } from '../../../src/identidad/dominio/version-de-texto.js';
import { ConsultaDeIdentidadServicio } from '../../../src/identidad/aplicacion/servicios/consulta-de-identidad-servicio.js';
import { RelojFalso } from '../../soporte/dobles.js';
import {
  adultoMayorDePrueba,
  AHORA,
  idDePrueba,
  vinculoDePrueba,
} from '../../soporte/identidad.js';
import {
  guardarFamiliar,
  montarRepositoriosDeIdentidad,
} from '../../soporte/repositorios-identidad.js';

// Lo que Identidad ofrece a los demás módulos (E13), contra Postgres real.
describe('ConsultaDeIdentidadServicio', () => {
  const repos = montarRepositoriosDeIdentidad();
  // 10:00 en Bogotá del 21 de octubre de 2026.
  const reloj = new RelojFalso('2026-10-21T15:00:00.000Z');
  const consulta = new ConsultaDeIdentidadServicio(
    repos.usuarios,
    repos.adultosMayores,
    repos.vinculos,
    repos.consentimientos,
    reloj,
    'America/Bogota',
  );

  afterAll(async () => {
    await repos.pool.end();
  });

  beforeEach(() => reloj.fijar('2026-10-21T15:00:00.000Z'));

  // Una persona mayor (nacida el 15 de marzo de 1948) guardada con su creador.
  async function guardarAdulto() {
    const familiar = await guardarFamiliar(repos);
    const adulto = adultoMayorDePrueba({ creadoPor: familiar.id });
    await repos.adultosMayores.guardar(adulto);
    return { familiar, adulto };
  }

  describe('obtenerContacto', () => {
    it('devuelve el contacto de una cuenta activa, con el teléfono si lo tiene', async () => {
      const familiar = await guardarFamiliar(repos);
      familiar.actualizarPerfil(
        { telefono: TelefonoE164.crear('+573001234567') },
        AHORA,
      );
      await repos.usuarios.actualizar(familiar);

      expect(await consulta.obtenerContacto(familiar.id)).toEqual({
        usuarioId: familiar.id,
        nombre: 'Andrea Gómez',
        correo: familiar.correo.valor,
        telefono: '+573001234567',
      });
    });

    it('el teléfono es null si no tiene', async () => {
      const familiar = await guardarFamiliar(repos);

      expect(
        (await consulta.obtenerContacto(familiar.id))?.telefono,
      ).toBeNull();
    });

    it('devuelve null si la cuenta no existe', async () => {
      expect(await consulta.obtenerContacto(idDePrueba())).toBeNull();
    });

    it('devuelve null si la cuenta fue eliminada: no se le escribe a quien ya se fue', async () => {
      const familiar = await guardarFamiliar(repos);
      await repos.pool.query(
        "update identidad.usuarios set estado = 'eliminado' where id = $1",
        [familiar.id],
      );

      expect(await consulta.obtenerContacto(familiar.id)).toBeNull();
    });
  });

  describe('obtenerAdultoMayor', () => {
    it('devuelve el resumen con la edad calculada a hoy en la zona del negocio', async () => {
      const { adulto } = await guardarAdulto();

      expect(await consulta.obtenerAdultoMayor(adulto.id)).toEqual({
        id: adulto.id,
        nombre: 'Carmen Gómez',
        edad: 78,
        fotoUrl: null,
      });
    });

    it('la edad sube el día del cumpleaños, no antes', async () => {
      const { adulto } = await guardarAdulto();

      reloj.fijar('2027-03-15T04:59:00.000Z'); // 23:59 del 14 en Bogotá
      const vispera = await consulta.obtenerAdultoMayor(adulto.id);
      reloj.fijar('2027-03-15T05:00:00.000Z'); // 00:00 del 15 en Bogotá
      const cumple = await consulta.obtenerAdultoMayor(adulto.id);

      expect(vispera?.edad).toBe(78);
      expect(cumple?.edad).toBe(79);
    });

    it('devuelve null si no existe', async () => {
      expect(await consulta.obtenerAdultoMayor(idDePrueba())).toBeNull();
    });
  });

  describe('esFamiliarVinculado', () => {
    it('es verdadero solo con un vínculo activo con esa persona', async () => {
      const { familiar, adulto } = await guardarAdulto();
      const ajeno = await guardarFamiliar(repos);
      const vinculo = vinculoDePrueba(familiar.id, adulto.id);
      await repos.vinculos.guardar(vinculo);

      expect(await consulta.esFamiliarVinculado(familiar.id, adulto.id)).toBe(
        true,
      );
      expect(await consulta.esFamiliarVinculado(ajeno.id, adulto.id)).toBe(
        false,
      );
      expect(
        await consulta.esFamiliarVinculado(familiar.id, idDePrueba()),
      ).toBe(false);
    });

    it('deja de serlo al revocar el vínculo', async () => {
      const { familiar, adulto } = await guardarAdulto();
      const vinculo = vinculoDePrueba(familiar.id, adulto.id);
      await repos.vinculos.guardar(vinculo);

      vinculo.revocar(AHORA);
      await repos.vinculos.actualizar(vinculo);

      expect(await consulta.esFamiliarVinculado(familiar.id, adulto.id)).toBe(
        false,
      );
    });
  });

  describe('tieneConsentimientoVigente', () => {
    it('cambia con el ciclo del consentimiento: sin él, vigente y revocado', async () => {
      const { familiar, adulto } = await guardarAdulto();
      const vinculo = vinculoDePrueba(familiar.id, adulto.id);
      await repos.vinculos.guardar(vinculo);
      expect(
        await consulta.tieneConsentimientoVigente(adulto.id, 'datos_de_salud'),
      ).toBe(false);

      const consentimiento = Consentimiento.otorgar({
        id: idDePrueba<'Consentimiento'>(),
        adultoMayor: adulto,
        finalidad: 'datos_de_salud',
        otorgadoPor: familiar.id,
        calidad: 'representante',
        versionDelTexto: VersionDeTexto.crear('v1'),
        vinculoDelOtorgante: vinculo,
        vigente: null,
        ahora: AHORA,
      });
      await repos.consentimientos.guardar(consentimiento);
      expect(
        await consulta.tieneConsentimientoVigente(adulto.id, 'datos_de_salud'),
      ).toBe(true);

      consentimiento.revocar(AHORA);
      await repos.consentimientos.actualizar(consentimiento);
      expect(
        await consulta.tieneConsentimientoVigente(adulto.id, 'datos_de_salud'),
      ).toBe(false);
    });
  });

  describe('listarFamiliaresVinculados', () => {
    it('devuelve los familiares con vínculo activo y no los revocados', async () => {
      const { familiar, adulto } = await guardarAdulto();
      const otro = await guardarFamiliar(repos);
      const quienSeFue = await guardarFamiliar(repos);
      await repos.vinculos.guardar(vinculoDePrueba(familiar.id, adulto.id));
      await repos.vinculos.guardar(vinculoDePrueba(otro.id, adulto.id));
      const revocado = vinculoDePrueba(quienSeFue.id, adulto.id);
      await repos.vinculos.guardar(revocado);
      revocado.revocar(AHORA);
      await repos.vinculos.actualizar(revocado);

      const familiares = await consulta.listarFamiliaresVinculados(adulto.id);

      expect(familiares.toSorted()).toEqual([familiar.id, otro.id].toSorted());
    });

    it('devuelve una lista vacía si la persona no tiene a nadie vinculado', async () => {
      const { adulto } = await guardarAdulto();

      expect(await consulta.listarFamiliaresVinculados(adulto.id)).toEqual([]);
    });
  });
});
