import { SegundoFactor } from '../../../../src/identidad/dominio/segundo-factor.js';
import { RelojFalso } from '../../../soporte/dobles.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const SECRETO_CIFRADO = new Uint8Array([1, 2, 3, 4]);

describe('SegundoFactor', () => {
  describe('iniciar', () => {
    it('nace pendiente (sin activar)', () => {
      const reloj = new RelojFalso();
      const usuarioId = idDePrueba<'Usuario'>();

      const segundoFactor = SegundoFactor.iniciar(
        usuarioId,
        SECRETO_CIFRADO,
        reloj.ahora(),
      );

      expect(segundoFactor.usuarioId).toBe(usuarioId);
      expect(segundoFactor.secretoCifrado).toBe(SECRETO_CIFRADO);
      expect(segundoFactor.activadoEn).toBeNull();
      expect(segundoFactor.estaActivo).toBe(false);
      expect(segundoFactor.creadoEn).toEqual(reloj.ahora());
    });
  });

  describe('activar', () => {
    it('queda activo desde ese instante', () => {
      const reloj = new RelojFalso();
      const segundoFactor = SegundoFactor.iniciar(
        idDePrueba<'Usuario'>(),
        SECRETO_CIFRADO,
        reloj.ahora(),
      );
      reloj.avanzar(1000);

      segundoFactor.activar(reloj.ahora());

      expect(segundoFactor.estaActivo).toBe(true);
      expect(segundoFactor.activadoEn).toEqual(reloj.ahora());
    });

    it('no se puede activar dos veces', () => {
      const reloj = new RelojFalso();
      const segundoFactor = SegundoFactor.iniciar(
        idDePrueba<'Usuario'>(),
        SECRETO_CIFRADO,
        reloj.ahora(),
      );
      segundoFactor.activar(reloj.ahora());

      expect(() => segundoFactor.activar(reloj.ahora())).toThrow(
        expect.objectContaining({ codigo: 'segundo_factor.ya_activo' }),
      );
    });
  });

  describe('reiniciar', () => {
    it('reemplaza el secreto y vuelve a pedir confirmación', () => {
      const reloj = new RelojFalso();
      const segundoFactor = SegundoFactor.iniciar(
        idDePrueba<'Usuario'>(),
        SECRETO_CIFRADO,
        reloj.ahora(),
      );
      segundoFactor.activar(reloj.ahora());
      reloj.avanzar(1000);

      const nuevoSecreto = new Uint8Array([9, 9, 9]);
      segundoFactor.reiniciar(nuevoSecreto, reloj.ahora());

      expect(segundoFactor.secretoCifrado).toBe(nuevoSecreto);
      expect(segundoFactor.estaActivo).toBe(false);
      expect(segundoFactor.activadoEn).toBeNull();
      expect(segundoFactor.actualizadoEn).toEqual(reloj.ahora());
    });
  });
});
