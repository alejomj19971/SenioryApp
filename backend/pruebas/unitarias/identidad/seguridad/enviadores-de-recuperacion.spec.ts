import { Logger } from '@nestjs/common';
import {
  EnviadorDeRecuperacionDeshabilitado,
  EnviadorDeRecuperacionEnConsola,
} from '../../../../src/identidad/infraestructura/salida/recuperacion/enviadores-de-recuperacion.js';

const MENSAJE = {
  nombre: 'Andrea',
  correo: 'andrea@prueba.seniory.invalid',
  enlace: 'http://localhost:3000/restablecer-contrasena?token=abc',
  expiraEn: new Date('2035-03-01T12:30:00Z'),
};

describe('enviadores de recuperación', () => {
  describe('en consola (solo desarrollo)', () => {
    it('está disponible y escribe el enlace en el log, con una advertencia de que es solo para desarrollo', async () => {
      const advertir = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const enviador = new EnviadorDeRecuperacionEnConsola();

      await enviador.enviar(MENSAJE);

      expect(enviador.disponible).toBe(true);
      expect(advertir).toHaveBeenCalledOnce();
      const texto = String(advertir.mock.calls[0]?.[0]);
      expect(texto).toContain('SOLO DESARROLLO');
      expect(texto).toContain(MENSAJE.enlace);
      advertir.mockRestore();
    });
  });

  describe('deshabilitado (producción mientras no haya correo)', () => {
    it('no está disponible y no finge enviar: falla si alguien lo llama', async () => {
      const enviador = new EnviadorDeRecuperacionDeshabilitado();

      expect(enviador.disponible).toBe(false);
      await expect(enviador.enviar()).rejects.toThrow(/canal/);
    });
  });
});
