import { Contrasena } from '../../../../src/identidad/dominio/contrasena.js';
import { DiccionarioDeContrasenasComunesDeArchivo } from '../../../../src/identidad/infraestructura/salida/contrasenas/diccionario-de-contrasenas-comunes.js';

describe('DiccionarioDeContrasenasComunesDeArchivo', () => {
  describe('con el archivo real', () => {
    const diccionario = new DiccionarioDeContrasenasComunesDeArchivo();

    it('carga miles de contraseñas', () => {
      expect(diccionario.cantidad).toBeGreaterThan(5_000);
    });

    it.each(['1234567890', 'qwertyuiop', 'basketball'])(
      'reconoce %s como común',
      (comun) => {
        expect(diccionario.contiene(comun)).toBe(true);
      },
    );

    it('no distingue mayúsculas', () => {
      expect(diccionario.contiene('QwErTyUiOp')).toBe(true);
    });

    it('no marca como común una contraseña larga y única', () => {
      expect(diccionario.contiene('caballo-bateria-grapa-correcta-42')).toBe(
        false,
      );
    });

    it('todas son de un largo que la política acepta (el resto ya lo rechaza el largo mínimo)', () => {
      // Una común de menos de 10 caracteres nunca llegaría hasta la lista: la rechaza el largo.
      expect(diccionario.contiene('password')).toBe(false);
    });

    it('Contrasena.crear rechaza una común', () => {
      expect(() => Contrasena.crear('QWERTYUIOP', diccionario)).toThrow(
        expect.objectContaining({ codigo: 'contrasena.comun' }),
      );
    });
  });

  describe('con un contenido propio', () => {
    it('ignora líneas vacías, espacios y retornos de carro', () => {
      const diccionario = new DiccionarioDeContrasenasComunesDeArchivo(
        'una-comun \r\n\r\n  otra-comun\n',
      );

      expect(diccionario.cantidad).toBe(2);
      expect(diccionario.contiene('una-comun')).toBe(true);
      expect(diccionario.contiene('otra-comun')).toBe(true);
      expect(diccionario.contiene('')).toBe(false);
    });
  });
});
