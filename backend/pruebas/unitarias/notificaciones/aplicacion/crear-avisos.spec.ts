import {
  AVISOS_NORMALES_POR_HORA,
  CrearAvisos,
} from '../../../../src/notificaciones/aplicacion/casos-de-uso/crear-avisos.js';
import type { Canal } from '../../../../src/notificaciones/dominio/valores-cerrados.js';
import {
  GeneradorDeIdsSecuencial,
  RelojFalso,
} from '../../../soporte/dobles.js';
import {
  CanalFalso,
  PARAMETROS_DE_SERVICIO,
  RepositorioNotificacionesEnMemoria,
} from '../../../soporte/notificaciones.js';

const DESTINATARIO = '0198aaaa-0000-7000-8000-0000000000f1';

function montar(canales: Canal[]) {
  const repositorio = new RepositorioNotificacionesEnMemoria();
  const reloj = new RelojFalso('2026-10-21T15:00:00.000Z');
  const caso = new CrearAvisos(
    repositorio,
    canales.map((c) => new CanalFalso(c)),
    new GeneradorDeIdsSecuencial(),
    reloj,
  );
  return { caso, repositorio, reloj };
}

const aviso = (cambios = {}) => ({
  eventoId: '0198aaaa-0000-7000-8000-0000000000e1',
  destinatarioId: DESTINATARIO,
  tipo: 'servicio_confirmado:familia',
  prioridad: 'normal' as const,
  parametros: PARAMETROS_DE_SERVICIO,
  ...cambios,
});

const canalesDe = (r: RepositorioNotificacionesEnMemoria) =>
  r
    .avisos()
    .map((a) => a.canal)
    .sort();

describe('CrearAvisos', () => {
  describe('avisos normales', () => {
    it('salen por la aplicación y el correo, cada uno como un aviso aparte', async () => {
      const { caso, repositorio } = montar([
        'app',
        'correo',
        'sms',
        'whatsapp',
      ]);

      const creados = await caso.ejecutar(aviso());

      expect(creados).toBe(2);
      expect(canalesDe(repositorio)).toEqual(['app', 'correo']);
      expect(repositorio.avisos().every((a) => a.estado === 'pendiente')).toBe(
        true,
      );
    });

    it('SMS y WhatsApp se reservan para las alertas, aunque existan', async () => {
      const { caso, repositorio } = montar(['app', 'sms', 'whatsapp', 'push']);

      await caso.ejecutar(aviso());

      expect(canalesDe(repositorio)).toEqual(['app']);
    });

    it('si el correo no existe en este entorno, sale solo por la aplicación', async () => {
      const { caso, repositorio } = montar(['app']);

      await caso.ejecutar(aviso());

      expect(canalesDe(repositorio)).toEqual(['app']);
    });

    it('sin ningún canal disponible no crea nada', async () => {
      const { caso, repositorio } = montar([]);

      expect(await caso.ejecutar(aviso())).toBe(0);
      expect(repositorio.avisos()).toEqual([]);
    });
  });

  describe('alertas (prioridad alta)', () => {
    it('salen por TODOS los canales disponibles a la vez', async () => {
      const { caso, repositorio } = montar([
        'app',
        'correo',
        'sms',
        'whatsapp',
        'push',
      ]);

      const creados = await caso.ejecutar(aviso({ prioridad: 'alta' }));

      expect(creados).toBe(5);
      expect(canalesDe(repositorio)).toEqual([
        'app',
        'correo',
        'push',
        'sms',
        'whatsapp',
      ]);
      expect(repositorio.avisos().every((a) => a.prioridad === 'alta')).toBe(
        true,
      );
    });

    it('con un solo canal real, sale por ese', async () => {
      const { caso, repositorio } = montar(['app']);

      await caso.ejecutar(aviso({ prioridad: 'alta' }));

      expect(canalesDe(repositorio)).toEqual(['app']);
    });
  });

  describe('deduplicación', () => {
    it('procesar dos veces el mismo evento no repite el aviso', async () => {
      const { caso, repositorio } = montar(['app', 'correo']);

      const primera = await caso.ejecutar(aviso());
      const segunda = await caso.ejecutar(aviso());

      expect(primera).toBe(2);
      expect(segunda).toBe(0);
      expect(repositorio.avisos()).toHaveLength(2);
    });

    it('otro evento, otro destinatario o otro tipo SÍ crean su aviso', async () => {
      const { caso, repositorio } = montar(['app']);

      await caso.ejecutar(aviso());
      await caso.ejecutar(
        aviso({ eventoId: '0198aaaa-0000-7000-8000-0000000000e2' }),
      );
      await caso.ejecutar(
        aviso({ destinatarioId: '0198aaaa-0000-7000-8000-0000000000f2' }),
      );
      await caso.ejecutar(aviso({ tipo: 'servicio_confirmado:cuidador' }));

      expect(repositorio.avisos()).toHaveLength(4);
    });
  });

  describe('límite de envíos por persona', () => {
    async function llenar(
      repositorio: RepositorioNotificacionesEnMemoria,
      caso: CrearAvisos,
    ) {
      for (let i = 0; i < AVISOS_NORMALES_POR_HORA; i++) {
        await caso.ejecutar(
          aviso({
            eventoId: `0198aaaa-0000-7000-8000-${String(i).padStart(12, '0')}`,
          }),
        );
      }
      expect(repositorio.avisos()).toHaveLength(AVISOS_NORMALES_POR_HORA);
    }

    it(`pasados ${AVISOS_NORMALES_POR_HORA} avisos normales en una hora, los siguientes se omiten`, async () => {
      const { caso, repositorio } = montar(['app']);
      await llenar(repositorio, caso);

      const creados = await caso.ejecutar(
        aviso({ eventoId: '0198aaaa-0000-7000-8000-0000000fffff' }),
      );

      expect(creados).toBe(0);
      expect(repositorio.avisos()).toHaveLength(AVISOS_NORMALES_POR_HORA);
    });

    it('una ALERTA nunca se descarta por el límite', async () => {
      const { caso, repositorio } = montar(['app']);
      await llenar(repositorio, caso);

      const creados = await caso.ejecutar(
        aviso({
          eventoId: '0198aaaa-0000-7000-8000-0000000fffff',
          prioridad: 'alta',
        }),
      );

      expect(creados).toBe(1);
    });

    it('pasada una hora, el cupo vuelve', async () => {
      const { caso, repositorio, reloj } = montar(['app']);
      await llenar(repositorio, caso);
      reloj.avanzar(60 * 60_000 + 1000);

      const creados = await caso.ejecutar(
        aviso({ eventoId: '0198aaaa-0000-7000-8000-0000000fffff' }),
      );

      expect(creados).toBe(1);
    });

    it('el límite es por persona: a otra no la afecta', async () => {
      const { caso, repositorio } = montar(['app']);
      await llenar(repositorio, caso);

      const creados = await caso.ejecutar(
        aviso({ destinatarioId: '0198aaaa-0000-7000-8000-0000000000f9' }),
      );

      expect(creados).toBe(1);
    });
  });
});
