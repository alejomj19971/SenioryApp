import {
  BLOQUEO_INICIAL_MS,
  BLOQUEO_MAXIMO_MS,
  Credencial,
} from '../../../../src/identidad/dominio/credencial.js';
import {
  HASH_DE_PRUEBA,
  credencialDePrueba,
  idDePrueba,
} from '../../../soporte/identidad.js';
import { RelojFalso } from '../../../soporte/dobles.js';

const MINUTO = 60_000;

// Falla `veces` veces seguidas, sin esperar entre intentos.
function fallar(credencial: Credencial, reloj: RelojFalso, veces: number) {
  let ultimo;
  for (let i = 0; i < veces; i++)
    ultimo = credencial.registrarFallo(reloj.ahora());
  return ultimo;
}

describe('Credencial', () => {
  describe('creación', () => {
    it('nace sin fallos y sin bloqueo', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());

      expect(credencial.intentosFallidos).toBe(0);
      expect(credencial.bloqueadoHasta).toBeNull();
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(false);
      expect(credencial.hash).toBe(HASH_DE_PRUEBA);
    });

    it.each([
      ['la contraseña en claro', 'contraseña-que-escribió-la-persona'],
      ['texto vacío', ''],
      ['un hash sin el formato PHC', 'aGFzaGhhc2g='],
    ])('rechaza guardar %s como si fuera un hash', (_caso, hash) => {
      expect(() => Credencial.nueva(idDePrueba(), hash, new Date())).toThrow(
        expect.objectContaining({ codigo: 'credencial.hash_invalido' }),
      );
    });
  });

  describe('bloqueo progresivo', () => {
    it('los primeros cuatro fallos no bloquean', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());

      for (let i = 1; i <= 4; i++) {
        const resultado = credencial.registrarFallo(reloj.ahora());
        expect(resultado).toEqual({ bloqueada: false, bloqueadoHasta: null });
        expect(credencial.intentosFallidos).toBe(i);
      }
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(false);
    });

    it('el quinto fallo bloquea 15 minutos', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());

      const resultado = fallar(credencial, reloj, 5);

      const hasta = new Date(reloj.ahora().getTime() + 15 * MINUTO);
      expect(resultado).toEqual({ bloqueada: true, bloqueadoHasta: hasta });
      expect(credencial.bloqueadoHasta).toEqual(hasta);
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(true);
    });

    it('el bloqueo termina exactamente a los 15 minutos', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 5);

      reloj.avanzar(15 * MINUTO - 1);
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(true);
      reloj.avanzar(1);
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(false);
    });

    it('el bloqueo siguiente (fallo 10) dura 30 minutos, el otro (fallo 15) 1 hora', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 5);
      reloj.avanzar(15 * MINUTO);

      // Tras el primer bloqueo, los fallos 6 a 9 no vuelven a bloquear.
      for (let i = 6; i <= 9; i++) {
        expect(credencial.registrarFallo(reloj.ahora()).bloqueada).toBe(false);
      }
      const segundo = credencial.registrarFallo(reloj.ahora());
      expect(segundo.bloqueadoHasta).toEqual(
        new Date(reloj.ahora().getTime() + 30 * MINUTO),
      );

      reloj.avanzar(30 * MINUTO);
      fallar(credencial, reloj, 5);
      expect(credencial.bloqueadoHasta).toEqual(
        new Date(reloj.ahora().getTime() + 60 * MINUTO),
      );
    });

    it('la duración se duplica en cada bloqueo y se detiene en 24 horas', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      const duraciones: number[] = [];

      for (let bloqueo = 0; bloqueo < 10; bloqueo++) {
        fallar(credencial, reloj, 5);
        const hasta = credencial.bloqueadoHasta;
        if (hasta === null) throw new Error('debía estar bloqueada');
        duraciones.push((hasta.getTime() - reloj.ahora().getTime()) / MINUTO);
        reloj.avanzar(BLOQUEO_MAXIMO_MS);
      }

      expect(duraciones).toEqual([
        15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440,
      ]);
      expect(BLOQUEO_INICIAL_MS).toBe(15 * MINUTO);
    });

    it('un fallo durante el bloqueo no cuenta ni lo extiende', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 5);
      const hasta = credencial.bloqueadoHasta;
      const actualizadaEn = credencial.actualizadoEn;
      reloj.avanzar(5 * MINUTO);

      const resultado = credencial.registrarFallo(reloj.ahora());

      expect(resultado).toEqual({ bloqueada: true, bloqueadoHasta: hasta });
      expect(credencial.intentosFallidos).toBe(5);
      expect(credencial.bloqueadoHasta).toEqual(hasta);
      expect(credencial.actualizadoEn).toEqual(actualizadaEn);
    });

    it('con el contador en el tope, cada fallo vuelve a bloquear 24 horas', () => {
      const reloj = new RelojFalso();
      const credencial = Credencial.reconstruir({
        usuarioId: idDePrueba(),
        hash: HASH_DE_PRUEBA,
        intentosFallidos: 999,
        bloqueadoHasta: null,
        actualizadoEn: reloj.ahora(),
      });

      credencial.registrarFallo(reloj.ahora());
      expect(credencial.intentosFallidos).toBe(1_000);
      expect(credencial.bloqueadoHasta).toEqual(
        new Date(reloj.ahora().getTime() + BLOQUEO_MAXIMO_MS),
      );

      reloj.avanzar(BLOQUEO_MAXIMO_MS);
      credencial.registrarFallo(reloj.ahora());
      expect(credencial.intentosFallidos).toBe(1_000);
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(true);
    });
  });

  describe('inicio de sesión correcto', () => {
    it('reinicia el contador', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 4);

      reloj.avanzar(MINUTO);
      credencial.registrarExito(reloj.ahora());

      expect(credencial.intentosFallidos).toBe(0);
      expect(credencial.actualizadoEn).toEqual(reloj.ahora());
      // Tras un éxito, hacen falta otros 5 fallos para bloquear (no 1).
      fallar(credencial, reloj, 4);
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(false);
    });

    it('reinicia también la duración del bloqueo: el siguiente vuelve a ser de 15 minutos', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 5);
      reloj.avanzar(15 * MINUTO);

      credencial.registrarExito(reloj.ahora());
      expect(credencial.bloqueadoHasta).toBeNull();
      fallar(credencial, reloj, 5);

      expect(credencial.bloqueadoHasta).toEqual(
        new Date(reloj.ahora().getTime() + 15 * MINUTO),
      );
    });

    it('con la cuenta bloqueada falla aunque la contraseña sea la correcta, y no cambia nada', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 5);
      const hasta = credencial.bloqueadoHasta;

      expect(() => credencial.registrarExito(reloj.ahora())).toThrow(
        expect.objectContaining({ codigo: 'credencial.bloqueada' }),
      );
      expect(credencial.intentosFallidos).toBe(5);
      expect(credencial.bloqueadoHasta).toEqual(hasta);
    });
  });

  describe('cambio de hash', () => {
    it('reemplaza el hash sin tocar el control de intentos', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 3);
      reloj.avanzar(MINUTO);

      credencial.cambiarHash(
        '$argon2id$v=19$m=65536,t=3,p=1$bnVldm8$bnVldm8',
        reloj.ahora(),
      );

      expect(credencial.hash).toContain('m=65536');
      expect(credencial.intentosFallidos).toBe(3);
      expect(credencial.actualizadoEn).toEqual(reloj.ahora());
    });

    it('rechaza un hash inválido y conserva el anterior', () => {
      const credencial = credencialDePrueba();

      expect(() =>
        credencial.cambiarHash('texto-en-claro', new Date()),
      ).toThrow(
        expect.objectContaining({ codigo: 'credencial.hash_invalido' }),
      );
      expect(credencial.hash).toBe(HASH_DE_PRUEBA);
    });
  });

  describe('restablecer', () => {
    const HASH_NUEVO = '$argon2id$v=19$m=19456,t=2,p=1$bnVldm8$bnVldm8';

    it('cambia el hash, levanta el bloqueo y reinicia los intentos', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 5);
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(true);
      reloj.avanzar(MINUTO);

      credencial.restablecer(HASH_NUEVO, reloj.ahora());

      expect(credencial.hash).toBe(HASH_NUEVO);
      expect(credencial.intentosFallidos).toBe(0);
      expect(credencial.bloqueadoHasta).toBeNull();
      expect(credencial.estaBloqueada(reloj.ahora())).toBe(false);
      expect(credencial.actualizadoEn).toEqual(reloj.ahora());
    });

    it('después de restablecer, el bloqueo progresivo vuelve a empezar desde 15 minutos', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 5);
      reloj.avanzar(BLOQUEO_INICIAL_MS + 1);
      fallar(credencial, reloj, 5); // segundo bloqueo: 30 min
      credencial.restablecer(HASH_NUEVO, reloj.ahora());

      const resultado = fallar(credencial, reloj, 5);

      expect(resultado?.bloqueadoHasta).toEqual(
        new Date(reloj.ahora().getTime() + BLOQUEO_INICIAL_MS),
      );
    });

    it('rechaza un hash inválido (la contraseña en claro) y no cambia nada', () => {
      const reloj = new RelojFalso();
      const credencial = credencialDePrueba(idDePrueba(), reloj.ahora());
      fallar(credencial, reloj, 3);

      expect(() =>
        credencial.restablecer('una contraseña en claro', reloj.ahora()),
      ).toThrow(
        expect.objectContaining({ codigo: 'credencial.hash_invalido' }),
      );

      expect(credencial.hash).toBe(HASH_DE_PRUEBA);
      expect(credencial.intentosFallidos).toBe(3);
    });
  });
});
