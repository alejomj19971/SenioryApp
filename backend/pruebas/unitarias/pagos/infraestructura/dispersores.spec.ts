import { describe, expect, it } from 'vitest';
import {
  DispersorDeshabilitado,
  DispersorManual,
  DispersorSimulado,
} from '../../../../src/pagos/infraestructura/salida/dispersion/dispersores.js';

describe('DispersorManual', () => {
  it('está habilitado y siempre marca la orden como «enviada», con una referencia rastreable', async () => {
    const dispersor = new DispersorManual();

    expect(dispersor.habilitado).toBe(true);
    const resultado = await dispersor.dispersar({
      liquidacionId: 'liq-1',
      cuidadorId: 'cuid-1',
      monto: 36_000,
    });

    expect(resultado).toEqual({ estado: 'enviada', referencia: 'manual:liq-1' });
  });

  it('no inventa un pago: nunca devuelve «pagada» ni «rechazada»', async () => {
    const dispersor = new DispersorManual();
    const resultado = await dispersor.dispersar({
      liquidacionId: 'liq-2',
      cuidadorId: 'cuid-2',
      monto: 10_000,
    });

    expect(resultado.estado).toBe('enviada');
  });
});

describe('DispersorDeshabilitado', () => {
  it('no está habilitado y rechaza cualquier intento', async () => {
    const dispersor = new DispersorDeshabilitado();

    expect(dispersor.habilitado).toBe(false);
    await expect(dispersor.dispersar()).rejects.toThrow(
      'Los pagos a los cuidadores no están disponibles por ahora',
    );
  });
});

describe('DispersorSimulado', () => {
  it('paga de una, sin repetir la misma liquidación', async () => {
    const dispersor = new DispersorSimulado();

    const primera = await dispersor.dispersar({
      liquidacionId: 'liq-3',
      cuidadorId: 'cuid-3',
      monto: 5_000,
    });
    expect(primera).toEqual({ estado: 'pagada', referencia: 'sim_pago_liq-3' });
    expect(dispersor.ordenesRecibidas().size).toBe(1);
  });

  it('rechaza una liquidación marcada como tal, con el motivo', async () => {
    const dispersor = new DispersorSimulado();
    dispersor.rechazarLiquidacion('liq-4');

    const resultado = await dispersor.dispersar({
      liquidacionId: 'liq-4',
      cuidadorId: 'cuid-4',
      monto: 5_000,
    });

    expect(resultado).toEqual({
      estado: 'rechazada',
      motivo: 'cuenta_inexistente',
    });
  });

  it('falla pasajeramente cuando se le pide, sin quedar pegado así', async () => {
    const dispersor = new DispersorSimulado();
    dispersor.fallarPasajeramente(true);

    await expect(
      dispersor.dispersar({ liquidacionId: 'liq-5', cuidadorId: 'c', monto: 1 }),
    ).rejects.toThrow('El proveedor no respondió');

    dispersor.fallarPasajeramente(false);
    await expect(
      dispersor.dispersar({ liquidacionId: 'liq-5', cuidadorId: 'c', monto: 1 }),
    ).resolves.toMatchObject({ estado: 'pagada' });
  });
});
