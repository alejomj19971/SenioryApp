import { DispersarLiquidaciones } from '../../../../src/pagos/aplicacion/casos-de-uso/dispersar-liquidaciones.js';
import {
  ConsultarPagos,
  ListarMisLiquidaciones,
  ListarPaquetes,
  ObtenerMiBolsa,
} from '../../../../src/pagos/aplicacion/casos-de-uso/consultas.js';
import type { RepositorioLiquidaciones } from '../../../../src/pagos/aplicacion/puertos/salida/repositorios.js';
import type {
  RepositorioBolsas,
  RepositorioPaquetes,
} from '../../../../src/pagos/aplicacion/puertos/salida/repositorios.js';
import { Bolsa } from '../../../../src/pagos/dominio/bolsa.js';
import type {
  BolsaId,
  LiquidacionId,
} from '../../../../src/pagos/dominio/ids.js';
import { Liquidacion } from '../../../../src/pagos/dominio/liquidacion.js';
import {
  DispersorDeshabilitado,
  DispersorSimulado,
} from '../../../../src/pagos/infraestructura/salida/dispersion/dispersores.js';
import {
  AuditoriaEnMemoria,
  RelojFalso,
  UnidadDeTrabajoEnMemoria,
} from '../../../soporte/dobles.js';
import { idDePrueba } from '../../../soporte/identidad.js';

const AHORA = new Date('2030-06-10T15:00:00.000Z');

describe('ListarPaquetes', () => {
  it('sin paquetes aprobados la lista va vacía: no se inventa ninguno', async () => {
    const repositorio = {
      listarActivos: () => Promise.resolve([]),
    } as unknown as RepositorioPaquetes;

    expect(await new ListarPaquetes(repositorio).ejecutar()).toEqual([]);
  });
});

describe('ObtenerMiBolsa y ConsultarPagos', () => {
  const sinBolsa = {
    buscarPorFamiliar: () => Promise.resolve(null),
  } as unknown as RepositorioBolsas;

  it('una familia sin bolsa la tiene en cero, sin movimientos', async () => {
    expect(await new ObtenerMiBolsa(sinBolsa).ejecutar('familia')).toEqual({
      saldoDisponible: 0,
      saldoReservado: 0,
      movimientos: [],
    });
  });

  it('una familia sin bolsa no alcanza para nada', async () => {
    expect(
      await new ConsultarPagos(sinBolsa).bolsaAlcanzaPara('familia', 1),
    ).toBe(false);
  });

  it('con bolsa, alcanza si el disponible cubre el monto', async () => {
    const bolsa = Bolsa.reconstruir({
      id: idDePrueba<'Bolsa'>() as BolsaId,
      familiarId: 'familia',
      saldoDisponible: 50_000,
      saldoReservado: 900_000,
      version: 3,
      creadaEn: AHORA,
      actualizadaEn: AHORA,
    });
    const repositorio = {
      buscarPorFamiliar: () => Promise.resolve(bolsa),
    } as unknown as RepositorioBolsas;
    const consulta = new ConsultarPagos(repositorio);

    expect(await consulta.bolsaAlcanzaPara('familia', 50_000)).toBe(true);
    expect(await consulta.bolsaAlcanzaPara('familia', 50_001)).toBe(false);
  });
});

describe('ListarMisLiquidaciones', () => {
  it('una cuenta que no es de un cuidador no tiene liquidaciones, y ni siquiera se consultan', async () => {
    const consultadas: string[] = [];
    const repositorio = {
      listarDeCuidador: (id: string) => {
        consultadas.push(id);
        return Promise.resolve([]);
      },
    } as unknown as RepositorioLiquidaciones;
    const directorio = {
      obtenerCuidadorPorUsuario: () => Promise.resolve(null),
    } as never;

    const lista = await new ListarMisLiquidaciones(
      repositorio,
      directorio,
    ).ejecutar('usuario');

    expect(lista).toEqual([]);
    expect(consultadas).toEqual([]);
  });
});

describe('DispersarLiquidaciones', () => {
  function pendientes(cantidad: number): Liquidacion[] {
    return Array.from({ length: cantidad }, () =>
      Liquidacion.crear({
        id: idDePrueba<'Liquidacion'>() as LiquidacionId,
        cuidadorId: idDePrueba<'Cuidador'>(),
        servicioId: idDePrueba<'Servicio'>(),
        monto: 36_000,
        ahora: AHORA,
      }),
    );
  }

  // Un repositorio en memoria con una cola de pendientes.
  function repositorioCon(cola: Liquidacion[]) {
    const guardadas: Liquidacion[] = [];
    let reclamos = 0;
    const repositorio = {
      reclamarSiguientePendiente: () => {
        reclamos += 1;
        return Promise.resolve(cola.shift() ?? null);
      },
      actualizar: (liquidacion: Liquidacion) => {
        guardadas.push(liquidacion);
        return Promise.resolve();
      },
    } as unknown as RepositorioLiquidaciones;
    return { repositorio, guardadas, reclamos: () => reclamos };
  }

  const casoDeUso = (
    repositorio: RepositorioLiquidaciones,
    dispersor: DispersorSimulado | DispersorDeshabilitado,
    auditoria = new AuditoriaEnMemoria(),
  ) =>
    new DispersarLiquidaciones(
      repositorio,
      dispersor,
      new UnidadDeTrabajoEnMemoria(),
      auditoria,
      new RelojFalso(AHORA),
    );

  it('sin dispersor no intenta nada: las liquidaciones siguen pendientes, a la vista', async () => {
    const { repositorio, guardadas, reclamos } = repositorioCon(pendientes(3));

    const resultado = await casoDeUso(
      repositorio,
      new DispersorDeshabilitado(),
    ).ejecutar();

    expect(resultado).toEqual({
      pagadas: 0,
      enviadas: 0,
      rechazadas: 0,
      interrumpida: false,
    });
    expect(reclamos()).toBe(0);
    expect(guardadas).toEqual([]);
  });

  it('paga una por una hasta vaciar la cola y deja rastro de cada pago', async () => {
    const { repositorio, guardadas } = repositorioCon(pendientes(3));
    const auditoria = new AuditoriaEnMemoria();

    const resultado = await casoDeUso(
      repositorio,
      new DispersorSimulado(),
      auditoria,
    ).ejecutar();

    expect(resultado).toMatchObject({ pagadas: 3, interrumpida: false });
    expect(guardadas.every((l) => l.estado === 'pagada')).toBe(true);
    expect(auditoria.entradas.map((e) => e.accion)).toEqual([
      'pagos.dispersar_liquidacion',
      'pagos.dispersar_liquidacion',
      'pagos.dispersar_liquidacion',
    ]);
  });

  it('no paga más de 20 por ronda', async () => {
    const { repositorio, guardadas } = repositorioCon(pendientes(25));

    const resultado = await casoDeUso(
      repositorio,
      new DispersorSimulado(),
    ).ejecutar();

    expect(resultado.pagadas).toBe(20);
    expect(guardadas).toHaveLength(20);
  });

  it('una orden que el proveedor deja «en camino» queda enviada, no pagada', async () => {
    const { repositorio, guardadas } = repositorioCon(pendientes(1));
    const enCamino = {
      habilitado: true,
      dispersar: () =>
        Promise.resolve({ estado: 'enviada', referencia: 'r-1' }),
    } as unknown as DispersorSimulado;

    const resultado = await casoDeUso(repositorio, enCamino).ejecutar();

    expect(resultado).toMatchObject({ enviadas: 1, pagadas: 0 });
    expect(guardadas[0]).toMatchObject({
      estado: 'enviada',
      referenciaDispersion: 'r-1',
      pagadaEn: null,
    });
  });

  it('un rechazo definitivo se anota como error en la auditoría y sigue con las demás', async () => {
    const cola = pendientes(2);
    const { repositorio, guardadas } = repositorioCon(cola);
    const dispersor = new DispersorSimulado();
    dispersor.rechazarLiquidacion(cola[0]?.id as string);
    const auditoria = new AuditoriaEnMemoria();

    const resultado = await casoDeUso(
      repositorio,
      dispersor,
      auditoria,
    ).ejecutar();

    expect(resultado).toMatchObject({ rechazadas: 1, pagadas: 1 });
    expect(guardadas.map((l) => l.estado)).toEqual(['fallida', 'pagada']);
    expect(auditoria.entradas.map((e) => e.resultado)).toEqual([
      'error',
      'permitido',
    ]);
  });

  it('un error pasajero detiene la ronda sin dejar nada a medias', async () => {
    const { repositorio, guardadas, reclamos } = repositorioCon(pendientes(3));
    const dispersor = new DispersorSimulado();
    dispersor.fallarPasajeramente(true);

    const resultado = await casoDeUso(repositorio, dispersor).ejecutar();

    expect(resultado).toEqual({
      pagadas: 0,
      enviadas: 0,
      rechazadas: 0,
      interrumpida: true,
    });
    expect(guardadas).toEqual([]);
    expect(reclamos()).toBe(1);
  });
});
