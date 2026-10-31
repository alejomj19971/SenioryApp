import type {
  ExpirarSolicitudes,
  ResultadoDeExpiracion,
} from '../../../../src/reservas/aplicacion/casos-de-uso/expirar-solicitudes.js';
import { SondeoDeExpiraciones } from '../../../../src/reservas/infraestructura/entrada/programado/sondeo-de-expiraciones.js';

function casoFalso(
  respuesta: () => Promise<ResultadoDeExpiracion> = () =>
    Promise.resolve({ expiradas: 0, fallidas: 0 }),
) {
  let vueltas = 0;
  const caso = {
    ejecutar: () => {
      vueltas += 1;
      return respuesta();
    },
  } as unknown as ExpirarSolicitudes;
  return { caso, vueltas: () => vueltas };
}

describe('SondeoDeExpiraciones', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('con intervalo 0 no arranca nunca (solo pruebas)', async () => {
    const { caso, vueltas } = casoFalso();
    const sondeo = new SondeoDeExpiraciones(caso, 0);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await sondeo.detener();

    expect(vueltas()).toBe(0);
  });

  it('da una vuelta cada intervalo', async () => {
    const { caso, vueltas } = casoFalso();
    const sondeo = new SondeoDeExpiraciones(caso, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(59_999);
    const antes = vueltas();
    await vi.advanceTimersByTimeAsync(1);
    const primera = vueltas();
    await vi.advanceTimersByTimeAsync(60_000);
    const segunda = vueltas();
    await sondeo.detener();

    expect([antes, primera, segunda]).toEqual([0, 1, 2]);
  });

  it('una vuelta nunca empieza antes de que termine la anterior', async () => {
    let enCurso = 0;
    let maximoSimultaneas = 0;
    const { caso } = casoFalso(async () => {
      enCurso += 1;
      maximoSimultaneas = Math.max(maximoSimultaneas, enCurso);
      await new Promise((resolver) => setTimeout(resolver, 150_000));
      enCurso -= 1;
      return { expiradas: 0, fallidas: 0 };
    });
    const sondeo = new SondeoDeExpiraciones(caso, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(600_000);
    // La última vuelta puede seguir en curso: se deja correr el tiempo para que termine.
    const detenido = sondeo.detener();
    await vi.advanceTimersByTimeAsync(200_000);
    await detenido;

    expect(maximoSimultaneas).toBe(1);
  });

  it('si una vuelta falla, sigue con la siguiente', async () => {
    let llamadas = 0;
    const { caso, vueltas } = casoFalso(() => {
      llamadas += 1;
      return llamadas === 1
        ? Promise.reject(new Error('la base no responde'))
        : Promise.resolve({ expiradas: 1, fallidas: 0 });
    });
    const sondeo = new SondeoDeExpiraciones(caso, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(180_000);
    await sondeo.detener();

    expect(vueltas()).toBeGreaterThanOrEqual(3);
  });

  it('detenerlo corta las vueltas siguientes y espera la que está en curso', async () => {
    const { caso, vueltas } = casoFalso();
    const sondeo = new SondeoDeExpiraciones(caso, 60_000);

    sondeo.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    await sondeo.detener();
    const alDetener = vueltas();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(vueltas()).toBe(alDetener);
  });

  it('arrancarlo dos veces no duplica el temporizador', async () => {
    const { caso, vueltas } = casoFalso();
    const sondeo = new SondeoDeExpiraciones(caso, 60_000);

    sondeo.onApplicationBootstrap();
    sondeo.iniciar();
    await vi.advanceTimersByTimeAsync(60_000);
    await sondeo.detener();

    expect(vueltas()).toBe(1);
  });

  it('se detiene antes de cerrar la aplicación', async () => {
    const { caso, vueltas } = casoFalso();
    const sondeo = new SondeoDeExpiraciones(caso, 60_000);

    sondeo.onApplicationBootstrap();
    await sondeo.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(vueltas()).toBe(0);
  });
});
