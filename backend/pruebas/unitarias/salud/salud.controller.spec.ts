import type { Response } from 'express';
import type { BaseDeDatos } from '../../../src/compartido/infraestructura/base-de-datos/base-de-datos.module.js';
import { SaludController } from '../../../src/salud/salud.controller.js';

function baseQue(responde: boolean): BaseDeDatos {
  return {
    execute: () =>
      responde
        ? Promise.resolve({ rows: [] })
        : Promise.reject(new Error('connect ECONNREFUSED')),
  } as unknown as BaseDeDatos;
}

function respuestaFalsa() {
  const status = vi.fn();
  return { respuesta: { status } as unknown as Response, status };
}

describe('SaludController', () => {
  it('responde que el proceso está vivo', () => {
    expect(new SaludController(baseQue(false)).vivo()).toEqual({
      estado: 'ok',
    });
  });

  it('está listo si la base responde', async () => {
    const { respuesta, status } = respuestaFalsa();

    await expect(
      new SaludController(baseQue(true)).listo(respuesta),
    ).resolves.toEqual({ estado: 'listo', baseDeDatos: 'ok' });
    expect(status).not.toHaveBeenCalled();
  });

  it('responde 503 si la base no responde', async () => {
    const { respuesta, status } = respuestaFalsa();

    await expect(
      new SaludController(baseQue(false)).listo(respuesta),
    ).resolves.toEqual({ estado: 'no_listo', baseDeDatos: 'sin_conexion' });
    expect(status).toHaveBeenCalledWith(503);
  });
});
