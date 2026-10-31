import { TokenDeRecuperacion } from '../../../../src/identidad/dominio/token-de-recuperacion.js';
import { RelojFalso } from '../../../soporte/dobles.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const MINUTO = 60_000;

function tokenNuevo(reloj: RelojFalso, duracionMs = 30 * MINUTO) {
  return TokenDeRecuperacion.emitir({
    id: idDePrueba<'TokenDeRecuperacion'>(),
    usuarioId: idDePrueba<'Usuario'>(),
    hashDelToken: new Uint8Array(32).fill(9),
    ahora: reloj.ahora(),
    duracionMs,
  });
}

describe('TokenDeRecuperacion', () => {
  describe('emitir', () => {
    it('vence después de la duración indicada y nace sin usar', () => {
      const reloj = new RelojFalso();

      const token = tokenNuevo(reloj);

      expect(token.creadoEn).toEqual(reloj.ahora());
      expect(token.expiraEn).toEqual(
        new Date(reloj.ahora().getTime() + 30 * MINUTO),
      );
      expect(token.usadoEn).toBeNull();
    });

    it.each([0, 31, 33])(
      'rechaza un hash de %i bytes: solo vale un SHA-256, y un token en claro no cabe',
      (largo) => {
        expect(() =>
          TokenDeRecuperacion.emitir({
            id: idDePrueba<'TokenDeRecuperacion'>(),
            usuarioId: idDePrueba<'Usuario'>(),
            hashDelToken: new Uint8Array(largo),
            ahora: new Date(),
            duracionMs: MINUTO,
          }),
        ).toThrow(
          expect.objectContaining({ codigo: 'recuperacion.hash_invalido' }),
        );
      },
    );

    it.each([0, -1, 1.5, Number.NaN])(
      'rechaza una duración de %s',
      (duracionMs) => {
        expect(() => tokenNuevo(new RelojFalso(), duracionMs)).toThrow(
          expect.objectContaining({ codigo: 'recuperacion.duracion_invalida' }),
        );
      },
    );
  });

  describe('evaluar', () => {
    it('es válido hasta el último milisegundo y expirado desde el vencimiento', () => {
      const reloj = new RelojFalso();
      const token = tokenNuevo(reloj);

      reloj.avanzar(30 * MINUTO - 1);
      expect(token.evaluar(reloj.ahora())).toBe('valido');

      reloj.avanzar(1);
      expect(token.evaluar(reloj.ahora())).toBe('expirado');
    });

    it('«usado» gana sobre «expirado»: un enlace gastado nunca vuelve a servir', () => {
      const reloj = new RelojFalso();
      const token = tokenNuevo(reloj);
      token.usar(reloj.ahora());

      reloj.avanzar(31 * MINUTO);

      expect(token.evaluar(reloj.ahora())).toBe('usado');
    });
  });

  describe('usar', () => {
    it('lo marca como usado en ese instante', () => {
      const reloj = new RelojFalso();
      const token = tokenNuevo(reloj);
      reloj.avanzar(5 * MINUTO);

      token.usar(reloj.ahora());

      expect(token.usadoEn).toEqual(reloj.ahora());
      expect(token.evaluar(reloj.ahora())).toBe('usado');
    });

    it('un segundo uso falla y conserva la primera marca', () => {
      const reloj = new RelojFalso();
      const token = tokenNuevo(reloj);
      const primera = reloj.ahora();
      token.usar(primera);
      reloj.avanzar(MINUTO);

      expect(() => token.usar(reloj.ahora())).toThrow(
        expect.objectContaining({ codigo: 'recuperacion.enlace_no_valido' }),
      );
      expect(token.usadoEn).toEqual(primera);
    });

    it('un enlace vencido no se puede usar', () => {
      const reloj = new RelojFalso();
      const token = tokenNuevo(reloj);
      reloj.avanzar(30 * MINUTO);

      expect(() => token.usar(reloj.ahora())).toThrow(
        expect.objectContaining({ codigo: 'recuperacion.enlace_no_valido' }),
      );
      expect(token.usadoEn).toBeNull();
    });
  });
});
