import { FalloDeEnvio } from '../../../../src/notificaciones/aplicacion/puertos/salida/canal-de-notificacion.js';
import {
  CanalDeApp,
  CanalSimulado,
} from '../../../../src/notificaciones/infraestructura/salida/canales/canales.js';

const mensaje = (telefono: string | null = '+573001234567') => ({
  destinatario: {
    usuarioId: '0198aaaa-0000-7000-8000-0000000000f1',
    nombre: 'Andrea Gómez',
    correo: 'andrea@ejemplo.co',
    telefono,
  },
  titulo: 'Servicio confirmado',
  cuerpo: 'Texto del aviso',
  prioridad: 'normal' as const,
});

describe('CanalDeApp', () => {
  it('es el canal «app» y entrega al instante: el aviso guardado ES el mensaje', async () => {
    const canal = new CanalDeApp();

    expect(canal.canal).toBe('app');
    expect(await canal.enviar()).toBe('entregada');
  });
});

describe('CanalSimulado', () => {
  it.each(['correo', 'sms', 'whatsapp', 'push'] as const)(
    'finge ser %s: responde que el proveedor lo aceptó, no que llegó',
    async (nombre) => {
      const canal = new CanalSimulado(nombre);

      expect(canal.canal).toBe(nombre);
      expect(await canal.enviar(mensaje())).toBe('enviada');
    },
  );

  it.each(['sms', 'whatsapp'] as const)(
    '%s sin teléfono falla de forma definitiva (reintentar no lo arregla)',
    async (nombre) => {
      const canal = new CanalSimulado(nombre);

      await expect(canal.enviar(mensaje(null))).rejects.toMatchObject({
        constructor: FalloDeEnvio,
        definitivo: true,
      });
    },
  );

  it('el correo no necesita teléfono', async () => {
    expect(await new CanalSimulado('correo').enviar(mensaje(null))).toBe(
      'enviada',
    );
  });
});
