import { Logger } from '@nestjs/common';
import type { DespachadorDeEventos } from '../../../../src/compartido/infraestructura/outbox/despachador-de-eventos.js';
import { SondeoDelOutbox } from '../../../../src/compartido/infraestructura/outbox/sondeo-del-outbox.js';

// Un despachador falso: cada vuelta devuelve el siguiente valor de `respuestas`
// (un número de eventos procesados o un error).
function despachadorFalso(respuestas: (number | Error)[]) {
  const procesarPendientes = vi.fn(() => {
    const respuesta = respuestas.shift() ?? 0;
    return respuesta instanceof Error
      ? Promise.reject(respuesta)
      : Promise.resolve(respuesta);
  });
  const esperarEntregas = vi.fn(() => Promise.resolve());
  return {
    despachador: {
      procesarPendientes,
      esperarEntregas,
    } as unknown as DespachadorDeEventos,
    procesarPendientes,
    esperarEntregas,
  };
}

describe('SondeoDelOutbox', () => {
  let registrarError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    registrarError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con intervalo 0 no arranca', async () => {
    const { despachador, procesarPendientes } = despachadorFalso([]);
    const sondeo = new SondeoDelOutbox(despachador, 0);
    sondeo.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(procesarPendientes).not.toHaveBeenCalled();
  });

  it('da la primera vuelta al arrancar y luego espera el intervalo si no hubo eventos', async () => {
    const { despachador, procesarPendientes } = despachadorFalso([]);
    const sondeo = new SondeoDelOutbox(despachador, 1_000);
    sondeo.iniciar();

    await vi.advanceTimersByTimeAsync(0);
    expect(procesarPendientes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(procesarPendientes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(procesarPendientes).toHaveBeenCalledTimes(2);

    await sondeo.detener();
  });

  it('si una vuelta encontró eventos, la siguiente empieza sin esperar', async () => {
    const { despachador, procesarPendientes } = despachadorFalso([
      50, 50, 3, 0,
    ]);
    const sondeo = new SondeoDelOutbox(despachador, 1_000);
    sondeo.iniciar();

    // Tres vueltas con eventos y una vacía, todo en menos de 10 ms (el intervalo es de 1 s).
    await vi.advanceTimersByTimeAsync(10);
    expect(procesarPendientes).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(procesarPendientes).toHaveBeenCalledTimes(5);

    await sondeo.detener();
  });

  it('un error en una vuelta se registra y el sondeo sigue', async () => {
    const { despachador, procesarPendientes } = despachadorFalso([
      new Error('la base no responde'),
    ]);
    const sondeo = new SondeoDelOutbox(despachador, 1_000);
    sondeo.iniciar();

    await vi.advanceTimersByTimeAsync(0);
    expect(registrarError).toHaveBeenCalledWith(
      expect.stringContaining('la base no responde'),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(procesarPendientes).toHaveBeenCalledTimes(2);

    await sondeo.detener();
  });

  it('al apagar deja de dar vueltas y espera las entregas en curso', async () => {
    const { despachador, procesarPendientes, esperarEntregas } =
      despachadorFalso([]);
    const sondeo = new SondeoDelOutbox(despachador, 1_000);
    sondeo.iniciar();
    await vi.advanceTimersByTimeAsync(0);

    await sondeo.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(procesarPendientes).toHaveBeenCalledTimes(1);
    expect(esperarEntregas).toHaveBeenCalledTimes(1);
  });

  it('iniciar dos veces no crea dos ciclos', async () => {
    const { despachador, procesarPendientes } = despachadorFalso([]);
    const sondeo = new SondeoDelOutbox(despachador, 1_000);
    sondeo.iniciar();
    sondeo.iniciar();

    await vi.advanceTimersByTimeAsync(0);
    expect(procesarPendientes).toHaveBeenCalledTimes(1);

    await sondeo.detener();
  });
});
