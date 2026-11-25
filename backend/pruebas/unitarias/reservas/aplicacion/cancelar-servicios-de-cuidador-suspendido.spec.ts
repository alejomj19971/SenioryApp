import { describe, expect, it } from 'vitest';
import type { CuidadorSuspendido } from '../../../../src/compartido/eventos/directorio.js';
import { CancelarServiciosDeCuidadorSuspendido } from '../../../../src/reservas/aplicacion/manejadores/cancelar-servicios-de-cuidador-suspendido.js';
import type { RepositorioServicios } from '../../../../src/reservas/aplicacion/puertos/salida/repositorio-servicios.js';
import { EventosDeReservas } from '../../../../src/reservas/aplicacion/servicios/eventos-de-reservas.js';
import type { ServicioId } from '../../../../src/reservas/dominio/ids.js';
import type { Servicio } from '../../../../src/reservas/dominio/servicio.js';
import {
  GeneradorDeIdsSecuencial,
  PublicadorDeEventosEnMemoria,
  RelojFalso,
} from '../../../soporte/dobles.js';
import {
  AHORA_RESERVAS,
  CUIDADOR_ID,
  servicioEn,
} from '../../../soporte/reservas.js';

const OTRO_MOMENTO = new Date('2026-10-21T16:00:00.000Z');

const suspendido: CuidadorSuspendido = {
  id: 'evento-1',
  tipo: 'directorio.cuidador_suspendido',
  version: 1,
  ocurridoEn: AHORA_RESERVAS.toISOString(),
  idDeCorrelacion: 'correlacion',
  datos: { cuidadorId: CUIDADOR_ID },
};

// Un repositorio con los servicios dados (todos del cuidador): anota lo que se actualiza y qué cuidador se consultó.
function repositorioCon(servicios: Servicio[]) {
  const actualizados: Servicio[] = [];
  const consultados: string[] = [];
  const repositorio = {
    listarPendientesDeCuidador: (cuidadorId: string) => {
      consultados.push(cuidadorId);
      return Promise.resolve(servicios.map((s) => s.id as ServicioId));
    },
    buscarPorIdParaActualizar: (id: ServicioId) =>
      Promise.resolve(servicios.find((s) => s.id === id) ?? null),
    actualizar: (cambiado: Servicio) => {
      actualizados.push(cambiado);
      return Promise.resolve();
    },
  } as unknown as RepositorioServicios;
  return { repositorio, actualizados, consultados };
}

function manejadorCon(servicios: Servicio[]) {
  const publicador = new PublicadorDeEventosEnMemoria();
  const { repositorio, actualizados, consultados } = repositorioCon(servicios);
  const eventos = new EventosDeReservas(
    publicador,
    new GeneradorDeIdsSecuencial(),
    { idDeCorrelacion: () => 'correlacion' },
  );
  const manejador = new CancelarServiciosDeCuidadorSuspendido(
    repositorio,
    eventos,
    new RelojFalso(OTRO_MOMENTO),
  );
  return { manejador, publicador, actualizados, consultados };
}

describe('CancelarServiciosDeCuidadorSuspendido', () => {
  it('cancela los servicios solicitados y aceptados con motivo «cuidador_suspendido» y avisa de cada uno', async () => {
    const solicitado = servicioEn('solicitado');
    const aceptado = servicioEn('aceptado');
    const { manejador, publicador, actualizados, consultados } = manejadorCon([
      solicitado,
      aceptado,
    ]);

    await manejador.manejar(suspendido);

    expect(consultados).toEqual([CUIDADOR_ID]);
    for (const servicio of [solicitado, aceptado]) {
      expect(servicio.estado).toBe('cancelado');
      expect(servicio.motivoDeCancelacion).toBe('cuidador_suspendido');
      expect(servicio.canceladoPor).toBeNull();
      expect(servicio.canceladoEn).toEqual(OTRO_MOMENTO);
    }
    expect(actualizados).toEqual([solicitado, aceptado]);
    expect(publicador.eventos.map((e) => e.tipo)).toEqual([
      'reservas.servicio_cancelado',
      'reservas.servicio_cancelado',
    ]);
    expect(publicador.eventos[0]?.datos).toMatchObject({
      servicioId: solicitado.id,
      motivo: 'cuidador_suspendido',
      horasDeAnticipacion: null,
    });
  });

  it('un servicio que cambió entre la lista y el bloqueo (ya en curso o cancelado) no se toca', async () => {
    const enCurso = servicioEn('en_curso');
    const cancelado = servicioEn('cancelado');
    const { manejador, publicador, actualizados } = manejadorCon([
      enCurso,
      cancelado,
    ]);

    await manejador.manejar(suspendido);

    expect(enCurso.estado).toBe('en_curso');
    expect(actualizados).toEqual([]);
    expect(publicador.eventos).toEqual([]);
  });

  it('sin servicios pendientes no hace nada', async () => {
    const { manejador, publicador, actualizados } = manejadorCon([]);

    await manejador.manejar(suspendido);

    expect(actualizados).toEqual([]);
    expect(publicador.eventos).toEqual([]);
  });
});
