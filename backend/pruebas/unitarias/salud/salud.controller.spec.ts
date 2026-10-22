import { SaludController } from '../../../src/salud/salud.controller.js';

describe('SaludController', () => {
  it('responde que el proceso está vivo', () => {
    expect(new SaludController().vivo()).toEqual({ estado: 'ok' });
  });
});
