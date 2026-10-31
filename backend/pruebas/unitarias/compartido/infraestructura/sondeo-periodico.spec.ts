import { SondeoPeriodico } from '../../../../src/compartido/infraestructura/sondeo-periodico.js';

function trabajoFalso(
  respuesta: () => Promise<number> = () => Promise.resolve(0),
) {
  let vueltas = 0;
  return {
    trabajo: () => {
      vueltas += 1;
      return respuesta();
    },
    vueltas: () => vueltas,
  };
}

describe('SondeoPeriodico', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('con intervalo 0 no arranca nunca (solo pruebas)', async () => {
    const { trabajo, vueltas } = trabajoFalso();
    const sondeo = new SondeoPeriodico('prueba', trabajo, 0);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await sondeo.detener();

    expect(vueltas()).toBe(0);
  });

  it('da una vuelta cada intervalo cuando no hubo trabajo', async () => {
    const { trabajo, vueltas } = trabajoFalso();
    const sondeo = new SondeoPeriodico('prueba', trabajo, 5_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(4_999);
    const antes = vueltas();
    await vi.advanceTimersByTimeAsync(1);
    const primera = vueltas();
    await vi.advanceTimersByTimeAsync(5_000);
    const segunda = vueltas();
    await sondeo.detener();

    expect([antes, primera, segunda]).toEqual([0, 1, 2]);
  });

  it('si una vuelta hizo trabajo, la siguiente empieza de inmediato', async () => {
    const respuestas = [3, 2, 0, 0];
    const { trabajo, vueltas } = trabajoFalso(() =>
      Promise.resolve(respuestas.shift() ?? 0),
    );
    const sondeo = new SondeoPeriodico('prueba', trabajo, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_010); // la primera vuelta y, de inmediato, las dos siguientes
    const alTerminar = vueltas();
    await vi.advanceTimersByTimeAsync(59_000);
    const antesDelIntervalo = vueltas();
    await sondeo.detener();

    // Hubo trabajo en las dos primeras: la tercera encontró vacío y recién entonces esperó el intervalo.
    expect(alTerminar).toBe(3);
    expect(antesDelIntervalo).toBe(3);
  });

  it('una vuelta nunca empieza antes de que termine la anterior', async () => {
    let enCurso = 0;
    let maximo = 0;
    const { trabajo } = trabajoFalso(async () => {
      enCurso += 1;
      maximo = Math.max(maximo, enCurso);
      await new Promise((resolver) => setTimeout(resolver, 150_000));
      enCurso -= 1;
      return 1; // hubo trabajo: quiere repetir ya
    });
    const sondeo = new SondeoPeriodico('prueba', trabajo, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(900_000);
    const detenido = sondeo.detener();
    await vi.advanceTimersByTimeAsync(200_000);
    await detenido;

    expect(maximo).toBe(1);
  });

  it('si una vuelta falla, sigue con la siguiente', async () => {
    let llamadas = 0;
    const { trabajo, vueltas } = trabajoFalso(() => {
      llamadas += 1;
      return llamadas === 1
        ? Promise.reject(new Error('la base no responde'))
        : Promise.resolve(0);
    });
    const sondeo = new SondeoPeriodico('prueba', trabajo, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(180_000);
    await sondeo.detener();

    expect(vueltas()).toBeGreaterThanOrEqual(3);
  });

  it('detenerlo corta las vueltas siguientes', async () => {
    const { trabajo, vueltas } = trabajoFalso();
    const sondeo = new SondeoPeriodico('prueba', trabajo, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    await sondeo.detener();
    const alDetener = vueltas();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(vueltas()).toBe(alDetener);
  });

  it('arrancarlo dos veces no duplica el temporizador', async () => {
    const { trabajo, vueltas } = trabajoFalso();
    const sondeo = new SondeoPeriodico('prueba', trabajo, 60_000);

    sondeo.onApplicationBootstrap();
    sondeo.iniciar();
    await vi.advanceTimersByTimeAsync(60_000);
    await sondeo.detener();

    expect(vueltas()).toBe(1);
  });

  it('se detiene antes de cerrar la aplicación', async () => {
    const { trabajo, vueltas } = trabajoFalso();
    const sondeo = new SondeoPeriodico('prueba', trabajo, 60_000);

    sondeo.onApplicationBootstrap();
    await sondeo.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(vueltas()).toBe(0);
  });
});
