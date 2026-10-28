import {
  SesionDeRefresco,
  VENTANA_DE_GRACIA_MS,
} from '../../../../src/identidad/dominio/sesion-de-refresco.js';
import { idDePrueba } from '../../../soporte/identidad.js';
import { RelojFalso } from '../../../soporte/dobles.js';

const DIA = 24 * 60 * 60_000;

function sesionNueva(reloj: RelojFalso, duracionMs = 30 * DIA) {
  return SesionDeRefresco.emitir({
    id: idDePrueba<'SesionDeRefresco'>(),
    usuarioId: idDePrueba<'Usuario'>(),
    familiaId: idDePrueba<'FamiliaDeSesiones'>(),
    hashDelToken: new Uint8Array(32).fill(7),
    ahora: reloj.ahora(),
    duracionMs,
  });
}

describe('SesionDeRefresco', () => {
  describe('emitir', () => {
    it('vence después de la duración indicada', () => {
      const reloj = new RelojFalso();

      const sesion = sesionNueva(reloj);

      expect(sesion.emitidaEn).toEqual(reloj.ahora());
      expect(sesion.expiraEn).toEqual(
        new Date(reloj.ahora().getTime() + 30 * DIA),
      );
      expect(sesion.reemplazadaEn).toBeNull();
      expect(sesion.revocadaEn).toBeNull();
    });

    it.each([31, 33, 0])(
      'rechaza un hash de %i bytes (debe ser SHA-256)',
      (bytes) => {
        expect(() =>
          SesionDeRefresco.emitir({
            id: idDePrueba(),
            usuarioId: idDePrueba(),
            familiaId: idDePrueba(),
            hashDelToken: new Uint8Array(bytes),
            ahora: new Date(),
            duracionMs: DIA,
          }),
        ).toThrow(expect.objectContaining({ codigo: 'sesion.hash_invalido' }));
      },
    );

    it.each([0, -1, 1.5, Number.NaN])(
      'rechaza la duración %s',
      (duracionMs) => {
        expect(() => sesionNueva(new RelojFalso(), duracionMs)).toThrow(
          expect.objectContaining({ codigo: 'sesion.duracion_invalida' }),
        );
      },
    );
  });

  describe('evaluarUso', () => {
    it('una sesión nueva es válida hasta el instante en que vence', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj, 1_000);

      reloj.avanzar(999);
      expect(sesion.evaluarUso(reloj.ahora())).toBe('valida');
      reloj.avanzar(1);
      expect(sesion.evaluarUso(reloj.ahora())).toBe('expirada');
    });

    it('un token reemplazado hace menos de 30 s está en gracia, hasta el límite exacto', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj);
      sesion.rotar(reloj.ahora(), idDePrueba());

      expect(sesion.evaluarUso(reloj.ahora())).toBe('en_gracia');
      reloj.avanzar(VENTANA_DE_GRACIA_MS);
      expect(sesion.evaluarUso(reloj.ahora())).toBe('en_gracia');
    });

    it('un token reemplazado hace más de 30 s es una reutilización (posible robo)', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj);
      sesion.rotar(reloj.ahora(), idDePrueba());

      reloj.avanzar(VENTANA_DE_GRACIA_MS + 1);

      expect(sesion.evaluarUso(reloj.ahora())).toBe('reutilizada');
    });

    it('un token revocado reaparece como revocado', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj);
      sesion.revocar(reloj.ahora());

      expect(sesion.evaluarUso(reloj.ahora())).toBe('revocada');
    });

    it('revocada y reutilizada pesan más que vencida: un token viejo que reaparece es sospechoso', () => {
      const reloj = new RelojFalso();
      const reemplazada = sesionNueva(reloj, 60_000);
      reemplazada.rotar(reloj.ahora(), idDePrueba());
      const revocada = sesionNueva(reloj, 60_000);
      revocada.revocar(reloj.ahora());

      reloj.avanzar(24 * 60 * 60_000); // ya vencidas las dos

      expect(reemplazada.evaluarUso(reloj.ahora())).toBe('reutilizada');
      expect(revocada.evaluarUso(reloj.ahora())).toBe('revocada');
    });

    it('un token en gracia que además venció se rechaza como vencido', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj, 60_000);
      reloj.avanzar(50_000);
      sesion.rotar(reloj.ahora(), idDePrueba());

      reloj.avanzar(15_000); // reemplazada hace 15 s (en gracia), pero venció hace 5 s

      expect(sesion.evaluarUso(reloj.ahora())).toBe('expirada');
    });
  });

  describe('rotar', () => {
    it('marca la sesión como reemplazada y guarda cuál la reemplazó', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj);
      const nueva = idDePrueba<'SesionDeRefresco'>();

      sesion.rotar(reloj.ahora(), nueva);

      expect(sesion.reemplazadaEn).toEqual(reloj.ahora());
      expect(sesion.reemplazadaPor).toBe(nueva);
    });

    it('en gracia deja intacta la primera marca: renovar a la vez no extiende la ventana', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj);
      const primera = idDePrueba<'SesionDeRefresco'>();
      const primeraEn = reloj.ahora();
      sesion.rotar(primeraEn, primera);

      reloj.avanzar(20_000);
      sesion.rotar(reloj.ahora(), idDePrueba());

      expect(sesion.reemplazadaEn).toEqual(primeraEn);
      expect(sesion.reemplazadaPor).toBe(primera);
      // Y la ventana sigue contando desde la primera: a los 31 s ya es reutilización.
      reloj.avanzar(11_000);
      expect(sesion.evaluarUso(reloj.ahora())).toBe('reutilizada');
    });

    it.each([
      [
        'reutilizada',
        (s: SesionDeRefresco, r: RelojFalso) => {
          s.rotar(r.ahora(), idDePrueba());
          r.avanzar(VENTANA_DE_GRACIA_MS + 1);
        },
      ],
      [
        'revocada',
        (s: SesionDeRefresco, r: RelojFalso) => s.revocar(r.ahora()),
      ],
      ['vencida', (_s: SesionDeRefresco, r: RelojFalso) => r.avanzar(31 * DIA)],
    ])('no deja renovar una sesión %s', (_estado, preparar) => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj);
      preparar(sesion, reloj);

      expect(() => sesion.rotar(reloj.ahora(), idDePrueba())).toThrow(
        expect.objectContaining({ codigo: 'sesion.no_renovable' }),
      );
    });
  });

  describe('revocar', () => {
    it('es idempotente y conserva el primer instante', () => {
      const reloj = new RelojFalso();
      const sesion = sesionNueva(reloj);
      const primera = reloj.ahora();

      sesion.revocar(primera);
      reloj.avanzar(60_000);
      sesion.revocar(reloj.ahora());

      expect(sesion.revocadaEn).toEqual(primera);
    });
  });

  it('reconstruir conserva los datos tal cual', () => {
    const reloj = new RelojFalso();
    const original = sesionNueva(reloj);
    original.rotar(reloj.ahora(), idDePrueba());

    const copia = SesionDeRefresco.reconstruir({
      id: original.id,
      usuarioId: original.usuarioId,
      familiaId: original.familiaId,
      hashDelToken: original.hashDelToken,
      emitidaEn: original.emitidaEn,
      expiraEn: original.expiraEn,
      reemplazadaEn: original.reemplazadaEn,
      reemplazadaPor: original.reemplazadaPor,
      revocadaEn: original.revocadaEn,
    });

    expect(copia.evaluarUso(reloj.ahora())).toBe('en_gracia');
    expect(copia.reemplazadaPor).toBe(original.reemplazadaPor);
  });
});
