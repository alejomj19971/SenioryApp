import fc from 'fast-check';
import {
  ConflictoDeEstado,
  SinPermiso,
} from '../../../../src/compartido/dominio/errores.js';
import {
  transicionar,
  transicionesPermitidas,
} from '../../../../src/reservas/dominio/maquina-de-estados.js';
import {
  ACCIONES_DE_SERVICIO,
  ACTORES,
  ESTADOS_DE_SERVICIO,
  type AccionDeServicio,
  type ActorDeServicio,
  type EstadoDeServicio,
} from '../../../../src/reservas/dominio/valores-cerrados.js';

type Arista = {
  accion: AccionDeServicio;
  actor: ActorDeServicio;
  desde: EstadoDeServicio | null;
  hacia: EstadoDeServicio;
};

// La tabla del plan (M4, «Transiciones del servicio»), escrita a mano e independiente de la implementación.
const TABLA_DEL_PLAN: Arista[] = [
  { desde: null, accion: 'solicitar', actor: 'familiar', hacia: 'solicitado' },
  {
    desde: 'solicitado',
    accion: 'aceptar',
    actor: 'cuidador',
    hacia: 'aceptado',
  },
  {
    desde: 'solicitado',
    accion: 'rechazar',
    actor: 'cuidador',
    hacia: 'cancelado',
  },
  {
    desde: 'solicitado',
    accion: 'expirar',
    actor: 'sistema',
    hacia: 'cancelado',
  },
  {
    desde: 'solicitado',
    accion: 'cancelar',
    actor: 'familiar',
    hacia: 'cancelado',
  },
  {
    desde: 'aceptado',
    accion: 'cancelar',
    actor: 'familiar',
    hacia: 'cancelado',
  },
  {
    desde: 'aceptado',
    accion: 'iniciar',
    actor: 'cuidador',
    hacia: 'en_curso',
  },
  {
    desde: 'en_curso',
    accion: 'finalizar',
    actor: 'cuidador',
    hacia: 'finalizado',
  },
  // M7: el pago del servicio no se hizo.
  {
    desde: 'aceptado',
    accion: 'cancelar_por_pago',
    actor: 'sistema',
    hacia: 'cancelado',
  },
];

const clave = (a: Pick<Arista, 'desde' | 'accion' | 'actor'>) =>
  `${a.desde ?? 'nuevo'}|${a.accion}|${a.actor}`;

const ESTADOS_DE_PARTIDA: (EstadoDeServicio | null)[] = [
  null,
  ...ESTADOS_DE_SERVICIO,
];

describe('transicionar', () => {
  it('las aristas permitidas son exactamente las de la tabla del plan', () => {
    const ordenadas = (aristas: Arista[]) => aristas.map(clave).sort();

    expect(ordenadas(transicionesPermitidas())).toEqual(
      ordenadas(TABLA_DEL_PLAN),
    );
  });

  describe('cada transición válida lleva a su estado', () => {
    it.each(TABLA_DEL_PLAN)(
      '$desde + $accion ($actor) → $hacia',
      ({ desde, accion, actor, hacia }) => {
        expect(transicionar(desde, accion, actor)).toBe(hacia);
      },
    );
  });

  describe('todas las demás combinaciones se rechazan', () => {
    // Estado × acción × actor: 6 × 8 × 3 = 144 combinaciones; 9 son válidas.
    const combinaciones = ESTADOS_DE_PARTIDA.flatMap((desde) =>
      ACCIONES_DE_SERVICIO.flatMap((accion) =>
        ACTORES.map((actor) => ({ desde, accion, actor })),
      ),
    );
    const validas = new Set(TABLA_DEL_PLAN.map(clave));
    const invalidas = combinaciones.filter((c) => !validas.has(clave(c)));

    it('hay 135 combinaciones inválidas', () => {
      expect(combinaciones).toHaveLength(144);
      expect(invalidas).toHaveLength(135);
    });

    it.each(invalidas)(
      '$desde + $accion ($actor) se rechaza',
      ({ desde, accion, actor }) => {
        const actoresDeLaAccion = TABLA_DEL_PLAN.filter(
          (a) => a.accion === accion,
        ).map((a) => a.actor);
        const error = capturar(() => transicionar(desde, accion, actor));

        // Si ese actor nunca puede hacer la acción: 403. Si puede, pero no desde ese estado: 409.
        expect(error).toBeInstanceOf(
          actoresDeLaAccion.includes(actor) ? ConflictoDeEstado : SinPermiso,
        );
      },
    );
  });

  it('los estados finales no admiten ninguna acción, de nadie', () => {
    for (const final of ['finalizado', 'cancelado'] as const) {
      for (const accion of ACCIONES_DE_SERVICIO) {
        for (const actor of ACTORES) {
          expect(() => transicionar(final, accion, actor)).toThrow();
        }
      }
    }
  });

  describe('aceptación automática', () => {
    it('al solicitar, el servicio nace aceptado si el cuidador la activó', () => {
      expect(
        transicionar(null, 'solicitar', 'familiar', {
          aceptacionAutomatica: true,
        }),
      ).toBe('aceptado');
    });

    it('por defecto, el cuidador debe aceptar', () => {
      expect(transicionar(null, 'solicitar', 'familiar')).toBe('solicitado');
      expect(
        transicionar(null, 'solicitar', 'familiar', {
          aceptacionAutomatica: false,
        }),
      ).toBe('solicitado');
    });

    it('la bandera no cambia ninguna otra acción', () => {
      expect(
        transicionar('solicitado', 'aceptar', 'cuidador', {
          aceptacionAutomatica: true,
        }),
      ).toBe('aceptado');
      expect(
        transicionar('solicitado', 'rechazar', 'cuidador', {
          aceptacionAutomatica: true,
        }),
      ).toBe('cancelado');
    });
  });

  describe('mensajes y códigos', () => {
    it('un estado que no admite la acción dice cuál es', () => {
      const error = capturar(() =>
        transicionar('finalizado', 'cancelar', 'familiar'),
      ) as ConflictoDeEstado;

      expect(error.codigo).toBe('servicio.transicion_invalida');
      expect(error.message).toBe(
        'Un servicio finalizado no admite esta acción',
      );
    });

    it('un actor no permitido no revela el estado', () => {
      const error = capturar(() =>
        transicionar('solicitado', 'aceptar', 'familiar'),
      ) as SinPermiso;

      expect(error.codigo).toBe('servicio.actor_no_permitido');
    });

    it('solicitar algo que ya existe se rechaza', () => {
      const error = capturar(() =>
        transicionar('solicitado', 'solicitar', 'familiar'),
      ) as ConflictoDeEstado;

      expect(error.message).toBe(
        'Un servicio solicitado no admite esta acción',
      );
    });
  });

  describe('propiedades sobre secuencias de acciones', () => {
    const accion = fc.constantFrom(...ACCIONES_DE_SERVICIO);
    const actor = fc.constantFrom(...ACTORES);

    it('cualquier secuencia solo pasa por estados alcanzables y nunca sale de un estado final', () => {
      const alcanzables = new Set<EstadoDeServicio>([
        'solicitado',
        'aceptado',
        'en_curso',
        'finalizado',
        'cancelado',
      ]);
      fc.assert(
        fc.property(
          fc.array(fc.tuple(accion, actor), { maxLength: 30 }),
          fc.boolean(),
          (pasos, automatica) => {
            let estado: EstadoDeServicio | null = null;
            for (const [a, quien] of [
              ['solicitar', 'familiar'] as const,
              ...pasos,
            ]) {
              try {
                estado = transicionar(estado, a, quien, {
                  aceptacionAutomatica: automatica,
                });
              } catch {
                continue; // acción rechazada: el estado no cambia
              }
              expect(alcanzables.has(estado)).toBe(true);
            }
            return true;
          },
        ),
      );
    });

    it('una vez finalizado o cancelado, el estado ya no cambia', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(accion, actor), { maxLength: 30 }),
          (pasos) => {
            let estado: EstadoDeServicio | null = null;
            let fijo: EstadoDeServicio | null = null;
            for (const [a, quien] of [
              ['solicitar', 'familiar'] as const,
              ...pasos,
            ]) {
              try {
                estado = transicionar(estado, a, quien);
              } catch {
                continue;
              }
              if (fijo !== null) {
                throw new Error(
                  `Salió del estado final ${fijo} hacia ${estado}`,
                );
              }
              if (estado === 'finalizado' || estado === 'cancelado')
                fijo = estado;
            }
            return true;
          },
        ),
      );
    });

    it('para llegar a finalizado hay que haber pasado por aceptado y en_curso, en ese orden', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(accion, actor), { maxLength: 40 }),
          (pasos) => {
            let estado: EstadoDeServicio | null = null;
            const camino: EstadoDeServicio[] = [];
            for (const [a, quien] of [
              ['solicitar', 'familiar'] as const,
              ...pasos,
            ]) {
              try {
                estado = transicionar(estado, a, quien);
              } catch {
                continue;
              }
              camino.push(estado);
            }
            if (camino.includes('finalizado')) {
              expect(camino.indexOf('solicitado')).toBeLessThan(
                camino.indexOf('aceptado'),
              );
              expect(camino.indexOf('aceptado')).toBeLessThan(
                camino.indexOf('en_curso'),
              );
              expect(camino.indexOf('en_curso')).toBeLessThan(
                camino.indexOf('finalizado'),
              );
            }
            return true;
          },
        ),
      );
    });
  });
});

function capturar(accion: () => unknown): unknown {
  try {
    accion();
  } catch (error) {
    return error;
  }
  throw new Error('Debía lanzar un error');
}
