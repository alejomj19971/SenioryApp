import { inspect } from 'node:util';
import { ErrorDeValidacion } from '../../../../src/compartido/dominio/errores.js';
import { Contrasena } from '../../../../src/identidad/dominio/contrasena.js';
import { sinComunes } from '../../../soporte/identidad.js';

const VALIDA = 'caballo-bateria-grapa-correcta';

describe('Contrasena', () => {
  describe('creación', () => {
    it('acepta una contraseña de largo suficiente, sin reglas de composición', () => {
      // Sin mayúsculas, números ni símbolos: el largo es lo que importa (NIST 800-63B).
      expect(
        Contrasena.crear('solo minusculas y espacios', sinComunes).revelar(),
      ).toBe('solo minusculas y espacios');
    });

    it('admite de 10 a 128 caracteres', () => {
      expect(() => Contrasena.crear('a'.repeat(10), sinComunes)).not.toThrow();
      expect(() => Contrasena.crear('a'.repeat(128), sinComunes)).not.toThrow();
    });

    it.each([9, 129, 0])('rechaza %i caracteres', (largo) => {
      expect(() => Contrasena.crear('a'.repeat(largo), sinComunes)).toThrow(
        expect.objectContaining({ codigo: 'contrasena.largo_invalido' }),
      );
    });

    it('cuenta caracteres, no unidades de texto: 10 emojis bastan', () => {
      expect(() => Contrasena.crear('🔑'.repeat(10), sinComunes)).not.toThrow();
      expect(() => Contrasena.crear('🔑'.repeat(9), sinComunes)).toThrow(
        ErrorDeValidacion,
      );
    });

    it.each([
      ['carácter nulo', 'abcdefghi\u0000j'],
      ['salto de línea', 'abcdefghi\nj'],
      ['tabulación', 'abcdefghi\tj'],
    ])('rechaza una contraseña con %s', (_caso, texto) => {
      expect(() => Contrasena.crear(texto, sinComunes)).toThrow(
        expect.objectContaining({ codigo: 'contrasena.caracteres_invalidos' }),
      );
    });

    it('rechaza las contraseñas comunes', () => {
      const comunes = { contiene: (texto: string) => texto === 'password123' };

      expect(() => Contrasena.crear('password123', comunes)).toThrow(
        expect.objectContaining({ codigo: 'contrasena.comun' }),
      );
      expect(() => Contrasena.crear('password1234', comunes)).not.toThrow();
    });

    it('revisa el largo antes que la lista de comunes', () => {
      const contiene = vi.fn(() => true);

      expect(() => Contrasena.crear('corta', { contiene })).toThrow(
        expect.objectContaining({ codigo: 'contrasena.largo_invalido' }),
      );
      expect(contiene).not.toHaveBeenCalled();
    });
  });

  describe('normalización NFKC', () => {
    it('la misma contraseña escrita con caracteres equivalentes da el mismo valor', () => {
      // «ｐａｓｓｗｏｒｄ１２３» en caracteres de ancho completo, como las produce algún teclado móvil.
      const anchoCompleto = Contrasena.crear(
        'ｐａｓｓｗｏｒｄ１２３',
        sinComunes,
      );
      const normal = Contrasena.crear('password123', sinComunes);

      expect(anchoCompleto.revelar()).toBe(normal.revelar());
    });

    it('la lista de comunes recibe el texto ya normalizado', () => {
      const contiene = vi.fn(() => false);

      Contrasena.crear('ｐａｓｓｗｏｒｄ１２３', { contiene });

      expect(contiene).toHaveBeenCalledWith('password123');
    });
  });

  describe('paraVerificar (inicio de sesión)', () => {
    it('no aplica las reglas de creación: una contraseña antigua debe poder entrar', () => {
      expect(Contrasena.paraVerificar('corta').revelar()).toBe('corta');
      expect(Contrasena.paraVerificar('').revelar()).toBe('');
    });

    it('normaliza igual que al crear, para que el hash coincida', () => {
      expect(Contrasena.paraVerificar('ｐａｓｓｗｏｒｄ１２３').revelar()).toBe(
        Contrasena.crear('password123', sinComunes).revelar(),
      );
    });
  });

  describe('no se filtra por accidente', () => {
    const contrasena = Contrasena.crear(VALIDA, sinComunes);

    it.each([
      ['toString', () => String(contrasena)],
      ['una plantilla de texto', () => `clave: ${contrasena.toString()}`],
      ['JSON.stringify', () => JSON.stringify({ contrasena })],
      ['util.inspect (consola y logs)', () => inspect(contrasena)],
      [
        'util.inspect anidado',
        () => inspect({ datos: { contrasena } }, { depth: 5 }),
      ],
    ])('%s no muestra el valor', (_caso, mostrar) => {
      expect(mostrar()).not.toContain(VALIDA);
      expect(mostrar()).not.toContain('caballo');
    });

    it('los mensajes de error no incluyen la contraseña', () => {
      const intentoCorto = 'cinco';
      try {
        Contrasena.crear(intentoCorto, sinComunes);
        expect.unreachable();
      } catch (error) {
        expect((error as Error).message).not.toContain(intentoCorto);
      }
    });

    it('solo revelar() entrega el valor', () => {
      expect(contrasena.revelar()).toBe(VALIDA);
    });
  });
});
