import { DesafioDeSegundoFactor } from '../../../../src/identidad/dominio/desafio-de-segundo-factor.js';
import { RelojFalso } from '../../../soporte/dobles.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const MINUTO = 60_000;

function desafioNuevo(reloj: RelojFalso, duracionMs = 5 * MINUTO) {
  return DesafioDeSegundoFactor.emitir({
    id: idDePrueba<'DesafioDeSegundoFactor'>(),
    usuarioId: idDePrueba<'Usuario'>(),
    hashDelToken: new Uint8Array(32).fill(9),
    ahora: reloj.ahora(),
    duracionMs,
  });
}

describe('DesafioDeSegundoFactor', () => {
  describe('emitir', () => {
    it('vence después de la duración indicada y nace sin usar', () => {
      const reloj = new RelojFalso();

      const desafio = desafioNuevo(reloj);

      expect(desafio.creadoEn).toEqual(reloj.ahora());
      expect(desafio.expiraEn).toEqual(
        new Date(reloj.ahora().getTime() + 5 * MINUTO),
      );
      expect(desafio.usadoEn).toBeNull();
    });

    it.each([0, 31, 33])(
      'rechaza un hash de %i bytes: solo vale un SHA-256',
      (largo) => {
        expect(() =>
          DesafioDeSegundoFactor.emitir({
            id: idDePrueba<'DesafioDeSegundoFactor'>(),
            usuarioId: idDePrueba<'Usuario'>(),
            hashDelToken: new Uint8Array(largo),
            ahora: new Date(),
            duracionMs: MINUTO,
          }),
        ).toThrow(
          expect.objectContaining({ codigo: 'segundo_factor.hash_invalido' }),
        );
      },
    );

    it.each([0, -1, 1.5, Number.NaN])(
      'rechaza una duración de %s',
      (duracionMs) => {
        expect(() => desafioNuevo(new RelojFalso(), duracionMs)).toThrow(
          expect.objectContaining({
            codigo: 'segundo_factor.duracion_invalida',
          }),
        );
      },
    );
  });

  describe('evaluar', () => {
    it('es válido hasta el último milisegundo y expirado desde el vencimiento', () => {
      const reloj = new RelojFalso();
      const desafio = desafioNuevo(reloj);

      reloj.avanzar(5 * MINUTO - 1);
      expect(desafio.evaluar(reloj.ahora())).toBe('valido');

      reloj.avanzar(1);
      expect(desafio.evaluar(reloj.ahora())).toBe('expirado');
    });

    it('«usado» gana sobre «expirado»: un desafío gastado nunca vuelve a servir', () => {
      const reloj = new RelojFalso();
      const desafio = desafioNuevo(reloj);
      desafio.usar(reloj.ahora());

      reloj.avanzar(6 * MINUTO);

      expect(desafio.evaluar(reloj.ahora())).toBe('usado');
    });
  });

  describe('usar', () => {
    it('lo marca como usado en ese instante', () => {
      const reloj = new RelojFalso();
      const desafio = desafioNuevo(reloj);
      reloj.avanzar(MINUTO);

      desafio.usar(reloj.ahora());

      expect(desafio.usadoEn).toEqual(reloj.ahora());
      expect(desafio.evaluar(reloj.ahora())).toBe('usado');
    });

    it('un segundo uso falla y conserva la primera marca', () => {
      const reloj = new RelojFalso();
      const desafio = desafioNuevo(reloj);
      const primera = reloj.ahora();
      desafio.usar(primera);
      reloj.avanzar(MINUTO);

      expect(() => desafio.usar(reloj.ahora())).toThrow(
        expect.objectContaining({
          codigo: 'segundo_factor.desafio_no_valido',
        }),
      );
      expect(desafio.usadoEn).toEqual(primera);
    });

    it('un desafío vencido no se puede usar', () => {
      const reloj = new RelojFalso();
      const desafio = desafioNuevo(reloj);
      reloj.avanzar(5 * MINUTO);

      expect(() => desafio.usar(reloj.ahora())).toThrow(
        expect.objectContaining({
          codigo: 'segundo_factor.desafio_no_valido',
        }),
      );
      expect(desafio.usadoEn).toBeNull();
    });
  });
});
