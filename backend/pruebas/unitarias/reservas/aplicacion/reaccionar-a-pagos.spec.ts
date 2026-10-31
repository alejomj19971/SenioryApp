import type {
  PagoAprobado,
  PagoRechazado,
} from '../../../../src/compartido/eventos/pagos.js';
import {
  CancelarServicioPorPagoFallido,
  RegistrarPagoDelServicio,
} from '../../../../src/reservas/aplicacion/manejadores/reaccionar-a-pagos.js';
import type { RepositorioServicios } from '../../../../src/reservas/aplicacion/puertos/salida/repositorio-servicios.js';
import { EventosDeReservas } from '../../../../src/reservas/aplicacion/servicios/eventos-de-reservas.js';
import type { Servicio } from '../../../../src/reservas/dominio/servicio.js';
import {
  GeneradorDeIdsSecuencial,
  PublicadorDeEventosEnMemoria,
  RelojFalso,
} from '../../../soporte/dobles.js';
import { AHORA_RESERVAS, servicioEn } from '../../../soporte/reservas.js';

const OTRO_MOMENTO = new Date('2026-10-21T16:00:00.000Z');

// Un repositorio con un solo servicio guardado, que anota lo que se actualiza.
function repositorioCon(servicio: Servicio | null) {
  const actualizados: Servicio[] = [];
  const repositorio = {
    buscarPorIdParaActualizar: () => Promise.resolve(servicio),
    actualizar: (cambiado: Servicio) => {
      actualizados.push(cambiado);
      return Promise.resolve();
    },
  } as unknown as RepositorioServicios;
  return { repositorio, actualizados };
}

const pagoAprobado = (servicioId: string | null): PagoAprobado => ({
  id: 'evento-1',
  tipo: 'pagos.pago_aprobado',
  version: 1,
  ocurridoEn: AHORA_RESERVAS.toISOString(),
  idDeCorrelacion: 'correlacion',
  datos: { pagoId: 'pago-1', pagadorId: 'familia-1', servicioId },
});

const pagoRechazado = (servicioId: string | null): PagoRechazado => ({
  id: 'evento-2',
  tipo: 'pagos.pago_rechazado',
  version: 1,
  ocurridoEn: AHORA_RESERVAS.toISOString(),
  idDeCorrelacion: 'correlacion',
  datos: {
    pagoId: 'pago-1',
    pagadorId: 'familia-1',
    servicioId,
    motivo: 'expirado',
  },
});

describe('RegistrarPagoDelServicio', () => {
  const reloj = new RelojFalso(OTRO_MOMENTO);

  it('anota el pago en el servicio y lo guarda', async () => {
    const servicio = servicioEn('aceptado');
    const { repositorio, actualizados } = repositorioCon(servicio);

    await new RegistrarPagoDelServicio(repositorio, reloj).manejar(
      pagoAprobado(servicio.id),
    );

    expect(servicio.pagadoEn).toEqual(OTRO_MOMENTO);
    expect(actualizados).toEqual([servicio]);
  });

  it('el pago de una bolsa no es de ningún servicio: no hace nada', async () => {
    const { repositorio, actualizados } = repositorioCon(
      servicioEn('aceptado'),
    );

    await new RegistrarPagoDelServicio(repositorio, reloj).manejar(
      pagoAprobado(null),
    );

    expect(actualizados).toEqual([]);
  });

  it('un servicio que ya no existe no tiene nada que anotar', async () => {
    const { repositorio, actualizados } = repositorioCon(null);

    await new RegistrarPagoDelServicio(repositorio, reloj).manejar(
      pagoAprobado('servicio-perdido'),
    );

    expect(actualizados).toEqual([]);
  });

  it('un servicio ya pagado o cancelado no se guarda otra vez', async () => {
    const pagado = servicioEn('aceptado');
    pagado.registrarPago(AHORA_RESERVAS);
    const cancelado = servicioEn('cancelado');

    for (const servicio of [pagado, cancelado]) {
      const { repositorio, actualizados } = repositorioCon(servicio);

      await new RegistrarPagoDelServicio(repositorio, reloj).manejar(
        pagoAprobado(servicio.id),
      );

      expect(actualizados).toEqual([]);
    }
    expect(pagado.pagadoEn).toEqual(AHORA_RESERVAS);
    expect(cancelado.pagadoEn).toBeNull();
  });
});

describe('CancelarServicioPorPagoFallido', () => {
  const reloj = new RelojFalso(OTRO_MOMENTO);

  function manejadorCon(servicio: Servicio | null) {
    const { repositorio, actualizados } = repositorioCon(servicio);
    const publicador = new PublicadorDeEventosEnMemoria();
    const eventos = new EventosDeReservas(
      publicador,
      new GeneradorDeIdsSecuencial(),
      { idDeCorrelacion: () => 'correlacion' } as never,
    );
    return {
      manejador: new CancelarServicioPorPagoFallido(
        repositorio,
        eventos,
        reloj,
      ),
      actualizados,
      publicador,
    };
  }

  it('cancela un servicio aceptado con motivo «pago_fallido» y lo anuncia', async () => {
    const servicio = servicioEn('aceptado');
    const { manejador, actualizados, publicador } = manejadorCon(servicio);

    await manejador.manejar(pagoRechazado(servicio.id));

    expect(servicio).toMatchObject({
      estado: 'cancelado',
      motivoDeCancelacion: 'pago_fallido',
      canceladoEn: OTRO_MOMENTO,
    });
    expect(actualizados).toEqual([servicio]);
    expect(publicador.deTipo('reservas.servicio_cancelado')[0]?.datos).toEqual({
      servicioId: servicio.id,
      familiarId: servicio.familiarId,
      cuidadorId: servicio.cuidadorId,
      adultoMayorId: servicio.adultoMayorId,
      motivo: 'pago_fallido',
      horasDeAnticipacion: null,
    });
  });

  it('el pago de una bolsa no es de ningún servicio: no hace nada', async () => {
    const { manejador, actualizados, publicador } = manejadorCon(
      servicioEn('aceptado'),
    );

    await manejador.manejar(pagoRechazado(null));

    expect(actualizados).toEqual([]);
    expect(publicador.eventos).toEqual([]);
  });

  it.each(['solicitado', 'en_curso', 'finalizado', 'cancelado'] as const)(
    'un servicio %s se deja como está',
    async (estado) => {
      const servicio = servicioEn(estado);
      const { manejador, actualizados, publicador } = manejadorCon(servicio);

      await manejador.manejar(pagoRechazado(servicio.id));

      expect(servicio.estado).toBe(estado);
      expect(actualizados).toEqual([]);
      expect(publicador.eventos).toEqual([]);
    },
  );

  it('un servicio que ya no existe no tiene nada que cancelar', async () => {
    const { manejador, actualizados, publicador } = manejadorCon(null);

    await manejador.manejar(pagoRechazado('servicio-perdido'));

    expect(actualizados).toEqual([]);
    expect(publicador.eventos).toEqual([]);
  });
});
