import type { ManejadorDeEventos } from '../../../../src/compartido/aplicacion/puertos/manejador-de-eventos.js';
import { RegistroDeManejadores } from '../../../../src/compartido/infraestructura/outbox/registro-de-manejadores.js';

const manejador = (nombre: string, tipo: string): ManejadorDeEventos => ({
  nombre,
  tipo,
  manejar: () => Promise.resolve(),
});

describe('RegistroDeManejadores', () => {
  it('devuelve los manejadores de un tipo de evento', () => {
    const registro = new RegistroDeManejadores();
    const avisar = manejador(
      'notificaciones.avisar',
      'reservas.servicio_confirmado',
    );
    const cobrar = manejador('pagos.cobrar', 'reservas.servicio_confirmado');
    registro.registrar(avisar);
    registro.registrar(cobrar);
    registro.registrar(manejador('otro', 'identidad.cuenta_eliminada'));

    expect(registro.para('reservas.servicio_confirmado')).toEqual([
      avisar,
      cobrar,
    ]);
    expect(registro.para('tipo.sin_manejadores')).toEqual([]);
  });

  it('rechaza dos manejadores con el mismo nombre', () => {
    const registro = new RegistroDeManejadores();
    registro.registrar(manejador('notificaciones.avisar', 'a.b'));

    expect(() =>
      registro.registrar(manejador('notificaciones.avisar', 'c.d')),
    ).toThrow(/notificaciones\.avisar/);
  });
});
