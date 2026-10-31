import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import {
  esperaDeReintentoMs,
  MAXIMO_DE_INTENTOS,
} from '../../../../src/notificaciones/dominio/notificacion.js';
import { avisoDePrueba } from '../../../soporte/notificaciones.js';

const AHORA = new Date('2026-10-21T15:00:00.000Z');
const despues = (segundos: number) =>
  new Date(AHORA.getTime() + segundos * 1000);

describe('Notificacion', () => {
  describe('crear', () => {
    it('nace pendiente, sin intentos y lista para enviarse ya', () => {
      const aviso = avisoDePrueba({ ahora: AHORA });

      expect(aviso).toMatchObject({
        estado: 'pendiente',
        intentos: 0,
        proximoIntentoEn: AHORA,
        creadaEn: AHORA,
        enviadaEn: null,
        entregadaEn: null,
        ultimoError: null,
      });
      expect(aviso.esFinal()).toBe(false);
      expect(aviso.salio()).toBe(false);
    });

    it('no comparte los parámetros con quien la creó', () => {
      const parametros = { fecha: '2030-06-11' };
      const aviso = avisoDePrueba({ parametros });

      parametros.fecha = 'otra';

      expect(aviso.parametros.fecha).toBe('2030-06-11');
    });

    it.each([
      [
        'un canal inventado',
        { canal: 'paloma' as 'app' },
        'notificacion.canal_invalido',
      ],
      [
        'una prioridad inventada',
        { prioridad: 'urgente' as 'alta' },
        'notificacion.prioridad_invalida',
      ],
      ['un tipo vacío', { tipo: '  ' }, 'notificacion.tipo_invalido'],
    ])('rechaza %s', (_nombre, cambios, codigo) => {
      expect(() => avisoDePrueba(cambios)).toThrow(
        expect.objectContaining({
          constructor: ErrorDeValidacion,
          codigo,
        }) as Error,
      );
    });
  });

  describe('entrega', () => {
    it('entregada: llegó, con su fecha, y cuenta un intento', () => {
      const aviso = avisoDePrueba();

      aviso.marcarEntregada(AHORA);

      expect(aviso).toMatchObject({
        estado: 'entregada',
        intentos: 1,
        enviadaEn: AHORA,
        entregadaEn: AHORA,
      });
      expect(aviso.esFinal()).toBe(true);
      expect(aviso.salio()).toBe(true);
    });

    it('enviada: el proveedor la aceptó, falta la confirmación', () => {
      const aviso = avisoDePrueba({ canal: 'correo' });

      aviso.marcarEnviada(AHORA);

      expect(aviso).toMatchObject({
        estado: 'enviada',
        intentos: 1,
        enviadaEn: AHORA,
        entregadaEn: null,
      });
      expect(aviso.salio()).toBe(true);
    });

    it('un aviso que ya salió no admite más intentos', () => {
      const aviso = avisoDePrueba();
      aviso.marcarEntregada(AHORA);

      for (const intentar of [
        () => aviso.marcarEntregada(AHORA),
        () => aviso.marcarEnviada(AHORA),
        () => aviso.registrarFallo(AHORA, 'x'),
        () => aviso.registrarFalloDefinitivo('x'),
      ]) {
        expect(intentar).toThrow(
          expect.objectContaining({
            codigo: 'notificacion.no_pendiente',
          }) as Error,
        );
      }
    });

    it('un éxito después de fallos borra el último error', () => {
      const aviso = avisoDePrueba();
      aviso.registrarFallo(AHORA, 'el proveedor no responde');

      aviso.marcarEntregada(despues(60));

      expect(aviso.ultimoError).toBeNull();
      expect(aviso.intentos).toBe(2);
    });
  });

  describe('fallos y reintentos', () => {
    it('un fallo deja el aviso pendiente para más tarde, con el motivo', () => {
      const aviso = avisoDePrueba();

      const resultado = aviso.registrarFallo(AHORA, 'el proveedor no responde');

      expect(resultado).toBe('reintentar');
      expect(aviso).toMatchObject({
        estado: 'pendiente',
        intentos: 1,
        ultimoError: 'el proveedor no responde',
        proximoIntentoEn: despues(30),
      });
      expect(aviso.esFinal()).toBe(false);
    });

    it('la espera crece: 30 s, 2 min, 10 min y 30 min', () => {
      expect([1, 2, 3, 4].map((n) => esperaDeReintentoMs(n) / 1000)).toEqual([
        30, 120, 600, 1800,
      ]);
    });

    it('la espera nunca baja del primer valor ni pasa del último', () => {
      expect(esperaDeReintentoMs(0)).toBe(30_000);
      expect(esperaDeReintentoMs(99)).toBe(1_800_000);
    });

    it(`tras ${MAXIMO_DE_INTENTOS} fallos queda «fallida» y no se reintenta más`, () => {
      const aviso = avisoDePrueba();
      const resultados = Array.from({ length: MAXIMO_DE_INTENTOS }, () =>
        aviso.registrarFallo(AHORA, 'falló'),
      );

      expect(resultados.slice(0, -1).every((r) => r === 'reintentar')).toBe(
        true,
      );
      expect(resultados.at(-1)).toBe('agotada');
      expect(aviso).toMatchObject({
        estado: 'fallida',
        intentos: MAXIMO_DE_INTENTOS,
      });
      expect(aviso.esFinal()).toBe(true);
      expect(aviso.salio()).toBe(false);
    });

    it('un fallo definitivo la deja «fallida» de inmediato', () => {
      const aviso = avisoDePrueba({ canal: 'sms' });

      aviso.registrarFalloDefinitivo('La persona no tiene teléfono');

      expect(aviso).toMatchObject({
        estado: 'fallida',
        intentos: 1,
        ultimoError: 'La persona no tiene teléfono',
      });
    });

    it('recorta y limpia el motivo del error', () => {
      const aviso = avisoDePrueba();

      aviso.registrarFallo(AHORA, `  mucho\n\n   espacio ${'x'.repeat(2000)}`);

      expect(aviso.ultimoError).toMatch(/^mucho espacio x+$/);
      expect(Array.from(aviso.ultimoError ?? '').length).toBe(500);
    });
  });
});
